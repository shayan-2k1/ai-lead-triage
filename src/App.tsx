import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, ArrowDown, ArrowUp, Inbox, LogOut, Mail, MessageSquare, PhoneMissed, RotateCcw, Send, Archive, FileText } from 'lucide-react'
import { COMPANY, TEAMS, type Channel, type InboundMessage, type Team } from './data'
import { classify, draftReply, route, RULE_TESTS, type Classification, type Urgency } from './classifier'
import { buildItem, loadDomain, permsFor, saveItems, saveRules, store, type Item, type Permissions, type RuleState, type Status, type Tab } from './repo'
import { audit, recentAudit, type User } from './lib/auth'

const URGENCY_ORDER: Record<Urgency, number> = { Emergency: 0, High: 1, Normal: 2, Low: 3 }

const channelIcon = (c: Channel) =>
  c === 'Email' ? <Mail size={14} aria-hidden /> : c === 'SMS' ? <MessageSquare size={14} aria-hidden /> : c === 'Web form' ? <FileText size={14} aria-hidden /> : <PhoneMissed size={14} aria-hidden />

const ago = (m: number) => (m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`)

const TAB_LABELS: Record<Tab, string> = { inbox: 'Inbox', insights: 'Insights', rules: 'Routing rules', try: 'Try a message' }

export default function App({ user, onSignOut, onReset }: { user: User; onSignOut: () => void; onReset: () => void }) {
  const perms = permsFor(user.role)
  const visible = (i: Item) => perms.teams === 'all' || (perms.teams as Team[]).includes(i.team)
  const [{ items, rules }, setState] = useState(loadDomain)
  const [tab, setTab] = useState<Tab>('inbox')
  const [selectedId, setSelectedId] = useState<string>(() => {
    const open = loadDomain().items.filter((i) => i.status === 'Needs review' && visible(i))
    return open.sort((a, b) => URGENCY_ORDER[a.cls.urgency] - URGENCY_ORDER[b.cls.urgency] || a.msg.receivedMinutesAgo - b.msg.receivedMinutesAgo)[0]?.msg.id ?? ''
  })
  const [teamFilter, setTeamFilter] = useState<Team | 'All open' | 'Done'>('All open')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => saveItems(items), [items])
  useEffect(() => saveRules(rules), [rules])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast])

  const updateItem = (id: string, patch: Partial<Item>) =>
    setState((s) => ({ ...s, items: s.items.map((i) => (i.msg.id === id ? { ...i, ...patch } : i)) }))

  const setRules = (next: RuleState[], change: string) => {
    audit(store, user.id, 'Changed routing rules', change)
    setState((s) => ({
      rules: next,
      items: s.items.map((i) => {
        if (i.manualTeam || i.status !== 'Needs review') return i
        const r = route(i.cls, next)
        return { ...i, team: r.team, ruleId: r.ruleId }
      }),
    }))
  }

  const addMessage = (msg: InboundMessage) => {
    const item = buildItem(msg, rules)
    audit(store, user.id, 'Added a test message', `Routed to ${item.team}`)
    setState((s) => ({ ...s, items: [item, ...s.items] }))
    setTeamFilter('All open')
    setTab('inbox')
    if (visible(item)) {
      setSelectedId(msg.id)
      setToast(`Added to inbox and routed to ${item.team}`)
    } else setToast(`Added and routed to ${item.team}, which is outside your queues`)
  }

  const mine = items.filter(visible)
  const openCount = mine.filter((i) => i.status === 'Needs review').length
  const emergencies = mine.filter((i) => i.status === 'Needs review' && i.cls.urgency === 'Emergency').length

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <Inbox size={18} />
          </span>
          <div>
            <strong>Switchboard</strong>
            <span className="brand-sub">{COMPANY.name}</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {perms.tabs.map((t) => (
            <button key={t} className={tab === t ? 'tab active' : 'tab'} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
              {t === 'inbox' ? `${TAB_LABELS[t]} (${openCount})` : TAB_LABELS[t]}
            </button>
          ))}
        </nav>
        <div className="userbox">
          <span className="who">
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </span>
          {perms.reset && (
            <button className="ghost small" onClick={onReset} title="Delete the database and start again with the sample data">
              <RotateCcw size={14} aria-hidden /> Reset demo
            </button>
          )}
          <button className="ghost small" onClick={onSignOut}>
            <LogOut size={14} aria-hidden /> Sign out
          </button>
        </div>
      </header>

      {emergencies > 0 && tab === 'inbox' && (
        <div className="alertbar" role="status">
          <AlertTriangle size={16} aria-hidden /> {emergencies} emergency {emergencies === 1 ? 'message is' : 'messages are'} waiting. Emergencies are pinned to the top of the queue.
        </div>
      )}

      <main className="main">
        {tab === 'inbox' && (
          <InboxView
            items={mine}
            perms={perms}
            user={user}
            rules={rules}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            teamFilter={teamFilter}
            setTeamFilter={setTeamFilter}
            updateItem={updateItem}
            onToast={setToast}
          />
        )}
        {tab === 'insights' && perms.tabs.includes('insights') && <InsightsView items={items} showActivity={perms.seeActivity} />}
        {tab === 'rules' && perms.editRules && <RulesView rules={rules} setRules={setRules} items={items} />}
        {tab === 'try' && <TryView rules={rules} onAdd={addMessage} />}
      </main>

      <footer className="foot">
        Demo with fictional data. Users, sessions, messages, routing rules and the activity log live in a SQLite database that runs in your browser and is saved on this device, so nothing you type leaves this page. Messages are classified by a transparent rules model; in production the same screen calls an LLM (OpenAI or Claude), uses a hosted database and connects to the real inbox, phone system and CRM. Every reply still waits for a person to approve it.
      </footer>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

/* ---------------- Inbox ---------------- */

function InboxView(props: {
  items: Item[]
  perms: Permissions
  user: User
  rules: RuleState[]
  selectedId: string
  setSelectedId: (id: string) => void
  teamFilter: Team | 'All open' | 'Done'
  setTeamFilter: (t: Team | 'All open' | 'Done') => void
  updateItem: (id: string, patch: Partial<Item>) => void
  onToast: (t: string) => void
}) {
  const { items, perms, user, rules, selectedId, setSelectedId, teamFilter, setTeamFilter, updateItem, onToast } = props
  const teamChips = (perms.teams === 'all' ? (['Dispatch', 'Sales', 'Billing', 'Customer care'] as Team[]) : perms.teams).filter((t) => t !== 'Ignore')
  const chips: (Team | 'All open' | 'Done')[] = teamChips.length > 1 ? ['All open', ...teamChips, 'Done'] : ['All open', 'Done']

  const filtered = useMemo(() => {
    const list = items.filter((i) =>
      teamFilter === 'All open'
        ? i.status === 'Needs review'
        : teamFilter === 'Done'
          ? i.status !== 'Needs review'
          : i.status === 'Needs review' && i.team === teamFilter,
    )
    return list.sort(
      (a, b) => URGENCY_ORDER[a.cls.urgency] - URGENCY_ORDER[b.cls.urgency] || a.msg.receivedMinutesAgo - b.msg.receivedMinutesAgo,
    )
  }, [items, teamFilter])

  const selected = items.find((i) => i.msg.id === selectedId) ?? filtered[0]

  const counts = (t: Team) => items.filter((i) => i.status === 'Needs review' && i.team === t).length

  const handle = (item: Item, status: Status) => {
    const edited = item.draft.trim() !== item.originalDraft.trim()
    const finalStatus: Status = status === 'Sent' && edited ? 'Edited & sent' : status
    updateItem(item.msg.id, { status: finalStatus, responseMinutes: item.msg.receivedMinutesAgo, handledBy: user.name })
    audit(store, user.id, finalStatus === 'Archived' ? 'Archived a message' : finalStatus === 'Edited & sent' ? 'Edited and sent a reply' : 'Sent a reply', `${item.msg.from === 'Unknown' ? item.msg.contact : item.msg.from}: ${item.cls.intent}`)
    onToast(finalStatus === 'Archived' ? 'Archived' : `Reply sent to ${item.msg.from === 'Unknown' ? item.msg.contact : item.msg.from}`)
    const next = filtered.find((i) => i.msg.id !== item.msg.id)
    if (next) setSelectedId(next.msg.id)
  }

  return (
    <div className="inbox">
      <section className="queue" aria-label="Message queue">
        <div className="filters" role="group" aria-label="Filter by team">
          {chips.map((f) => (
            <button key={f} className={teamFilter === f ? 'chip on' : 'chip'} aria-pressed={teamFilter === f} onClick={() => setTeamFilter(f)}>
              {f}
              {f !== 'All open' && f !== 'Done' && <span className="count">{counts(f)}</span>}
            </button>
          ))}
        </div>
        <ul className="queue-list">
          {filtered.length === 0 && (
            <li className="empty">
              Nothing here. {teamFilter === 'Done' ? 'Messages you send or archive appear here.' : 'This queue is clear.'}
            </li>
          )}
          {filtered.map((i) => (
            <li key={i.msg.id}>
              <button
                className={`qitem u-${i.cls.urgency.toLowerCase()} ${selected?.msg.id === i.msg.id ? 'sel' : ''}`}
                onClick={() => setSelectedId(i.msg.id)}
                aria-current={selected?.msg.id === i.msg.id}
              >
                <span className="qtop">
                  <span className="qfrom">{i.msg.from === 'Unknown' ? i.msg.contact : i.msg.from}</span>
                  <span className="qtime">{ago(i.msg.receivedMinutesAgo)}</span>
                </span>
                <span className="qsubj">{i.msg.subject ?? i.msg.body}</span>
                <span className="qmeta">
                  <span className={`urg u-${i.cls.urgency.toLowerCase()}`}>{i.cls.urgency}</span>
                  <span>{i.cls.intent}</span>
                  <span className="qteam">{i.status === 'Needs review' ? i.team : i.status}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected ? (
        <>
          <section className="detail" aria-label="Message">
            <div className="msg-head">
              <span className="channel">
                {channelIcon(selected.msg.channel)} {selected.msg.channel}
              </span>
              <span className="muted">{ago(selected.msg.receivedMinutesAgo)}</span>
            </div>
            <h2 className="msg-from">{selected.msg.from}</h2>
            <p className="muted contact">{selected.msg.contact}</p>
            {selected.msg.subject && <h3 className="msg-subj">{selected.msg.subject}</h3>}
            <blockquote className="msg-body">{selected.msg.body}</blockquote>

            {selected.cls.safetyNote && (
              <div className="safety" role="alert">
                <AlertTriangle size={18} aria-hidden />
                <p>{selected.cls.safetyNote}</p>
              </div>
            )}

            <Analysis cls={selected.cls} />
          </section>

          <section className="action" aria-label="Routing and reply">
            <label className="field">
              <span>Routed to</span>
              <select
                value={selected.team}
                disabled={selected.status !== 'Needs review'}
                onChange={(e) => {
                  updateItem(selected.msg.id, { team: e.target.value as Team, manualTeam: true, ruleId: null })
                  audit(store, user.id, 'Reassigned a message', `${selected.msg.from} to ${e.target.value}`)
                  onToast(`Reassigned to ${e.target.value}`)
                }}
              >
                {TEAMS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <p className="rule-why">
              {selected.manualTeam
                ? 'Reassigned by hand.'
                : selected.ruleId
                  ? `Matched rule: ${rules.find((r) => r.id === selected.ruleId)?.label}.`
                  : 'No rule matched, so it went to the default queue.'}
            </p>

            <label className="field grow">
              <span>Suggested reply</span>
              <textarea
                value={selected.draft}
                disabled={selected.status !== 'Needs review'}
                onChange={(e) => updateItem(selected.msg.id, { draft: e.target.value })}
                rows={9}
              />
            </label>
            {/\[check/.test(selected.draft) && selected.status === 'Needs review' && (
              <p className="hint">Fill in the parts marked [check] before sending.</p>
            )}

            {selected.status === 'Needs review' ? (
              <div className="btnrow">
                <button className="primary" onClick={() => handle(selected, 'Sent')} disabled={/\[check/.test(selected.draft)}>
                  <Send size={15} aria-hidden /> Approve and send
                </button>
                <button className="ghost" onClick={() => handle(selected, 'Archived')}>
                  <Archive size={15} aria-hidden /> Archive
                </button>
              </div>
            ) : (
              <div className="done-note">
                {selected.status}
                {selected.handledBy ? ` by ${selected.handledBy}` : ''}
                <button className="link" onClick={() => updateItem(selected.msg.id, { status: 'Needs review' })}>
                  Move back to queue
                </button>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="detail empty-detail">Select a message from the queue.</section>
      )}
    </div>
  )
}

function Analysis({ cls }: { cls: Classification }) {
  const pct = Math.round(cls.intentConfidence * 100)
  return (
    <div className="analysis">
      <dl className="facts">
        <div>
          <dt>Intent</dt>
          <dd>
            {cls.intent}
            <span className={`conf ${pct < 60 ? 'low' : ''}`} title="How clearly the message matched this intent over the next best one">
              <span className="conf-track" aria-hidden>
                <span className="conf-bar" style={{ width: `${pct}%` }} />
              </span>
              {pct}% sure
            </span>
          </dd>
        </div>
        <div>
          <dt>Urgency</dt>
          <dd>
            <span className={`urg u-${cls.urgency.toLowerCase()}`}>{cls.urgency}</span>
          </dd>
        </div>
        <div>
          <dt>Service</dt>
          <dd>{cls.serviceLine}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{cls.location ?? 'Not stated'}</dd>
        </div>
        <div>
          <dt>Tone</dt>
          <dd>{cls.sentiment}</dd>
        </div>
        {cls.leadScore !== null && (
          <div>
            <dt>Lead score</dt>
            <dd>
              <strong>{cls.leadScore}</strong> / 100
            </dd>
          </div>
        )}
      </dl>
      {pct < 60 && <p className="hint">Low confidence. Check the intent before you send anything.</p>}
      <details className="why" open>
        <summary>Why it was classified this way</summary>
        {cls.signals.length === 0 ? (
          <p className="muted">No strong signals found. Treated as a general service request.</p>
        ) : (
          <ul>
            {cls.signals.map((s, idx) => (
              <li key={idx}>
                <mark>{s.phrase}</mark>
                <span>{s.effect}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  )
}

/* ---------------- Insights ---------------- */

function InsightsView({ items, showActivity }: { items: Item[]; showActivity: boolean }) {
  const activity = showActivity ? recentAudit(store, 25) : []
  const handled = items.filter((i) => i.status === 'Sent' || i.status === 'Edited & sent')
  const unedited = handled.filter((i) => i.status === 'Sent').length
  const avgResp = handled.length ? Math.round(handled.reduce((a, i) => a + (i.responseMinutes ?? 0), 0) / handled.length) : null

  const intents = Object.entries(
    items.reduce<Record<string, number>>((acc, i) => ((acc[i.cls.intent] = (acc[i.cls.intent] ?? 0) + 1), acc), {}),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const teams = (['Dispatch', 'Sales', 'Billing', 'Customer care'] as Team[]).map((t) => ({
    name: t,
    Open: items.filter((i) => i.team === t && i.status === 'Needs review').length,
    Handled: items.filter((i) => i.team === t && i.status !== 'Needs review').length,
  }))

  const leads = items
    .filter((i) => i.cls.intent === 'Quote request')
    .sort((a, b) => (b.cls.leadScore ?? 0) - (a.cls.leadScore ?? 0))

  return (
    <div className="insights">
      <div className="stats">
        <Stat label="Waiting for review" value={items.filter((i) => i.status === 'Needs review').length} />
        <Stat label="Emergencies waiting" value={items.filter((i) => i.status === 'Needs review' && i.cls.urgency === 'Emergency').length} tone="red" />
        <Stat label="Replies sent" value={handled.length} />
        <Stat label="Sent without edits" value={handled.length ? `${Math.round((unedited / handled.length) * 100)}%` : 'None yet'} />
        <Stat label="Average response" value={avgResp === null ? 'None yet' : `${avgResp} min`} />
      </div>

      <div className="charts">
        <figure className="panel">
          <figcaption>What customers are writing about</figcaption>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={intents} layout="vertical" margin={{ left: 20, right: 16 }}>
              <CartesianGrid horizontal={false} stroke="#dfe5ea" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip cursor={{ fill: '#eef3f5' }} />
              <Bar dataKey="count" name="Messages" fill="#1c6f73" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </figure>
        <figure className="panel">
          <figcaption>Workload by team</figcaption>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={teams} margin={{ right: 16 }}>
              <CartesianGrid vertical={false} stroke="#dfe5ea" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip cursor={{ fill: '#eef3f5' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Open" stackId="a" fill="#d8962f" />
              <Bar dataKey="Handled" stackId="a" fill="#1c6f73" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </figure>
      </div>

      <section className="panel">
        <h2 className="panel-title">Quote requests, best leads first</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Request</th>
                <th>Area</th>
                <th className="num">Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.msg.id}>
                  <td>{l.msg.from}</td>
                  <td>{l.msg.subject ?? l.msg.body.slice(0, 60)}</td>
                  <td>{l.cls.location ?? 'Not stated'}</td>
                  <td className="num">
                    <span className="score" style={{ ['--s' as string]: `${l.cls.leadScore}%` }}>
                      {l.cls.leadScore}
                    </span>
                  </td>
                  <td>{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showActivity && (
        <section className="panel">
          <h2 className="panel-title">Activity log</h2>
          <p className="muted small">Every sign-in, reply, reassignment and rule change, read from the audit_log table.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap">{new Date(a.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td>{a.user_name ? `${a.user_name} (${a.user_role})` : 'Unknown user'}</td>
                    <td>{a.action}</td>
                    <td className="muted">{a.detail ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'red' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span className="stat-v">{value}</span>
      <span className="stat-l">{label}</span>
    </div>
  )
}

/* ---------------- Rules ---------------- */

function RulesView({ rules, setRules, items }: { rules: RuleState[]; setRules: (r: RuleState[], change: string) => void; items: Item[] }) {
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...rules]
    const [r] = next.splice(idx, 1)
    next.splice(idx + dir, 0, r)
    setRules(next, `Moved "${r.label}" to position ${idx + dir + 1}`)
  }
  return (
    <div className="rules">
      <div className="rules-intro">
        <h2>Routing rules</h2>
        <p>
          Rules run from top to bottom and the first match decides the team. Change a team or turn a rule off and every message still waiting for review is re-routed straight away. Messages you reassigned by hand keep your choice.
        </p>
      </div>
      <ol className="rule-list">
        {rules.map((r, idx) => {
          const matches = items.filter((i) => RULE_TESTS[r.id]?.(i.cls)).length
          return (
            <li key={r.id} className={r.enabled ? '' : 'off'}>
              <span className="rule-n">{idx + 1}</span>
              <div className="rule-body">
                <span className="rule-label">If {r.label.charAt(0).toLowerCase() + r.label.slice(1)}</span>
                <span className="muted small">
                  {matches} {matches === 1 ? 'message matches' : 'messages match'}
                </span>
              </div>
              <label className="rule-team">
                <span className="sr">Send to team</span>
                <select
                  value={r.team}
                  onChange={(e) => setRules(rules.map((x) => (x.id === r.id ? { ...x, team: e.target.value as Team } : x)), `"${r.label}" now goes to ${e.target.value}`)}
                >
                  {TEAMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => setRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)), `"${r.label}" turned ${e.target.checked ? 'on' : 'off'}`)}
                />
                <span>{r.enabled ? 'On' : 'Off'}</span>
              </label>
              <div className="mover">
                <button className="icon" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`Move rule ${idx + 1} up`}>
                  <ArrowUp size={14} />
                </button>
                <button className="icon" onClick={() => move(idx, 1)} disabled={idx === rules.length - 1} aria-label={`Move rule ${idx + 1} down`}>
                  <ArrowDown size={14} />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ---------------- Try ---------------- */

const EXAMPLES = [
  'Our water heater is leaking all over the garage floor in Plano, can someone come today?',
  'Can you give me a price to replace two old AC units with a heat pump? 2,800 sq ft in Frisco, hoping to do it before summer.',
  'I was billed for a service call that was supposed to be free under my maintenance plan.',
  'There is a smell of gas in the laundry room and my CO alarm is beeping.',
]

function TryView({ rules, onAdd }: { rules: RuleState[]; onAdd: (m: InboundMessage) => void }) {
  const [text, setText] = useState(EXAMPLES[0])
  const [name, setName] = useState('Test customer')
  const msg: InboundMessage = { id: `t-${Date.now()}`, channel: 'Web form', from: name || 'Unknown', contact: 'test@example.com', body: text, receivedMinutesAgo: 0 }
  const cls = useMemo(() => classify({ body: text, contact: '' }), [text])
  const r = route(cls, rules)
  return (
    <div className="try">
      <section className="panel">
        <h2 className="panel-title">Write or paste a customer message</h2>
        <p className="muted">The result updates as you type. Nothing is sent anywhere.</p>
        <label className="field">
          <span>Customer name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Message</span>
          <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="examples">
          <span className="muted small">Try an example:</span>
          {EXAMPLES.map((e, i) => (
            <button key={i} className="chip" onClick={() => setText(e)}>
              Example {i + 1}
            </button>
          ))}
        </div>
        <button className="primary" disabled={!text.trim()} onClick={() => onAdd({ ...msg, id: `t-${Date.now()}` })}>
          Add to inbox
        </button>
      </section>
      <section className="panel">
        <h2 className="panel-title">Result</h2>
        {cls.safetyNote && (
          <div className="safety" role="alert">
            <AlertTriangle size={18} aria-hidden />
            <p>{cls.safetyNote}</p>
          </div>
        )}
        <p className="route-to">
          Goes to <strong>{r.team}</strong>
        </p>
        <Analysis cls={cls} />
        <h3 className="sub">Suggested reply</h3>
        <p className="draft-preview">{draftReply(msg, cls)}</p>
      </section>
    </div>
  )
}
