import { Session } from '@supabase/supabase-js'
import { useState, useEffect, useRef } from 'react'
import { Hash, Users, LogOut, Mic, Send, Pencil, Trash2, Reply, X, Copy, Check } from 'lucide-react'
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
  edited_at?: string | null
  reply_to?: string | null
  profiles?: { username: string; avatar_url: string | null } | null
  reply_message?: { id: string; content: string; profiles?: { username: string } | null } | null
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [needsInvite, setNeedsInvite] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const username = session.user.user_metadata?.username || 'User'

  const loadGroupData = async (gId: string) => {
    setGroupId(gId)

    const { data: group } = await supabase.from('groups').select('invite_code').eq('id', gId).single()
    if (group) setInviteCode(group.invite_code)

    const { data: channelData } = await supabase
      .from('channels')
      .select('*')
      .eq('group_id', gId)
      .eq('type', 'text')
      .order('position')

    if (channelData && channelData.length > 0) {
      setChannels(channelData)
      setActiveChannelId(channelData[0].id)
    }

    const { data: memberData } = await supabase
      .from('group_members')
      .select('user_id, profiles(id, username, avatar_url, status)')
      .eq('group_id', gId)

    if (memberData) {
      const profiles = memberData.map((m: any) => m.profiles).filter(Boolean) as Profile[]
      setMembers(profiles)
    }
  }

  useEffect(() => {
    async function init() {
      // Ensure profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!existingProfile) {
        await supabase.from('profiles').upsert({
          id: session.user.id,
          username,
          status: 'online'
        })
      } else {
        await supabase.from('profiles').update({ status: 'online' }).eq('id', session.user.id)
      }

      // Check groups
      const { data: groups } = await supabase.from('groups').select('*').limit(1)

      if (!groups || groups.length === 0) {
        // First user creates the group
        const code = Math.random().toString(36).substring(2, 10).toUpperCase()
        const { data: newGroup, error } = await supabase
          .from('groups')
          .insert({ name: 'Boys at the Back', invite_code: code, created_by: session.user.id })
          .select()
          .single()

        if (error || !newGroup) {
          console.error(error)
          setLoading(false)
          return
        }

        await supabase.from('group_members').insert({
          group_id: newGroup.id,
          user_id: session.user.id,
          role: 'owner'
        })

        const defaultChannels = ['general', 'gaming', 'memes', 'music', 'random']
        await supabase.from('channels').insert(
          defaultChannels.map((name, i) => ({
            group_id: newGroup.id,
            name,
            type: 'text',
            position: i
          }))
        )

        await loadGroupData(newGroup.id)
        setNeedsInvite(false)
      } else {
        const gId = groups[0].id

        // Check membership
        const { data: membership } = await supabase
          .from('group_members')
          .select('*')
          .eq('group_id', gId)
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (membership) {
          await loadGroupData(gId)
          setNeedsInvite(false)
        } else {
          // Not a member → need invite code
          setGroupId(gId)
          setInviteCode(groups[0].invite_code)
          setNeedsInvite(true)
        }
      }

      setLoading(false)
    }

    init()
    return () => {
      supabase.from('profiles').update({ status: 'offline' }).eq('id', session.user.id).then()
    }
  }, [session.user.id])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!joinCode.trim() || !groupId) return

    setJoining(true)
    setJoinError('')

    // Verify code
    const { data: group } = await supabase
      .from('groups')
      .select('id, invite_code')
      .eq('id', groupId)
      .single()

    if (!group || group.invite_code.toUpperCase() !== joinCode.trim().toUpperCase()) {
      setJoinError('Invalid invite code')
      setJoining(false)
      return
    }

    // Join
    const { error } = await supabase.from('group_members').insert({
      group_id: groupId,
      user_id: session.user.id,
      role: 'member'
    })

    if (error) {
      setJoinError(error.message)
      setJoining(false)
      return
    }

    await loadGroupData(groupId)
    setNeedsInvite(false)
    setJoining(false)
  }

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Messages loading (same as before)
  useEffect(() => {
    if (!activeChannelId || needsInvite) return

    async function loadMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select(`id, content, author_id, created_at, edited_at, reply_to, profiles!author_id (username, avatar_url)`)
        .eq('channel_id', activeChannelId)
        .order('created_at', { ascending: true })
        .limit(150)

      if (error) {
        const { data: simple } = await supabase
          .from('messages')
          .select('id, content, author_id, created_at, edited_at, reply_to')
          .eq('channel_id', activeChannelId)
          .order('created_at', { ascending: true })
          .limit(150)
        if (simple) setMessages(simple as any)
      } else if (data) {
        const withReplies = await Promise.all(
          (data as any[]).map(async (msg) => {
            if (!msg.reply_to) return msg
            const { data: replied } = await supabase
              .from('messages')
              .select('id, content, profiles!author_id (username)')
              .eq('id', msg.reply_to)
              .maybeSingle()
            return { ...msg, reply_message: replied }
          })
        )
        setMessages(withReplies)
      }
    }

    loadMessages()

    const channel = supabase
      .channel(`messages:${activeChannelId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${activeChannelId}`
      }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new as any
          let profile = null
          if (newMsg.author_id) {
            const { data: p } = await supabase.from('profiles').select('username, avatar_url').eq('id', newMsg.author_id).maybeSingle()
            profile = p
          }
          let reply_message = null
          if (newMsg.reply_to) {
            const { data: replied } = await supabase
              .from('messages')
              .select('id, content, profiles!author_id (username)')
              .eq('id', newMsg.reply_to)
              .maybeSingle()
            reply_message = replied
          }
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, { ...newMsg, profiles: profile, reply_message }]
          })
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m))
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeChannelId, needsInvite])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newMessage.trim() || !activeChannelId || sending) return

    setSending(true)
    const content = newMessage.trim()
    setNewMessage('')
    const replyId = replyingTo?.id || null
    setReplyingTo(null)

    const tempId = 'temp-' + Date.now()
    setMessages(prev => [...prev, {
      id: tempId,
      content,
      author_id: session.user.id,
      created_at: new Date().toISOString(),
      profiles: { username, avatar_url: null },
      reply_to: replyId,
      reply_message: replyingTo ? { id: replyingTo.id, content: replyingTo.content, profiles: replyingTo.profiles } : null
    }])

    const { data, error } = await supabase
      .from('messages')
      .insert({ channel_id: activeChannelId, author_id: session.user.id, content, reply_to: replyId })
      .select('id, content, author_id, created_at, reply_to')
      .single()

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setNewMessage(content)
    } else if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data, profiles: { username, avatar_url: null }, reply_message: replyingTo ? { id: replyingTo.id, content: replyingTo.content, profiles: replyingTo.profiles } : null } : m))
    }
    setSending(false)
  }

  const startEdit = (msg: Message) => { setEditingId(msg.id); setEditContent(msg.content) }
  const cancelEdit = () => { setEditingId(null); setEditContent('') }

  const saveEdit = async (id: string) => {
    if (!editContent.trim()) return
    const { error } = await supabase.from('messages').update({ content: editContent.trim(), edited_at: new Date().toISOString() }).eq('id', id)
    if (!error) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, content: editContent.trim(), edited_at: new Date().toISOString() } : m))
      cancelEdit()
    }
  }

  const deleteMessage = async (id: string) => {
    if (!confirm('Delete this message?')) return
    const { error } = await supabase.from('messages').delete().eq('id', id)
    if (!error) setMessages(prev => prev.filter(m => m.id !== id))
  }

  const startReply = (msg: Message) => { setReplyingTo(msg); inputRef.current?.focus() }

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

  // Invite gate for new users
  if (needsInvite) {
    return (
      <div className="h-full flex items-center justify-center bg-bat-bg p-4">
        <div className="w-full max-w-sm bg-bat-surface border border-bat-border rounded-2xl p-8">
          <h2 className="text-xl font-bold text-bat-accent text-center mb-2">Boys at the Back</h2>
          <p className="text-bat-muted text-center text-sm mb-6">Enter the invite code to join the boys</p>

          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="INVITE CODE"
              className="w-full px-4 py-3 rounded-lg bg-bat-elevated border border-bat-border text-center text-lg tracking-widest font-mono outline-none focus:border-bat-accent"
              autoFocus
            />
            {joinError && <p className="text-bat-danger text-sm text-center">{joinError}</p>}
            <button
              type="submit"
              disabled={joining || !joinCode.trim()}
              className="w-full py-2.5 rounded-lg bg-bat-accent hover:bg-bat-accentHover text-black font-semibold disabled:opacity-50"
            >
              {joining ? 'Joining...' : 'Join'}
            </button>
          </form>

          <button onClick={handleLogout} className="w-full mt-4 text-sm text-bat-muted hover:text-bat-text">
            Log out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-bat-bg text-bat-text">
      {/* Far left */}
      <div className="w-16 bg-bat-bg border-r border-bat-border flex flex-col items-center py-3 gap-2">
        <div className="w-11 h-11 rounded-2xl bg-bat-accent flex items-center justify-center text-black font-bold text-lg shadow-lg">B</div>
        <div className="w-8 h-0.5 bg-bat-border rounded-full my-1" />
      </div>

      {/* Channels */}
      <div className="w-56 bg-bat-surface flex flex-col">
        <div className="h-12 px-4 flex items-center border-b border-bat-border shadow-sm">
          <h2 className="font-semibold text-sm tracking-wide">Boys at the Back</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs font-semibold text-bat-muted uppercase px-2 mb-1 tracking-wider">Text Channels</div>
          {channels.map(ch => (
            <button
              key={ch.id}
              onClick={() => { setActiveChannelId(ch.id); setReplyingTo(null); setEditingId(null) }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
                activeChannelId === ch.id ? 'bg-bat-elevated text-bat-text' : 'text-bat-muted hover:bg-bat-elevated/60 hover:text-bat-text'
              }`}
            >
              <Hash size={16} className="opacity-70" />
              {ch.name}
            </button>
          ))}

          <div className="text-xs font-semibold text-bat-muted uppercase px-2 mt-4 mb-1 tracking-wider">Voice (Phase 2)</div>
          <div className="px-2 py-1.5 text-sm text-bat-muted flex items-center gap-2 opacity-50">
            <Mic size={16} /> Lounge
          </div>

          {/* Invite code */}
          <div className="mt-6 px-2">
            <div className="text-xs font-semibold text-bat-muted uppercase mb-1 tracking-wider">Invite Code</div>
            <div className="flex items-center gap-1 bg-bat-elevated rounded-lg px-2 py-1.5">
              <code className="flex-1 text-sm font-mono text-bat-accent tracking-wider">{inviteCode}</code>
              <button onClick={copyInvite} className="p-1 rounded hover:bg-bat-border text-bat-muted hover:text-bat-text" title="Copy">
                {copied ? <Check size={14} className="text-bat-success" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-bat-muted mt-1">Share this with the boys</p>
          </div>
        </div>

        <div className="h-14 bg-bat-elevated border-t border-bat-border px-2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-bat-accent/20 flex items-center justify-center text-bat-accent font-medium text-sm">
            {username[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{username}</div>
            <div className="text-xs text-bat-success flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-bat-success"></span> Online
            </div>
          </div>
          <button onClick={handleLogout} className="p-1.5 rounded hover:bg-bat-border text-bat-muted hover:text-bat-text transition" title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Main chat - same as before */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-12 px-4 flex items-center border-b border-bat-border shadow-sm">
          <Hash size={18} className="text-bat-muted mr-2" />
          <span className="font-semibold">{activeChannel?.name || 'general'}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="text-center text-bat-muted text-sm py-8">
              Welcome to <span className="text-bat-accent">#{activeChannel?.name}</span>.
              <br />Send the first message!
            </div>
          )}

          {messages.map((msg) => {
            const isOwn = msg.author_id === session.user.id
            const isEditing = editingId === msg.id

            return (
              <div key={msg.id} className="flex gap-3 mb-4 group relative">
                <div className="w-9 h-9 rounded-full bg-bat-accent/20 flex items-center justify-center text-bat-accent font-medium text-sm flex-shrink-0">
                  {(msg.profiles?.username || username || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  {msg.reply_message && (
                    <div className="flex items-center gap-1.5 text-xs text-bat-muted mb-1">
                      <Reply size={12} />
                      <span className="font-medium">{msg.reply_message.profiles?.username || 'Someone'}</span>
                      <span className="truncate max-w-[200px]">{msg.reply_message.content}</span>
                    </div>
                  )}
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-sm">{msg.profiles?.username || username}</span>
                    <span className="text-xs text-bat-muted">
                      {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                      {msg.edited_at && <span className="ml-1">(edited)</span>}
                    </span>
                  </div>
                  {isEditing ? (
                    <div className="mt-1 flex gap-2">
                      <input
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        className="flex-1 bg-bat-elevated border border-bat-border rounded px-2 py-1 text-sm outline-none focus:border-bat-accent"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit(msg.id)
                          if (e.key === 'Escape') cancelEdit()
                        }}
                      />
                      <button onClick={() => saveEdit(msg.id)} className="text-xs text-bat-accent font-medium">Save</button>
                      <button onClick={cancelEdit} className="text-xs text-bat-muted">Cancel</button>
                    </div>
                  ) : (
                    <div className="text-bat-text text-[15px] leading-relaxed break-words">{msg.content}</div>
                  )}
                </div>

                {!isEditing && (
                  <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition flex gap-0.5 bg-bat-surface border border-bat-border rounded-lg p-0.5 shadow">
                    <button onClick={() => startReply(msg)} className="p-1.5 rounded hover:bg-bat-elevated text-bat-muted hover:text-bat-text" title="Reply">
                      <Reply size={14} />
                    </button>
                    {isOwn && (
                      <>
                        <button onClick={() => startEdit(msg)} className="p-1.5 rounded hover:bg-bat-elevated text-bat-muted hover:text-bat-text" title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => deleteMessage(msg.id)} className="p-1.5 rounded hover:bg-bat-elevated text-bat-muted hover:text-bat-danger" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {replyingTo && (
          <div className="mx-4 mb-1 px-3 py-2 bg-bat-elevated rounded-t-lg border border-b-0 border-bat-border flex items-center justify-between">
            <div className="text-sm text-bat-muted flex items-center gap-2 min-w-0">
              <Reply size={14} className="text-bat-accent flex-shrink-0" />
              <span>Replying to <strong className="text-bat-text">{replyingTo.profiles?.username || 'message'}</strong></span>
              <span className="truncate">— {replyingTo.content}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-bat-border rounded"><X size={14} /></button>
          </div>
        )}

        <form onSubmit={sendMessage} className="p-4 pt-0">
          <div className={`bg-bat-elevated rounded-xl px-4 py-3 flex items-center gap-3 border border-bat-border ${replyingTo ? 'rounded-t-none' : ''}`}>
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder={replyingTo ? `Reply...` : `Message #${activeChannel?.name || 'channel'}`}
              className="flex-1 bg-transparent outline-none text-bat-text placeholder:text-bat-muted"
              autoComplete="off"
            />
            <button type="submit" disabled={!newMessage.trim() || sending} className="p-1.5 rounded-lg bg-bat-accent text-black disabled:opacity-40 hover:bg-bat-accentHover transition">
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>

      {/* Members */}
      <div className="w-52 bg-bat-surface border-l border-bat-border hidden md:flex flex-col">
        <div className="h-12 px-4 flex items-center border-b border-bat-border">
          <Users size={16} className="text-bat-muted mr-2" />
          <span className="text-sm font-medium text-bat-muted">Members</span>
        </div>
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="text-xs font-semibold text-bat-muted uppercase mb-2 tracking-wider">
            Online — {members.filter(m => m.status === 'online').length || 1}
          </div>
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-bat-elevated/50">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-bat-accent/20 flex items-center justify-center text-bat-accent text-sm font-medium">
                  {m.username[0]?.toUpperCase()}
                </div>
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bat-surface ${m.status === 'online' ? 'bg-bat-success' : 'bg-bat-muted'}`}></span>
              </div>
              <span className="text-sm truncate">{m.username}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
