import { useEffect, useState, type FormEvent } from 'react'
import { Inbox, LogIn } from 'lucide-react'
import App from './App'
import { COMPANY } from './data'
import { DEMO_PASSWORD, DEMO_USERS, seedIfNew, store, TOKEN_KEY } from './repo'
import { currentUser, signIn, signOut, type User } from './lib/auth'

let opening: Promise<void> | null = null
function openOnce() {
  opening ??= store.open().then(seedIfNew)
  return opening
}

export default function Root() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    openOnce()
      .then(() => {
        setUser(currentUser(store, TOKEN_KEY))
        setPhase('ready')
      })
      .catch((e) => {
        console.error(e)
        setPhase('error')
      })
  }, [])

  if (phase === 'loading') return <div className="boot">Opening the database…</div>
  if (phase === 'error')
    return <div className="boot">The database couldn't be opened in this browser. Try a current version of Chrome, Edge, Firefox or Safari.</div>

  if (!user) return <Login onSignedIn={setUser} />

  return (
    <App
      key={user.id}
      user={user}
      onSignOut={() => {
        signOut(store, TOKEN_KEY, user)
        setUser(null)
      }}
      onReset={async () => {
        await store.destroy()
        location.reload()
      }}
    />
  )
}

function Login({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      onSignedIn(await signIn(store, TOKEN_KEY, email, password))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand dark">
          <span className="logo" aria-hidden>
            <Inbox size={18} />
          </span>
          <div>
            <strong>Switchboard</strong>
            <span className="brand-sub">{COMPANY.name}</span>
          </div>
        </div>
        <h1>Sign in</h1>
        <form onSubmit={submit} noValidate>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            <LogIn size={15} aria-hidden /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <aside className="demo-accounts" aria-label="Demo accounts">
        <h2>Demo accounts</h2>
        <p className="muted">
          Each role sees different queues and screens. All use the password <code>{DEMO_PASSWORD}</code>.
        </p>
        <ul>
          {DEMO_USERS.map((u) => (
            <li key={u.email}>
              <button
                type="button"
                className="acct"
                onClick={() => {
                  setEmail(u.email)
                  setPassword(u.password)
                  setError(null)
                }}
              >
                <span className="acct-top">
                  <strong>{u.role}</strong>
                  <span>{u.name}</span>
                </span>
                <span className="acct-email">{u.email}</span>
                <span className="acct-blurb">{u.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">Clicking an account fills in the form. Passwords are stored as salted PBKDF2 hashes in the app's SQLite database.</p>
      </aside>
    </div>
  )
}
