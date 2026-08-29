import { Session } from '@supabase/supabase-js'
import { useState } from 'react'
import { Hash, Users, Settings, LogOut, Mic, MicOff } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Props {
  session: Session
}

export default function AppLayout({ session }: Props) {
  const [activeChannel, setActiveChannel] = useState('general')

  const channels = [
    { id: 'general', name: 'general' },
    { id: 'gaming', name: 'gaming' },
    { id: 'memes', name: 'memes' },
    { id: 'music', name: 'music' },
    { id: 'random', name: 'random' },
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="h-full flex bg-bat-bg text-bat-text">
      {/* Far left - Server / Group */}
      <div className="w-16 bg-bat-bg border-r border-bat-border flex flex-col items-center py-3 gap-2">
        <div className="w-11 h-11 rounded-2xl bg-bat-accent flex items-center justify-center text-black font-bold text-lg shadow-lg">
          B
        </div>
        <div className="w-8 h-0.5 bg-bat-border rounded-full my-1" />
      </div>

      {/* Channels sidebar */}
      <div className="w-56 bg-bat-surface flex flex-col">
        <div className="h-12 px-4 flex items-center border-b border-bat-border shadow-sm">
          <h2 className="font-semibold text-sm tracking-wide">Boys at the Back</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs font-semibold text-bat-muted uppercase px-2 mb-1 tracking-wider">
            Text Channels
          </div>
          {channels.map(ch => (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
                activeChannel === ch.id
                  ? 'bg-bat-elevated text-bat-text'
                  : 'text-bat-muted hover:bg-bat-elevated/60 hover:text-bat-text'
              }`}
            >
              <Hash size={16} className="opacity-70" />
              {ch.name}
            </button>
          ))}

          <div className="text-xs font-semibold text-bat-muted uppercase px-2 mt-4 mb-1 tracking-wider">
            Voice (Phase 2)
          </div>
          <div className="px-2 py-1.5 text-sm text-bat-muted flex items-center gap-2 opacity-50">
            <Mic size={16} />
            Lounge
          </div>
        </div>

        {/* Bottom user bar */}
        <div className="h-14 bg-bat-elevated border-t border-bat-border px-2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-bat-accent/20 flex items-center justify-center text-bat-accent font-medium text-sm">
            {(session.user.user_metadata?.username || session.user.email?.[0] || 'U').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {session.user.user_metadata?.username || 'User'}
            </div>
            <div className="text-xs text-bat-success flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-bat-success"></span>
              Online
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded hover:bg-bat-border text-bat-muted hover:text-bat-text transition"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-12 px-4 flex items-center border-b border-bat-border shadow-sm">
          <Hash size={18} className="text-bat-muted mr-2" />
          <span className="font-semibold">{activeChannel}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-end">
          <div className="text-center text-bat-muted text-sm py-8">
            Welcome to <span className="text-bat-accent">#{activeChannel}</span>.
            <br />
            This is the beginning of the channel.
          </div>
        </div>

        <div className="p-4 pt-0">
          <div className="bg-bat-elevated rounded-xl px-4 py-3 flex items-center gap-3 border border-bat-border">
            <input
              type="text"
              placeholder={`Message #${activeChannel}`}
              className="flex-1 bg-transparent outline-none text-bat-text placeholder:text-bat-muted"
              disabled
            />
            <span className="text-xs text-bat-muted">Coming soon</span>
          </div>
        </div>
      </div>

      {/* Members sidebar */}
      <div className="w-52 bg-bat-surface border-l border-bat-border hidden md:flex flex-col">
        <div className="h-12 px-4 flex items-center border-b border-bat-border">
          <Users size={16} className="text-bat-muted mr-2" />
          <span className="text-sm font-medium text-bat-muted">Members</span>
        </div>
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="text-xs font-semibold text-bat-muted uppercase mb-2 tracking-wider">
            Online — 1
          </div>
          <div className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-bat-elevated/50">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-bat-accent/20 flex items-center justify-center text-bat-accent text-sm font-medium">
                {(session.user.user_metadata?.username || 'U')[0].toUpperCase()}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-bat-success rounded-full border-2 border-bat-surface"></span>
            </div>
            <span className="text-sm truncate">
              {session.user.user_metadata?.username || 'You'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}