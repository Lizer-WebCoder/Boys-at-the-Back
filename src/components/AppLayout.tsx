import { Session } from '@supabase/supabase-js'
import { useState, useEffect, useRef } from 'react'
import { Hash, Users, LogOut, Mic, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

interface Props {
  session: Session
}

interface Channel {
  id: string
  name: string
  type: string
}

interface Message {
  id: string
  content: string
  author_id: string
  created_at: string
  profiles?: {
    username: string
    avatar_url: string | null
  }
}

interface Profile {
  id: string
  username: string
  avatar_url: string | null
  status: string
}

export default function AppLayout({ session }: Props) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const username = session.user.user_metadata?.username || 'User'

  // Ensure profile exists + create group/channels if needed
  useEffect(() => {
    async function init() {
      // 1. Ensure profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (!existingProfile) {
        await supabase.from('profiles').upsert({
          id: session.user.id,
          username: username,
          status: 'online'
        })
      } else {
        // Set online
        await supabase
          .from('profiles')
          .update({ status: 'online' })
          .eq('id', session.user.id)
      }

      // 2. Check if group exists
      let { data: groups } = await supabase.from('groups').select('*').limit(1)

      let groupId: string

      if (!groups || groups.length === 0) {
        // Create the private group
        const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase()
        const { data: newGroup, error } = await supabase
          .from('groups')
          .insert({
            name: 'Boys at the Back',
            invite_code: inviteCode,
            created_by: session.user.id
          })
          .select()
          .single()

        if (error || !newGroup) {
          console.error('Failed to create group', error)
          setLoading(false)
          return
        }

        groupId = newGroup.id

        // Add creator as owner
        await supabase.from('group_members').insert({
          group_id: groupId,
          user_id: session.user.id,
          role: 'owner'
        })

        // Create default channels
        const defaultChannels = ['general', 'gaming', 'memes', 'music', 'random']
        await supabase.from('channels').insert(
          defaultChannels.map((name, i) => ({
            group_id: groupId,
            name,
            type: 'text',
            position: i
          }))
        )
      } else {
        groupId = groups[0].id

        // Make sure current user is a member
        const { data: membership } = await supabase
          .from('group_members')
          .select('*')
          .eq('group_id', groupId)
          .eq('user_id', session.user.id)
          .single()

        if (!membership) {
          await supabase.from('group_members').insert({
            group_id: groupId,
            user_id: session.user.id,
            role: 'member'
          })
        }
      }

      // 3. Load channels
      const { data: channelData } = await supabase
        .from('channels')
        .select('*')
        .eq('group_id', groupId)
        .eq('type', 'text')
        .order('position')

      if (channelData && channelData.length > 0) {
        setChannels(channelData)
        setActiveChannelId(channelData[0].id)
      }

      // 4. Load members
      const { data: memberData } = await supabase
        .from('group_members')
        .select('user_id, profiles(id, username, avatar_url, status)')
        .eq('group_id', groupId)

      if (memberData) {
        const profiles = memberData
          .map((m: any) => m.profiles)
          .filter(Boolean) as Profile[]
        setMembers(profiles)
      }

      setLoading(false)
    }

    init()

    // Set offline on leave
    return () => {
      supabase
        .from('profiles')
        .update({ status: 'offline' })
        .eq('id', session.user.id)
        .then()
    }
  }, [session.user.id])

  // Load messages + realtime when channel changes
  useEffect(() => {
    if (!activeChannelId) return

    async function loadMessages() {
      const { data } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          author_id,
          created_at,
          profiles (username, avatar_url)
        `)
        .eq('channel_id', activeChannelId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (data) setMessages(data as any)
    }

    loadMessages()

    // Realtime subscription
    const channel = supabase
      .channel(`messages:${activeChannelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${activeChannelId}`
        },
        async (payload) => {
          // Fetch the full message with profile
          const { data } = await supabase
            .from('messages')
            .select(`
              id,
              content,
              author_id,
              created_at,
              profiles (username, avatar_url)
            `)
            .eq('id', payload.new.id)
            .single()

          if (data) {
            setMessages(prev => {
              if (prev.some(m => m.id === data.id)) return prev
              return [...prev, data as any]
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeChannelId])

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newMessage.trim() || !activeChannelId || sending) return

    setSending(true)
    const content = newMessage.trim()
    setNewMessage('')

    const { error } = await supabase.from('messages').insert({
      channel_id: activeChannelId,
      author_id: session.user.id,
      content
    })

    if (error) {
      console.error(error)
      setNewMessage(content) // restore on error
    }
    setSending(false)
  }

  const handleLogout = async () => {
    await supabase.from('profiles').update({ status: 'offline' }).eq('id', session.user.id)
    await supabase.auth.signOut()
  }

  const activeChannel = channels.find(c => c.id === activeChannelId)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-bat-bg">
        <div className="text-bat-muted">Loading the hangout...</div>
      </div>
    )
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
              onClick={() => setActiveChannelId(ch.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
                activeChannelId === ch.id
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
            {username[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{username}</div>
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
          <span className="font-semibold">{activeChannel?.name || 'general'}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="text-center text-bat-muted text-sm py-8">
              Welcome to <span className="text-bat-accent">#{activeChannel?.name}</span>.
              <br />
              This is the beginning of the channel. Send the first message!
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-3 mb-4 group">
              <div className="w-9 h-9 rounded-full bg-bat-accent/20 flex items-center justify-center text-bat-accent font-medium text-sm flex-shrink-0">
                {(msg.profiles?.username || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm">{msg.profiles?.username || 'Unknown'}</span>
                  <span className="text-xs text-bat-muted">
                    {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                  </span>
                </div>
                <div className="text-bat-text text-[15px] leading-relaxed break-words">
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className="p-4 pt-0">
          <div className="bg-bat-elevated rounded-xl px-4 py-3 flex items-center gap-3 border border-bat-border">
            <input
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder={`Message #${activeChannel?.name || 'channel'}`}
              className="flex-1 bg-transparent outline-none text-bat-text placeholder:text-bat-muted"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="p-1.5 rounded-lg bg-bat-accent text-black disabled:opacity-40 hover:bg-bat-accentHover transition"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>

      {/* Members sidebar */}
      <div className="w-52 bg-bat-surface border-l border-bat-border hidden md:flex flex-col">
        <div className="h-12 px-4 flex items-center border-b border-bat-border">
          <Users size={16} className="text-bat-muted mr-2" />
          <span className="text-sm font-medium text-bat-muted">Members</span>
        </div>
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="text-xs font-semibold text-bat-muted uppercase mb-2 tracking-wider">
            Online — {members.filter(m => m.status === 'online').length || 1}
          </div>
          {members.length === 0 ? (
            <div className="flex items-center gap-2 px-1 py-1.5">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-bat-accent/20 flex items-center justify-center text-bat-accent text-sm font-medium">
                  {username[0]?.toUpperCase()}
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-bat-success rounded-full border-2 border-bat-surface"></span>
              </div>
              <span className="text-sm truncate">{username}</span>
            </div>
          ) : (
            members.map(m => (
              <div key={m.id} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-bat-elevated/50">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-bat-accent/20 flex items-center justify-center text-bat-accent text-sm font-medium">
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bat-surface ${
                    m.status === 'online' ? 'bg-bat-success' : 'bg-bat-muted'
                  }`}></span>
                </div>
                <span className="text-sm truncate">{m.username}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
