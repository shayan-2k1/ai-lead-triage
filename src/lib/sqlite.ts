// Small SQLite wrapper: sql.js (SQLite compiled to WebAssembly) running in the browser,
// with the database file saved to IndexedDB so data survives reloads.
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

export type Row = Record<string, SqlValue>

const STORE = 'files'

function idb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(dbName: string, key: string): Promise<Uint8Array | undefined> {
  try {
    const conn = await idb(dbName)
    return await new Promise((resolve, reject) => {
      const req = conn.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result as Uint8Array | undefined)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined
  }
}

async function idbPut(dbName: string, key: string, value: Uint8Array | null): Promise<void> {
  try {
    const conn = await idb(dbName)
    await new Promise<void>((resolve, reject) => {
      const tx = conn.transaction(STORE, 'readwrite')
      if (value) tx.objectStore(STORE).put(value, key)
      else tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* storage unavailable (private mode): the database still works for this visit */
  }
}

export class SqliteStore {
  db!: Database
  private timer: number | undefined
  private readonly name: string
  private readonly migrate: (s: SqliteStore) => void
  constructor(name: string, migrate: (s: SqliteStore) => void) {
    this.name = name
    this.migrate = migrate
  }

  /** Opens the saved database, or creates a new one. Returns true when it was newly created. */
  async open(): Promise<boolean> {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl, useOldExtensionFunctions: false })
    const saved = await idbGet(this.name, 'main.sqlite')
    this.db = saved ? new SQL.Database(saved) : new SQL.Database()
    this.db.run('PRAGMA foreign_keys = ON')
    this.migrate(this)
    return !saved
  }

  all<T = Row>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    stmt.free()
    return rows
  }

  get<T = Row>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  run(sql: string, params: SqlValue[] = []) {
    this.db.run(sql, params)
    this.save()
  }

  /** Runs several statements atomically. */
  tx(fn: () => void) {
    this.db.run('BEGIN')
    try {
      fn()
      this.db.run('COMMIT')
    } catch (e) {
      this.db.run('ROLLBACK')
      throw e
    }
    this.save()
  }

  /** Writes the database file to IndexedDB shortly after the last change. */
  save() {
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => void idbPut(this.name, 'main.sqlite', this.db.export()), 150)
  }

  async destroy() {
    clearTimeout(this.timer)
    await idbPut(this.name, 'main.sqlite', null)
  }
}

/* ---------- password hashing and sessions (Web Crypto) ---------- */

const enc = new TextEncoder()
const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export function newSalt() {
  return hex(crypto.getRandomValues(new Uint8Array(16)))
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120_000, hash: 'SHA-256' }, key, 256)
  return hex(bits)
}

export function newToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)))
}

/** Constant-time comparison so a wrong hash takes as long to reject as a nearly right one. */
export function sameHash(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
