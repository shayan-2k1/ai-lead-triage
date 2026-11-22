// Switchboard's tables, demo users, role permissions, and load/save between SQLite and the UI.
import { SEED_MESSAGES, type Channel, type InboundMessage, type Team } from './data'
import { classify, DEFAULT_RULES, draftReply, route, type Classification } from './classifier'
import { SqliteStore } from './lib/sqlite'
import { authSchema, seedUsers, type SeedUser } from './lib/auth'

export type Status = 'Needs review' | 'Sent' | 'Edited & sent' | 'Archived'

export interface Item {
  msg: InboundMessage
  cls: Classification
  team: Team
  ruleId: string | null
  manualTeam: boolean
  status: Status
  draft: string
  originalDraft: string
  responseMinutes?: number
  handledBy?: string
}

export interface RuleState {
  id: string
  label: string
  team: Team
  enabled: boolean
}

export type Tab = 'inbox' | 'insights' | 'rules' | 'try'

export type Role = 'Manager' | 'Dispatcher' | 'Sales rep' | 'Billing & care'

export interface Permissions {
  teams: Team[] | 'all'
  tabs: Tab[]
  editRules: boolean
  reset: boolean
  seeActivity: boolean
}

export const PERMISSIONS: Record<Role, Permissions> = {
  Manager: { teams: 'all', tabs: ['inbox', 'insights', 'rules', 'try'], editRules: true, reset: true, seeActivity: true },
  Dispatcher: { teams: ['Dispatch'], tabs: ['inbox', 'try'], editRules: false, reset: false, seeActivity: false },
  'Sales rep': { teams: ['Sales'], tabs: ['inbox', 'try'], editRules: false, reset: false, seeActivity: false },
  'Billing & care': { teams: ['Billing', 'Customer care'], tabs: ['inbox', 'try'], editRules: false, reset: false, seeActivity: false },
}

export const permsFor = (role: string): Permissions => PERMISSIONS[role as Role] ?? PERMISSIONS.Dispatcher

export const DEMO_PASSWORD = 'demo1234'
export const DEMO_USERS: (SeedUser & { blurb: string })[] = [
  { email: 'manager@ridgeline.example', name: 'Ana Ruiz', role: 'Manager', password: DEMO_PASSWORD, blurb: 'Sees every queue, edits routing rules, views the activity log' },
  { email: 'dispatch@ridgeline.example', name: 'Luis Ortega', role: 'Dispatcher', password: DEMO_PASSWORD, blurb: 'Only the Dispatch queue' },
  { email: 'sales@ridgeline.example', name: 'Megan Price', role: 'Sales rep', password: DEMO_PASSWORD, blurb: 'Only the Sales queue' },
  { email: 'care@ridgeline.example', name: 'Jamal Wright', role: 'Billing & care', password: DEMO_PASSWORD, blurb: 'Billing and Customer care queues' },
]

export const TOKEN_KEY = 'switchboard-session'

function schema(s: SqliteStore) {
  authSchema(s)
  s.db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id                   TEXT PRIMARY KEY,
      channel              TEXT NOT NULL,
      from_name            TEXT NOT NULL,
      contact              TEXT NOT NULL,
      subject              TEXT,
      body                 TEXT NOT NULL,
      received_minutes_ago INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS triage (
      message_id       TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      team             TEXT NOT NULL,
      rule_id          TEXT,
      manual_team      INTEGER NOT NULL DEFAULT 0,
      status           TEXT NOT NULL,
      draft            TEXT NOT NULL,
      original_draft   TEXT NOT NULL,
      response_minutes INTEGER,
      handled_by       TEXT
    );
    CREATE TABLE IF NOT EXISTS routing_rules (
      id       TEXT PRIMARY KEY,
      position INTEGER NOT NULL,
      label    TEXT NOT NULL,
      team     TEXT NOT NULL,
      enabled  INTEGER NOT NULL
    );
  `)
}

export const store = new SqliteStore('switchboard-db', schema)

export function buildItem(msg: InboundMessage, rules: RuleState[]): Item {
  const cls = classify(msg)
  const r = route(cls, rules)
  const draft = draftReply(msg, cls)
  return { msg, cls, team: r.team, ruleId: r.ruleId, manualTeam: false, status: r.team === 'Ignore' ? 'Archived' : 'Needs review', draft, originalDraft: draft }
}

export async function seedIfNew(isNew: boolean) {
  if (!isNew) return
  await seedUsers(store, DEMO_USERS)
  const rules = DEFAULT_RULES.map((r) => ({ ...r, enabled: true }))
  saveRules(rules)
  saveItems(SEED_MESSAGES.map((m) => buildItem(m, rules)))
}

export function loadDomain(): { items: Item[]; rules: RuleState[] } {
  const rules = store
    .all<{ id: string; label: string; team: Team; enabled: number }>('SELECT id, label, team, enabled FROM routing_rules ORDER BY position')
    .map((r) => ({ ...r, enabled: !!r.enabled }))
  const rows = store.all<{
    id: string
    channel: Channel
    from_name: string
    contact: string
    subject: string | null
    body: string
    received_minutes_ago: number
    team: Team
    rule_id: string | null
    manual_team: number
    status: Status
    draft: string
    original_draft: string
    response_minutes: number | null
    handled_by: string | null
  }>('SELECT m.*, t.team, t.rule_id, t.manual_team, t.status, t.draft, t.original_draft, t.response_minutes, t.handled_by FROM messages m JOIN triage t ON t.message_id = m.id')
  const items: Item[] = rows.map((r) => {
    const msg: InboundMessage = {
      id: r.id,
      channel: r.channel,
      from: r.from_name,
      contact: r.contact,
      subject: r.subject ?? undefined,
      body: r.body,
      receivedMinutesAgo: r.received_minutes_ago,
    }
    return {
      msg,
      cls: classify(msg),
      team: r.team,
      ruleId: r.rule_id,
      manualTeam: !!r.manual_team,
      status: r.status,
      draft: r.draft,
      originalDraft: r.original_draft,
      responseMinutes: r.response_minutes ?? undefined,
      handledBy: r.handled_by ?? undefined,
    }
  })
  return { items, rules }
}

export function saveItems(items: Item[]) {
  store.tx(() => {
    for (const i of items) {
      store.db.run('INSERT OR IGNORE INTO messages (id, channel, from_name, contact, subject, body, received_minutes_ago) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        i.msg.id,
        i.msg.channel,
        i.msg.from,
        i.msg.contact,
        i.msg.subject ?? null,
        i.msg.body,
        i.msg.receivedMinutesAgo,
      ])
      store.db.run(
        `INSERT INTO triage (message_id, team, rule_id, manual_team, status, draft, original_draft, response_minutes, handled_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET team = excluded.team, rule_id = excluded.rule_id, manual_team = excluded.manual_team,
           status = excluded.status, draft = excluded.draft, response_minutes = excluded.response_minutes, handled_by = excluded.handled_by`,
        [i.msg.id, i.team, i.ruleId, i.manualTeam ? 1 : 0, i.status, i.draft, i.originalDraft, i.responseMinutes ?? null, i.handledBy ?? null],
      )
    }
  })
}

export function saveRules(rules: RuleState[]) {
  store.tx(() => {
    store.db.run('DELETE FROM routing_rules')
    rules.forEach((r, idx) => store.db.run('INSERT INTO routing_rules (id, position, label, team, enabled) VALUES (?, ?, ?, ?, ?)', [r.id, idx, r.label, r.team, r.enabled ? 1 : 0]))
  })
}
