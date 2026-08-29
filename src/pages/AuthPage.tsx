import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        if (!username.trim()) {
          setError('Username is required')
          setLoading(false)
          return
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.trim() }
          }
        })
        if (error) throw error

        // Create profile after signup
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username: username.trim(),
            status: 'online'
          })
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-bat-bg p-4">
      <div className="w-full max-w-md bg-bat-surface border border-bat-border rounded-2xl p-8 shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-bat-accent tracking-tight">Boys at the Back</h1>
          <p className="text-bat-muted mt-2">Private hangout for the boys</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm text-bat-muted mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-bat-elevated border border-bat-border text-bat-text focus:outline-none focus:border-bat-accent"
                placeholder="cool_username"
                required={!isLogin}
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-bat-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-bat-elevated border border-bat-border text-bat-text focus:outline-none focus:border-bat-accent"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-bat-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-bat-elevated border border-bat-border text-bat-text focus:outline-none focus:border-bat-accent"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="text-bat-danger text-sm bg-bat-danger/10 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-bat-accent hover:bg-bat-accentHover text-black font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isLogin ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        <p className="text-center text-bat-muted text-sm mt-6">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button
            onClick={() => { setIsLogin(!isLogin); setError('') }}
            className="ml-1 text-bat-accent hover:underline"
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  )
}