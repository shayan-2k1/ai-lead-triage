// Users, sessions and an audit log stored in the app's SQLite database.
import { hashPassword, newSalt, newToken, sameHash, type SqliteStore } from './sqlite'

export interface User {
  id: number
  email: string
  name: string
  role: string
}

export interface SeedUser {
  email: string
  name: string
  role: string
  password: string
}

const SESSION_HOURS = 8
let memoryToken: string | null = null

export function authSchema(s: SqliteStore) {
  s.db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action  TEXT NOT NULL,
      detail  TEXT
    );
  `)
}

export async function seedUsers(s: SqliteStore, users: SeedUser[]) {
  for (const u of users) {
    const salt = newSalt()
    const hash = await hashPassword(u.password, salt)
    s.db.run('INSERT OR IGNORE INTO users (email, name, role, password_hash, salt) VALUES (?, ?, ?, ?, ?)', [u.email, u.name, u.role, hash, salt])
  }
  s.save()
}

export function audit(s: SqliteStore, userId: number | null, action: string, detail?: string) {
  s.run('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)', [userId, action, detail ?? null])
}

function readToken(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return memoryToken
  }
}
function writeToken(key: string, token: string | null) {
  memoryToken = token
  try {
    if (token) localStorage.setItem(key, token)
    else localStorage.removeItem(key)
  } catch {
    /* fall back to memory */
  }
}

export async function signIn(s: SqliteStore, tokenKey: string, email: string, password: string): Promise<User> {
  const row = s.get<{ id: number; email: string; name: string; role: string; password_hash: string; salt: string }>(
    'SELECT id, email, name, role, password_hash, salt FROM users WHERE email = ?',
    [email.trim()],
  )
  // Hash even when the user doesn't exist, so the response time doesn't reveal which emails are registered.
  const hash = await hashPassword(password, row?.salt ?? 'no-such-user')
  if (!row || !sameHash(hash, row.password_hash)) {
    audit(s, row?.id ?? null, 'Failed sign-in', email.trim().toLowerCase())
    throw new Error('Email or password is incorrect.')
  }
  const token = newToken()
  s.tx(() => {
    s.db.run("DELETE FROM sessions WHERE expires_at < datetime('now')")
    s.db.run(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_HOURS} hours'))`, [token, row.id])
    s.db.run('INSERT INTO audit_log (user_id, action) VALUES (?, ?)', [row.id, 'Signed in'])
  })
  writeToken(tokenKey, token)
  return { id: row.id, email: row.email, name: row.name, role: row.role }
}

export function currentUser(s: SqliteStore, tokenKey: string): User | null {
  const token = readToken(tokenKey)
  if (!token) return null
  const u = s.get<User>(
    "SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > datetime('now')",
    [token],
  )
  if (!u) writeToken(tokenKey, null)
  return u ?? null
}

export function signOut(s: SqliteStore, tokenKey: string, user: User) {
  const token = readToken(tokenKey)
  s.tx(() => {
    if (token) s.db.run('DELETE FROM sessions WHERE token = ?', [token])
    s.db.run('INSERT INTO audit_log (user_id, action) VALUES (?, ?)', [user.id, 'Signed out'])
  })
  writeToken(tokenKey, null)
}

export interface AuditEntry {
  id: number
  at: string
  action: string
  detail: string | null
  user_name: string | null
  user_role: string | null
}

export function recentAudit(s: SqliteStore, limit = 30): AuditEntry[] {
  return s.all<AuditEntry>(
    'SELECT a.id, a.at, a.action, a.detail, u.name AS user_name, u.role AS user_role FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?',
    [limit],
  )
}
