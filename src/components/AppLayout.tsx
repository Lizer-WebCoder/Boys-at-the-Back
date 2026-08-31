import { Session } from '@supabase/supabase-js'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Hash, Users, LogOut, Mic, Send, Pencil, Trash2, Reply, X, Copy, Check, Smile, ImagePlus, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

interface Props { session: Session }
interface Channel { id: string; name: string; type: string }
interface Reaction { emoji: string; user_id: string; count?: number; users?: string[] }
interface Message {
  id: string; content: string; author_id: string; created_at: string
  edited_at?: string | null; reply_to?: string | null; image_url?: string | null
  profiles?: { username: string; avatar_url: string | null } | null
  reply_message?: { id: string; content: string; profiles?: { username: string } | null } | null
  reactions?: Reaction[]
}
interface Profile { id: string; username: string; avatar_url: string | null; status: string }
interface DmConvo { id: string; other: Profile; lastMessage?: string }

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '🎉']

function renderContent(text: string) {
  if (!text) return null
  return text.split(/(@\w+)/g).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="text-bat-accent font-medium bg-bat-accent/10 px-0.5 rounded">{part}</span>
      : <span key={i}>{part}</span>
  )
}

function Avatar({ name, url, size = 'md' }: { name: string; url?: string | null; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-9 h-9 text-sm'
  if (url) return <img src={url} alt={name} className={`${s} rounded-full object-cover flex-shrink-0`} />
  return (
    <div className={`${s} rounded-full bg-bat-accent/20 flex items-center justify-center text-bat-accent font-medium flex-shrink-0`}>
      {(name || '?')[0]?.toUpperCase()}
    </div>
  )
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
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [myAvatar, setMyAvatar] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'channel' | 'dm'>('channel')
  const [dmConvos, setDmConvos] = useState<DmConvo[]>([])
  const [activeDmId, setActiveDmId] = useState<string | null>(null)
  const [dmMessages, setDmMessages] = useState<Message[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const username = session.user.user_metadata?.username || 'User'

  const loadGroupData = async (gId: string) => {
    setGroupId(gId)
    const { data: group } = await supabase.from('groups').select('invite_code').eq('id', gId).single()
    if (group) setInviteCode(group.invite_code)

    const { data: channelData } = await supabase.from('channels').select('*').eq('group_id', gId).eq('type', 'text').order('position')
    if (channelData?.length) {
      setChannels(channelData)
      if (!activeChannelId) setActiveChannelId(channelData[0].id)
    }

    const { data: memberData } = await supabase
      .from('group_members').select('user_id, profiles(id, username, avatar_url, status)').eq('group_id', gId)
    if (memberData) {
      const profiles = memberData.map((m: any) => m.profiles).filter(Boolean) as Profile[]
      setMembers(profiles)
      const me = profiles.find(p => p.id === session.user.id)
      if (me?.avatar_url) setMyAvatar(me.avatar_url)
    }

    // Load unread counts
    if (channelData) {
      const counts: Record<string, number> = {}
      for (const ch of channelData) {
        const { data: read } = await supabase.from('channel_reads')
          .select('last_read_at').eq('user_id', session.user.id).eq('channel_id', ch.id).maybeSingle()
        const since = read?.last_read_at || '1970-01-01'
        const { count } = await supabase.from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', ch.id).gt('created_at', since).neq('author_id', session.user.id)
        counts[ch.id] = count || 0
      }
      setUnread(counts)
    }
  }

  const loadDms = async () => {
    const { data: parts } = await supabase.from('dm_participants').select('conversation_id').eq('user_id', session.user.id)
    if (!parts?.length) { setDmConvos([]); return }

    const convos: DmConvo[] = []
    for (const p of parts) {
      const { data: others } = await supabase.from('dm_participants')
        .select('user_id, profiles(id, username, avatar_url, status)')
        .eq('conversation_id', p.conversation_id).neq('user_id', session.user.id)
      if (others?.[0]?.profiles) {
        const { data: last } = await supabase.from('dm_messages')
          .select('content').eq('conversation_id', p.conversation_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        convos.push({ id: p.conversation_id, other: others[0].profiles as any, lastMessage: last?.content })
      }
    }
    setDmConvos(convos)
  }

  useEffect(() => {
    async function init() {
      const { data: existingProfile } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      if (!existingProfile) {
        await supabase.from('profiles').upsert({ id: session.user.id, username, status: 'online' })
      } else {
        await supabase.from('profiles').update({ status: 'online' }).eq('id', session.user.id)
        if (existingProfile.avatar_url) setMyAvatar(existingProfile.avatar_url)
      }

      const { data: groups } = await supabase.from('groups').select('*').limit(1)
      if (!groups?.length) {
        const code = Math.random().toString(36).substring(2, 10).toUpperCase()
        const { data: newGroup, error } = await supabase.from('groups')
          .insert({ name: 'Boys at the Back', invite_code: code, created_by: session.user.id }).select().single()
        if (error || !newGroup) { setLoading(false); return }
        await supabase.from('group_members').insert({ group_id: newGroup.id, user_id: session.user.id, role: 'owner' })
        await supabase.from('channels').insert(
          ['general', 'gaming', 'memes', 'music', 'random'].map((name, i) => ({ group_id: newGroup.id, name, type: 'text', position: i }))
        )
        await loadGroupData(newGroup.id)
        setNeedsInvite(false)
      } else {
        const gId = groups[0].id
        const { data: membership } = await supabase.from('group_members')
          .select('*').eq('group_id', gId).eq('user_id', session.user.id).maybeSingle()
        if (membership) {
          await loadGroupData(gId)
          setNeedsInvite(false)
        } else {
          setGroupId(gId)
          setInviteCode(groups[0].invite_code)
          setNeedsInvite(true)
        }
      }
      await loadDms()
      setLoading(false)
    }
    init()
    return () => { supabase.from('profiles').update({ status: 'offline' }).eq('id', session.user.id).then() }
  }, [session.user.id])

  // Mark channel as read when viewing
  useEffect(() => {
    if (!activeChannelId || viewMode !== 'channel') return
    supabase.from('channel_reads').upsert({
      user_id: session.user.id, channel_id: activeChannelId, last_read_at: new Date().toISOString()
    }).then(() => setUnread(prev => ({ ...prev, [activeChannelId]: 0 })))
  }, [activeChannelId, viewMode])

  // Load channel messages
  useEffect(() => {
    if (!activeChannelId || needsInvite || viewMode !== 'channel') return

    async function loadMessages() {
      const { data } = await supabase.from('messages')
        .select(`id, content, author_id, created_at, edited_at, reply_to, image_url, profiles!author_id (username, avatar_url)`)
        .eq('channel_id', activeChannelId).order('created_at', { ascending: true }).limit(150)
      if (data) {
        const withReplies = await Promise.all((data as any[]).map(async (msg) => {
          if (!msg.reply_to) return msg
          const { data: replied } = await supabase.from('messages')
            .select('id, content, profiles!author_id (username)').eq('id', msg.reply_to).maybeSingle()
          return { ...msg, reply_message: replied }
        }))
        const { data: reacts } = await supabase.from('reactions').select('message_id, emoji, user_id').in('message_id', withReplies.map(m => m.id))
        const map: Record<string, Reaction[]> = {}
        reacts?.forEach((r: any) => {
          if (!map[r.message_id]) map[r.message_id] = []
          const ex = map[r.message_id].find(x => x.emoji === r.emoji)
          if (ex) { ex.count = (ex.count || 1) + 1; ex.users = [...(ex.users || []), r.user_id] }
          else map[r.message_id].push({ emoji: r.emoji, user_id: r.user_id, count: 1, users: [r.user_id] })
        })
        setMessages(withReplies.map(m => ({ ...m, reactions: map[m.id] || [] })))
      }
    }
    loadMessages()

    const ch = supabase.channel(`msg:${activeChannelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannelId}` }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const n = payload.new as any
          const { data: p } = await supabase.from('profiles').select('username, avatar_url').eq('id', n.author_id).maybeSingle()
          setMessages(prev => prev.some(m => m.id === n.id) ? prev : [...prev, { ...n, profiles: p, reactions: [] }])
          if (n.author_id !== session.user.id) {
            setUnread(prev => ({ ...prev, [activeChannelId!]: 0 }))
          }
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m))
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id))
        }
      }).subscribe()

    const typingCh = supabase.channel(`typing:${activeChannelId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === session.user.id) return
        setTypingUsers(prev => prev.includes(payload.username) ? prev : [...prev, payload.username])
        setTimeout(() => setTypingUsers(prev => prev.filter(u => u !== payload.username)), 3000)
      }).subscribe()

    return () => { supabase.removeChannel(ch); supabase.removeChannel(typingCh) }
  }, [activeChannelId, needsInvite, viewMode])

  // Load DM messages
  useEffect(() => {
    if (!activeDmId || viewMode !== 'dm') return
    async function load() {
      const { data } = await supabase.from('dm_messages')
        .select(`id, content, author_id, created_at, image_url, profiles!author_id (username, avatar_url)`)
        .eq('conversation_id', activeDmId).order('created_at', { ascending: true }).limit(150)
      if (data) setDmMessages(data as any)
    }
    load()

    const ch = supabase.channel(`dm:${activeDmId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${activeDmId}` }, async (payload) => {
        const n = payload.new as any
        const { data: p } = await supabase.from('profiles').select('username, avatar_url').eq('id', n.author_id).maybeSingle()
        setDmMessages(prev => prev.some(m => m.id === n.id) ? prev : [...prev, { ...n, profiles: p }])
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [activeDmId, viewMode])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, dmMessages, typingUsers])

  const broadcastTyping = useCallback(() => {
    if (!activeChannelId || viewMode !== 'channel') return
    supabase.channel(`typing:${activeChannelId}`).send({ type: 'broadcast', event: 'typing', payload: { userId: session.user.id, username } })
  }, [activeChannelId, viewMode, session.user.id, username])

  const startDm = async (other: Profile) => {
    // Find existing conversation
    const { data: myParts } = await supabase.from('dm_participants').select('conversation_id').eq('user_id', session.user.id)
    if (myParts) {
      for (const p of myParts) {
        const { data: match } = await supabase.from('dm_participants')
          .select('conversation_id').eq('conversation_id', p.conversation_id).eq('user_id', other.id).maybeSingle()
        if (match) {
          setActiveDmId(match.conversation_id)
          setViewMode('dm')
          return
        }
      }
    }
    // Create new
    const { data: convo } = await supabase.from('dm_conversations').insert({}).select().single()
    if (!convo) return
    await supabase.from('dm_participants').insert([
      { conversation_id: convo.id, user_id: session.user.id },
      { conversation_id: convo.id, user_id: other.id }
    ])
    setActiveDmId(convo.id)
    setViewMode('dm')
    await loadDms()
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 2 * 1024 * 1024) { alert('Avatar must be under 2MB'); return }
    setUploading(true)
    const path = `${session.user.id}/avatar.${file.name.split('.').pop()}`
    await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', session.user.id)
    setMyAvatar(url)
    setMembers(prev => prev.map(m => m.id === session.user.id ? { ...m, avatar_url: url } : m))
    setUploading(false)
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return }
    setUploading(true)
    const path = `${session.user.id}/${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('chat-images').upload(path, file)
    if (error) { alert('Upload failed'); setUploading(false); return }
    const { data } = supabase.storage.from('chat-images').getPublicUrl(path)
    setPendingImage(data.publicUrl)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if ((!newMessage.trim() && !pendingImage) || sending) return
    setSending(true)
    const content = newMessage.trim()
    const imageUrl = pendingImage
    setNewMessage('')
    setPendingImage(null)
    const replyId = replyingTo?.id || null
    setReplyingTo(null)

    if (viewMode === 'dm' && activeDmId) {
      const { data, error } = await supabase.from('dm_messages')
        .insert({ conversation_id: activeDmId, author_id: session.user.id, content: content || null, image_url: imageUrl })
        .select('id, content, author_id, created_at, image_url').single()
      if (!error && data) {
        setDmMessages(prev => [...prev, { ...data, profiles: { username, avatar_url: myAvatar } }])
      }
    } else if (activeChannelId) {
      const tempId = 'temp-' + Date.now()
      setMessages(prev => [...prev, {
        id: tempId, content, author_id: session.user.id, created_at: new Date().toISOString(),
        image_url: imageUrl, profiles: { username, avatar_url: myAvatar }, reply_to: replyId,
        reply_message: replyingTo ? { id: replyingTo.id, content: replyingTo.content, profiles: replyingTo.profiles } : null, reactions: []
      }])
      const { data, error } = await supabase.from('messages')
        .insert({ channel_id: activeChannelId, author_id: session.user.id, content: content || null, image_url: imageUrl, reply_to: replyId })
        .select('id, content, author_id, created_at, reply_to, image_url').single()
      if (error) {
        setMessages(prev => prev.filter(m => m.id !== tempId))
        setNewMessage(content)
      } else if (data) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...data, profiles: { username, avatar_url: myAvatar }, reactions: [] } : m))
      }
    }
    setSending(false)
  }

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (messageId.startsWith('temp-')) return
    setShowEmojiFor(null)
    const { data: existing } = await supabase.from('reactions').select('*')
      .eq('message_id', messageId).eq('user_id', session.user.id).eq('emoji', emoji).maybeSingle()
    if (existing) {
      await supabase.from('reactions').delete().eq('message_id', messageId).eq('user_id', session.user.id).eq('emoji', emoji)
    } else {
      await supabase.from('reactions').insert({ message_id: messageId, user_id: session.user.id, emoji })
    }
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const reactions = [...(m.reactions || [])]
      const idx = reactions.findIndex(r => r.emoji === emoji)
      if (existing) {
        if (idx >= 0) {
          reactions[idx].count = (reactions[idx].count || 1) - 1
          reactions[idx].users = (reactions[idx].users || []).filter(u => u !== session.user.id)
          if ((reactions[idx].count || 0) <= 0) reactions.splice(idx, 1)
        }
      } else {
        if (idx >= 0) {
          reactions[idx].count = (reactions[idx].count || 1) + 1
          reactions[idx].users = [...(reactions[idx].users || []), session.user.id]
        } else reactions.push({ emoji, user_id: session.user.id, count: 1, users: [session.user.id] })
      }
      return { ...m, reactions }
    }))
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!joinCode.trim() || !groupId) return
    setJoining(true); setJoinError('')
    const { data: group } = await supabase.from('groups').select('id, invite_code').eq('id', groupId).single()
    if (!group || group.invite_code.toUpperCase() !== joinCode.trim().toUpperCase()) {
      setJoinError('Invalid invite code'); setJoining(false); return
    }
    const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: session.user.id, role: 'member' })
    if (error) { setJoinError(error.message); setJoining(false); return }
    await loadGroupData(groupId); setNeedsInvite(false); setJoining(false)
  }

  const handleLogout = async () => {
    await supabase.from('profiles').update({ status: 'offline' }).eq('id', session.user.id)
    await supabase.auth.signOut()
  }

  const activeChannel = channels.find(c => c.id === activeChannelId)
  const activeDm = dmConvos.find(d => d.id === activeDmId)
  const displayMessages = viewMode === 'dm' ? dmMessages : messages

  if (loading) return <div className="h-full flex items-center justify-center bg-bat-bg"><div className="text-bat-muted">Loading the hangout...</div></div>

  if (needsInvite) {
    return (
      <div className="h-full flex items-center justify-center bg-bat-bg p-4">
        <div className="w-full max-w-sm bg-bat-surface border border-bat-border rounded-2xl p-8">
          <h2 className="text-xl font-bold text-bat-accent text-center mb-2">Boys at the Back</h2>
          <p className="text-bat-muted text-center text-sm mb-6">Enter the invite code to join</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="INVITE CODE" className="w-full px-4 py-3 rounded-lg bg-bat-elevated border border-bat-border text-center text-lg tracking-widest font-mono outline-none focus:border-bat-accent" autoFocus />
            {joinError && <p className="text-bat-danger text-sm text-center">{joinError}</p>}
            <button type="submit" disabled={joining || !joinCode.trim()} className="w-full py-2.5 rounded-lg bg-bat-accent hover:bg-bat-accentHover text-black font-semibold disabled:opacity-50">
              {joining ? 'Joining...' : 'Join'}
            </button>
          </form>
          <button onClick={handleLogout} className="w-full mt-4 text-sm text-bat-muted hover:text-bat-text">Log out</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-bat-bg text-bat-text">
      <div className="w-16 bg-bat-bg border-r border-bat-border flex flex-col items-center py-3 gap-2">
        <div className="w-11 h-11 rounded-2xl bg-bat-accent flex items-center justify-center text-black font-bold text-lg shadow-lg">B</div>
        <div className="w-8 h-0.5 bg-bat-border rounded-full my-1" />
      </div>

      <div className="w-56 bg-bat-surface flex flex-col">
        <div className="h-12 px-4 flex items-center border-b border-bat-border shadow-sm">
          <h2 className="font-semibold text-sm tracking-wide">Boys at the Back</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs font-semibold text-bat-muted uppercase px-2 mb-1 tracking-wider">Text Channels</div>
          {channels.map(ch => (
            <button key={ch.id}
              onClick={() => { setActiveChannelId(ch.id); setViewMode('channel'); setReplyingTo(null); setEditingId(null) }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
                viewMode === 'channel' && activeChannelId === ch.id ? 'bg-bat-elevated text-bat-text' : 'text-bat-muted hover:bg-bat-elevated/60 hover:text-bat-text'
              }`}>
              <Hash size={16} className="opacity-70" />
              <span className="flex-1 text-left">{ch.name}</span>
              {(unread[ch.id] || 0) > 0 && (
                <span className="bg-bat-accent text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {unread[ch.id]}
                </span>
              )}
            </button>
          ))}

          <div className="text-xs font-semibold text-bat-muted uppercase px-2 mt-4 mb-1 tracking-wider">Direct Messages</div>
          {dmConvos.length === 0 && (
            <p className="text-[11px] text-bat-muted px-2">Click a member to start a DM</p>
          )}
          {dmConvos.map(dm => (
            <button key={dm.id}
              onClick={() => { setActiveDmId(dm.id); setViewMode('dm') }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
                viewMode === 'dm' && activeDmId === dm.id ? 'bg-bat-elevated text-bat-text' : 'text-bat-muted hover:bg-bat-elevated/60 hover:text-bat-text'
              }`}>
              <Avatar name={dm.other.username} url={dm.other.avatar_url} size="sm" />
              <span className="flex-1 text-left truncate">{dm.other.username}</span>
            </button>
          ))}

          <div className="text-xs font-semibold text-bat-muted uppercase px-2 mt-4 mb-1 tracking-wider">Voice (Phase 2)</div>
          <div className="px-2 py-1.5 text-sm text-bat-muted flex items-center gap-2 opacity-50"><Mic size={16} /> Lounge</div>

          <div className="mt-6 px-2">
            <div className="text-xs font-semibold text-bat-muted uppercase mb-1 tracking-wider">Invite Code</div>
            <div className="flex items-center gap-1 bg-bat-elevated rounded-lg px-2 py-1.5">
              <code className="flex-1 text-sm font-mono text-bat-accent tracking-wider">{inviteCode}</code>
              <button onClick={() => { navigator.clipboard.writeText(inviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="p-1 rounded hover:bg-bat-border text-bat-muted hover:text-bat-text">
                {copied ? <Check size={14} className="text-bat-success" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>

        <div className="h-14 bg-bat-elevated border-t border-bat-border px-2 flex items-center gap-2">
          <button onClick={() => avatarInputRef.current?.click()} title="Change avatar" className="relative group">
            <Avatar name={username} url={myAvatar} size="sm" />
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              <ImagePlus size={12} className="text-white" />
            </div>
          </button>
          <input type="file" ref={avatarInputRef} accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{username}</div>
            <div className="text-xs text-bat-success flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-bat-success"></span> Online
            </div>
          </div>
          <button onClick={handleLogout} className="p-1.5 rounded hover:bg-bat-border text-bat-muted hover:text-bat-text" title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-12 px-4 flex items-center border-b border-bat-border shadow-sm">
          {viewMode === 'dm' ? (
            <><MessageCircle size={18} className="text-bat-muted mr-2" /><span className="font-semibold">{activeDm?.other.username || 'DM'}</span></>
          ) : (
            <><Hash size={18} className="text-bat-muted mr-2" /><span className="font-semibold">{activeChannel?.name || 'general'}</span></>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4" onClick={() => setShowEmojiFor(null)}>
          {displayMessages.length === 0 && (
            <div className="text-center text-bat-muted text-sm py-8">
              {viewMode === 'dm' ? 'Start the conversation!' : <>Welcome to <span className="text-bat-accent">#{activeChannel?.name}</span></>}
            </div>
          )}

          {displayMessages.map((msg) => {
            const isOwn = msg.author_id === session.user.id
            const isEditing = editingId === msg.id
            return (
              <div key={msg.id} className="flex gap-3 mb-4 group relative">
                <Avatar name={msg.profiles?.username || username} url={msg.profiles?.avatar_url} />
                <div className="min-w-0 flex-1">
                  {msg.reply_message && (
                    <div className="flex items-center gap-1.5 text-xs text-bat-muted mb-1">
                      <Reply size={12} />
                      <span className="font-medium">{msg.reply_message.profiles?.username}</span>
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
                      <input value={editContent} onChange={e => setEditContent(e.target.value)}
                        className="flex-1 bg-bat-elevated border border-bat-border rounded px-2 py-1 text-sm outline-none focus:border-bat-accent" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') { supabase.from('messages').update({ content: editContent.trim(), edited_at: new Date().toISOString() }).eq('id', msg.id).then(() => { setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: editContent.trim(), edited_at: new Date().toISOString() } : m)); setEditingId(null) }) }; if (e.key === 'Escape') setEditingId(null) }} />
                      <button onClick={() => setEditingId(null)} className="text-xs text-bat-muted">Cancel</button>
                    </div>
                  ) : (
                    <>
                      {msg.content && <div className="text-bat-text text-[15px] leading-relaxed break-words">{renderContent(msg.content)}</div>}
                      {msg.image_url && (
                        <img src={msg.image_url} alt="" className="mt-2 max-w-xs max-h-64 rounded-lg border border-bat-border cursor-pointer"
                          onClick={() => window.open(msg.image_url!, '_blank')} />
                      )}
                    </>
                  )}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {msg.reactions.map(r => (
                        <button key={r.emoji} onClick={() => toggleReaction(msg.id, r.emoji)}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border ${
                            r.users?.includes(session.user.id) ? 'bg-bat-accent/20 border-bat-accent/40 text-bat-accent' : 'bg-bat-elevated border-bat-border text-bat-muted'
                          }`}>
                          <span>{r.emoji}</span><span>{r.count || 1}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {viewMode === 'channel' && !isEditing && (
                  <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition flex gap-0.5 bg-bat-surface border border-bat-border rounded-lg p-0.5 shadow z-10">
                    <button onClick={(e) => { e.stopPropagation(); setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id) }} className="p-1.5 rounded hover:bg-bat-elevated text-bat-muted"><Smile size={14} /></button>
                    <button onClick={() => { setReplyingTo(msg); inputRef.current?.focus() }} className="p-1.5 rounded hover:bg-bat-elevated text-bat-muted"><Reply size={14} /></button>
                    {isOwn && (
                      <>
                        <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content || '') }} className="p-1.5 rounded hover:bg-bat-elevated text-bat-muted"><Pencil size={14} /></button>
                        <button onClick={() => { if (confirm('Delete?')) supabase.from('messages').delete().eq('id', msg.id).then(() => setMessages(prev => prev.filter(m => m.id !== msg.id))) }} className="p-1.5 rounded hover:bg-bat-elevated text-bat-muted"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                )}
                {showEmojiFor === msg.id && (
                  <div className="absolute right-0 top-8 bg-bat-surface border border-bat-border rounded-lg p-1.5 flex gap-1 shadow-lg z-20" onClick={e => e.stopPropagation()}>
                    {QUICK_EMOJIS.map(emoji => (
                      <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-bat-elevated text-lg">{emoji}</button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {viewMode === 'channel' && typingUsers.length > 0 && (
            <div className="text-sm text-bat-muted italic px-1 py-2">
              {typingUsers.length === 1 ? `${typingUsers[0]} is typing...` : `${typingUsers.slice(0, 2).join(', ')} are typing...`}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {replyingTo && viewMode === 'channel' && (
          <div className="mx-4 mb-1 px-3 py-2 bg-bat-elevated rounded-t-lg border border-b-0 border-bat-border flex items-center justify-between">
            <div className="text-sm text-bat-muted flex items-center gap-2 min-w-0">
              <Reply size={14} className="text-bat-accent" />
              <span>Replying to <strong className="text-bat-text">{replyingTo.profiles?.username}</strong></span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-bat-border rounded"><X size={14} /></button>
          </div>
        )}

        {pendingImage && (
          <div className="mx-4 mb-1 relative inline-block">
            <img src={pendingImage} alt="" className="h-20 rounded-lg border border-bat-border" />
            <button onClick={() => setPendingImage(null)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"><X size={12} /></button>
          </div>
        )}

        <form onSubmit={sendMessage} className="p-4 pt-0">
          <div className="bg-bat-elevated rounded-xl px-4 py-3 flex items-center gap-3 border border-bat-border">
            <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-1.5 rounded hover:bg-bat-border text-bat-muted hover:text-bat-text">
              <ImagePlus size={18} />
            </button>
            <input ref={inputRef} type="text" value={newMessage}
              onChange={e => { setNewMessage(e.target.value); if (viewMode === 'channel') broadcastTyping() }}
              placeholder={viewMode === 'dm' ? `Message ${activeDm?.other.username || ''}...` : `Message #${activeChannel?.name || 'channel'}`}
              className="flex-1 bg-transparent outline-none text-bat-text placeholder:text-bat-muted" autoComplete="off" />
            <button type="submit" disabled={(!newMessage.trim() && !pendingImage) || sending || uploading}
              className="p-1.5 rounded-lg bg-bat-accent text-black disabled:opacity-40 hover:bg-bat-accentHover">
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
            <button key={m.id} onClick={() => m.id !== session.user.id && startDm(m)}
              className="w-full flex items-center gap-2 px-1 py-1.5 rounded hover:bg-bat-elevated/50 text-left"
              title={m.id !== session.user.id ? 'Send DM' : ''}>
              <div className="relative">
                <Avatar name={m.username || '?'} url={m.avatar_url} size="sm" />
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bat-surface ${
                  m.status === 'online' ? 'bg-bat-success' : 'bg-bat-muted'
                }`}></span>
              </div>
              <span className="text-sm truncate">{m.username || 'User'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
