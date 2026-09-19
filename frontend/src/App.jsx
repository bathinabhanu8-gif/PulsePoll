import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API = '/api'
const CATEGORIES = [
  { id: 'general', label: 'General', icon: '✦', line: 'Every voice begins somewhere.' },
  { id: 'technology', label: 'Technology', icon: '⌘', line: 'Ideas for what comes next.' },
  { id: 'entertainment', label: 'Entertainment', icon: '◈', line: 'Culture, stories, and the spotlight.' },
  { id: 'sports', label: 'Sports', icon: '↗', line: 'The energy of the crowd.' },
  { id: 'education', label: 'Education', icon: '◇', line: 'Questions worth exploring.' },
  { id: 'lifestyle', label: 'Lifestyle', icon: '✺', line: 'The things that make us us.' },
  { id: 'business', label: 'Business', icon: '▣', line: 'Make the next move together.' },
]
const categoryOf = poll => CATEGORIES.find(item => item.id === poll?.category) || CATEGORIES[0]
const total = poll => poll?.options?.reduce((sum, option) => sum + option.votes, 0) || 0

async function request(path, options = {}) {
  const { token, ...init } = options
  const response = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}
function getVoter() {
  let id = localStorage.getItem('pulsepoll-voter')
  if (!id) { id = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem('pulsepoll-voter', id) }
  return id
}
function Results({ poll }) {
  const votes = total(poll)
  return <div className="results">{poll.options.map((option, i) => {
    const percentage = votes ? Math.round(option.votes / votes * 100) : 0
    return <div className="result" key={i}><div className="result-top"><span><b>{String(i + 1).padStart(2, '0')}</b> {option.text}</span><strong>{percentage}%</strong></div><div className="track"><div style={{ width: `${percentage}%` }} /></div><small>{option.votes} {option.votes === 1 ? 'vote' : 'votes'}</small></div>
  })}</div>
}
function App() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('pulsepoll-session')) } catch { return null } })
  const [page, setPage] = useState(location.pathname)
  const [polls, setPolls] = useState([])
  const [poll, setPoll] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [live, setLive] = useState(false)
  const [authMode, setAuthMode] = useState('signup')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [draft, setDraft] = useState({ title: '', description: '', category: 'general', options: ['', ''] })
  const [choice, setChoice] = useState(null)
  const [voted, setVoted] = useState(false)
  const pollId = useMemo(() => page.startsWith('/p/') ? page.split('/')[2] : null, [page])
  const visiblePolls = polls.filter(item => filter === 'all' || categoryOf(item).id === filter)
  const participantCount = polls.reduce((count, item) => count + total(item), 0)

  function navigate(path) { history.pushState({}, '', path); setPage(path); setError(''); setMessage(''); scrollTo(0, 0) }
  function toast(value) { setMessage(value); setTimeout(() => setMessage(''), 4000) }
  useEffect(() => { const handler = () => setPage(location.pathname); addEventListener('popstate', handler); return () => removeEventListener('popstate', handler) }, [])
  useEffect(() => {
    if (!session) return
    request('/polls', { token: session.token }).then(setPolls).catch(e => setError(e.message))
  }, [session, page])
  useEffect(() => {
    if (!pollId) return
    setPoll(null); setChoice(null); setVoted(localStorage.getItem('pulsepoll-voted-' + pollId) === 'yes')
    request('/polls/' + pollId).then(setPoll).catch(e => setError(e.message))
    const stream = new EventSource(API + '/polls/' + pollId + '/events')
    stream.onopen = () => setLive(true)
    stream.onerror = () => setLive(false)
    stream.addEventListener('poll', event => { try { setPoll(JSON.parse(event.data)) } catch { /* reconnecting */ } })
    return () => { stream.close(); setLive(false) }
  }, [pollId])
  async function submitAuth(event) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const data = await request('/auth/' + authMode, { method: 'POST', body: JSON.stringify(form) })
      localStorage.setItem('pulsepoll-session', JSON.stringify(data)); setSession(data); navigate('/dashboard')
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  async function create(event) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const data = await request('/polls', { method: 'POST', token: session.token, body: JSON.stringify(draft) })
      setPolls(previous => [data, ...previous]); setDraft({ title: '', description: '', category: 'general', options: ['', ''] })
      navigate('/p/' + data.id); toast('Poll published. Your share link is ready.')
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  async function vote(event) {
    event.preventDefault(); if (choice === null) return
    setLoading(true); setError('')
    try {
      await request('/polls/' + pollId + '/votes', { method: 'POST', body: JSON.stringify({ option: choice, voter: getVoter() }) })
      localStorage.setItem('pulsepoll-voted-' + pollId, 'yes'); setVoted(true)
      setPoll(await request('/polls/' + pollId)); toast('Your vote has been counted.')
    } catch (e) {
      if (e.message.includes('already voted')) { setVoted(true); localStorage.setItem('pulsepoll-voted-' + pollId, 'yes') }
      setError(e.message)
    } finally { setLoading(false) }
  }
  async function close() {
    if (!confirm('Close this poll? New votes will no longer be accepted.')) return
    setLoading(true); setError('')
    try {
      await request('/polls/' + pollId + '/close', { method: 'PATCH', token: session.token })
      setPoll(await request('/polls/' + pollId)); toast('Poll closed.')
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  async function share() {
    try { await navigator.clipboard.writeText(location.href); toast('Link copied to clipboard.') }
    catch { toast('Copy the address from your browser to share.') }
  }
  function signout() { localStorage.removeItem('pulsepoll-session'); setSession(null); setPolls([]); navigate('/') }
  const managed = poll && polls.some(item => item.id === poll.id)
  const activeCategory = categoryOf(poll)

  return <div className="app">
    <header className="nav"><button className="brand" onClick={() => navigate('/')}><span className="brand-mark">◉</span> PULSE<span>POLL</span></button><nav><button className="nav-link" onClick={() => navigate(session ? '/dashboard' : '/login')}>{session ? 'My studio' : 'Sign in'}</button>{session ? <><span className="hello">{session.user.name.split(' ')[0]}</span><button className="button small ghost" onClick={signout}>Sign out</button></> : <button className="button small" onClick={() => navigate('/login')}>Start a poll <span>↗</span></button>}</nav></header>
    <main>
      {error && <div className="notice error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
      {message && <div className="notice success" role="status">{message}</div>}
      {page === '/' && <>
        <section className="hero"><div className="hero-inner"><div className="eyebrow"><span className="signal"/> THE ROOM HAS A VOICE</div><h1>Ask the question.<br/><em>Feel the answer.</em></h1><p>Create a moment worth responding to. Share one link and watch every opinion shape the story, live.</p><div className="hero-actions"><button className="button large" onClick={() => navigate(session ? '/create' : '/login')}>Create a poll <span>↗</span></button><button className="button large glass" onClick={() => document.querySelector('#how')?.scrollIntoView({ behavior: 'smooth' })}>Explore the experience ↓</button></div><div className="hero-foot"><span className="signal"/> LIVE POLLING, WITHOUT THE NOISE <span>·</span> NO ACCOUNT NEEDED TO VOTE</div></div><div className="hero-index">01 / ONE QUESTION. ENDLESS PERSPECTIVES.</div></section>
        <section className="feature-wrap" id="how"><div className="feature-heading"><div><div className="eyebrow">THE EXPERIENCE</div><h2>Built for a room<br/>full of <em>perspectives.</em></h2></div><p>From first question to final result, every moment feels immediate.</p></div><div className="features"><article><span className="feature-icon">✳</span><span className="feature-number">01 / CREATE</span><h3>Set the scene.</h3><p>Choose a category, craft a question, and give your poll a personality.</p></article><article><span className="feature-icon">↗</span><span className="feature-number">02 / INVITE</span><h3>Bring people in.</h3><p>One shareable link. No signup required to make a voice heard.</p></article><article><span className="feature-icon">◉</span><span className="feature-number">03 / WATCH</span><h3>See it unfold.</h3><p>Follow every vote and participant count as the story changes live.</p></article></div></section>
      </>}
      {page === '/login' && <section className="panel auth-panel"><div className="eyebrow">ENTER THE STUDIO</div><h1>{authMode === 'signup' ? 'The conversation starts here.' : 'Welcome back.'}</h1><p>{authMode === 'signup' ? 'Create an account to begin asking better questions.' : 'Sign in to create and manage your polls.'}</p><form onSubmit={submitAuth}>{authMode === 'signup' && <label>Your name<input required minLength="2" maxLength="70" autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>}<label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label><label>Password<input required type="password" minLength="8" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></label><button className="button full" disabled={loading}>{loading ? 'Please wait…' : authMode === 'signup' ? 'Create account ↗' : 'Sign in ↗'}</button></form><p className="switch">{authMode === 'signup' ? 'Already have an account?' : 'New to PulsePoll?'} <button onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setError('') }}>{authMode === 'signup' ? 'Sign in' : 'Create account'}</button></p></section>}
      {page === '/dashboard' && (session ? <section className="workspace dashboard"><div className="workspace-top"><div><div className="eyebrow">YOUR CONTROL ROOM</div><h1>Poll studio<span className="accent">.</span></h1><p>Every question has a story. Here are yours.</p></div><button className="button" onClick={() => navigate('/create')}>+ Create poll</button></div><div className="dashboard-stats"><div><strong>{polls.length}</strong><span>Polls created</span></div><div><strong>{participantCount}</strong><span>People who voted across your polls</span></div><div><strong>{polls.filter(item => !item.closed).length}</strong><span>Open for voting</span></div></div><div className="section-heading"><div><div className="eyebrow">THE ARCHIVE</div><h2>Explore your polls</h2></div><span>{visiblePolls.length} {visiblePolls.length === 1 ? 'poll' : 'polls'}</span></div><div className="filters" aria-label="Filter polls by category"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All categories</button>{CATEGORIES.map(item => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.icon} {item.label}</button>)}</div>{visiblePolls.length ? <div className="poll-grid">{visiblePolls.map(item => { const category = categoryOf(item); return <button className={`poll-card theme-${category.id}`} key={item.id} onClick={() => navigate('/p/' + item.id)}><div className="card-art"><span className="art-icon">{category.icon}</span><span className="art-category">{category.label.toUpperCase()}</span></div><div className="card-content"><span className={'badge ' + (item.closed ? 'closed' : '')}>{item.closed ? 'Closed' : '● Live now'}</span><h3>{item.title}</h3><div className="card-bottom"><span><b>{total(item)}</b> {total(item) === 1 ? 'person voted' : 'people voted'}</span><span className="card-arrow">↗</span></div></div></button> })}</div> : <div className="empty"><span>✳</span><h2>{polls.length ? 'Nothing in this category yet.' : 'Your first poll starts here.'}</h2><p>{polls.length ? 'Pick another category or create a new poll.' : 'Choose a category, ask a question, and invite your audience.'}</p><button className="button" onClick={() => navigate('/create')}>Create a poll ↗</button></div>}</section> : <section className="panel auth-panel"><h1>Sign in to see your polls.</h1><button className="button" onClick={() => navigate('/login')}>Sign in ↗</button></section>)}
      {page === '/create' && (session ? <section className="workspace creator"><button className="back" onClick={() => navigate('/dashboard')}>← Back to studio</button><div className="eyebrow">CREATE / NEW EXPERIENCE</div><h1>Give your question<br/><em>its own world.</em></h1><p>Choose the atmosphere, frame your question, and let the audience respond.</p><form onSubmit={create} className="create-form"><div className="label-title">01 / CHOOSE A CATEGORY</div><div className="category-grid">{CATEGORIES.map(item => <button key={item.id} type="button" aria-pressed={draft.category === item.id} onClick={() => setDraft({ ...draft, category: item.id })} className={`category-tile theme-${item.id} ${draft.category === item.id ? 'selected' : ''}`}><span>{item.icon}</span><strong>{item.label}</strong><small>{item.line}</small></button>)}</div><div className="label-title">02 / WRITE YOUR QUESTION</div><label>YOUR QUESTION<input required minLength="5" maxLength="160" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="What should we explore next?" /></label><label>DESCRIPTION <span className="optional">OPTIONAL</span><textarea maxLength="500" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Add context for your audience…" /></label><div className="label-title">03 / ANSWER OPTIONS <span className="optional">2 TO 8</span></div>{draft.options.map((value, i) => <div className="option-row" key={i}><span className="option-letter">{String(i + 1).padStart(2, '0')}</span><input required maxLength="100" value={value} onChange={e => setDraft({ ...draft, options: draft.options.map((option, index) => index === i ? e.target.value : option) })} placeholder={`Option ${i + 1}`} />{draft.options.length > 2 && <button type="button" aria-label="Remove option" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, index) => index !== i) })}>×</button>}</div>)}{draft.options.length < 8 && <button className="add-option" type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}>+ Add another option</button>}<div className="form-bottom"><span>One question can change the room.</span><button className="button" disabled={loading}>{loading ? 'Creating…' : 'Publish poll ↗'}</button></div></form></section> : <section className="panel auth-panel"><h1>Sign in to create a poll.</h1><button className="button" onClick={() => navigate('/login')}>Sign in ↗</button></section>)}
      {pollId && <section className="workspace poll-view"><button className="back" onClick={() => navigate(session ? '/dashboard' : '/')}>← {session ? 'My studio' : 'Home'}</button>{poll ? <><div className={`poll-intro theme-${activeCategory.id}`}><div className="poll-banner-top"><span className="eyebrow">{activeCategory.icon} / {activeCategory.label.toUpperCase()}</span><span className={live ? 'live-indicator' : 'offline-indicator'}>{live ? '● LIVE CONNECTION' : '○ RECONNECTING'}</span></div><h1>{poll.title}</h1>{poll.description && <p>{poll.description}</p>}<div className="poll-meta"><span className={'badge ' + (poll.closed ? 'closed' : '')}>{poll.closed ? 'Poll closed' : '● Voting open'}</span><span><strong>{total(poll)}</strong> {total(poll) === 1 ? 'person has voted' : 'people have voted'}</span></div><span className="poll-art-symbol">{activeCategory.icon}</span></div><div className="poll-layout"><div className="vote-box"><div className="eyebrow">{poll.closed ? 'FINAL OUTCOME' : 'THE LIVE MOMENT'}</div><h2>{voted || poll.closed ? 'The results are in.' : 'Cast your vote.'}</h2><p>{voted ? 'Your voice is in. Watch the results shift as others vote.' : poll.closed ? 'Voting has ended. Here is what the audience thought.' : 'Choose one answer. Every response moves the story forward.'}</p>{!voted && !poll.closed && <form onSubmit={vote} className="choices">{poll.options.map((option, i) => <label key={i} className={'choice ' + (choice === i ? 'selected' : '')}><input type="radio" name="choice" checked={choice === i} onChange={() => setChoice(i)} /><span className="option-letter">{String(i + 1).padStart(2, '0')}</span><span>{option.text}</span><span className="radio-circle" /></label>)}<button className="button full" disabled={choice === null || loading}>{loading ? 'Submitting…' : 'Submit vote ↗'}</button></form>}<div className="live-result-panel"><div className="result-head"><h3>{poll.closed ? 'Final results' : 'Live results'}</h3><span>{total(poll)} {total(poll) === 1 ? 'participant' : 'participants'}</span></div><Results poll={poll}/></div></div><aside className="share-box"><div className="share-icon">↗</div><div className="eyebrow">PASS IT ON</div><h3>Every voice changes the picture.</h3><p>Send the link to someone else. Their vote appears here in real time.</p><button className="button ghost full" onClick={share}>Copy poll link ⧉</button><div className="share-url">{location.origin + '/p/' + pollId}</div><div className="share-count"><strong>{total(poll)}</strong><span>people have joined<br/>this conversation</span></div>{managed && !poll.closed && <button className="close-poll" onClick={close} disabled={loading}>Close voting</button>}</aside></div></> : !error && <div className="loading-panel">Loading poll…</div>}</section>}
    </main><footer className="footer"><span className="brand-footer">◉ PULSEPOLL</span><span>Make every voice visible.</span><span>© {new Date().getFullYear()} PulsePoll</span></footer>
  </div>
}
export default App
