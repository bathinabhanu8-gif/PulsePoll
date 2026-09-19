import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API = '/api'
async function request(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) } })
  let data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again.')
  return data
}
function getVoter() {
  let id = localStorage.getItem('pulsepoll-voter')
  if (!id) { id = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem('pulsepoll-voter', id) }
  return id
}
const total = p => p.options.reduce((sum, o) => sum + o.votes, 0)
function App() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('pulsepoll-session')) } catch { return null } })
  const [page, setPage] = useState(location.pathname)
  const [polls, setPolls] = useState([])
  const [poll, setPoll] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [live, setLive] = useState(false)
  const [authMode, setAuthMode] = useState('signup')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [draft, setDraft] = useState({ title: '', description: '', options: ['', ''] })
  const [choice, setChoice] = useState(null)
  const [voted, setVoted] = useState(false)
  const pollId = useMemo(() => page.startsWith('/p/') ? page.split('/')[2] : null, [page])
  function navigate(path) { history.pushState({}, '', path); setPage(path); setError(''); setMessage(''); scrollTo(0, 0) }
  useEffect(() => { const handler = () => setPage(location.pathname); addEventListener('popstate', handler); return () => removeEventListener('popstate', handler) }, [])
  useEffect(() => { if (!session) return; request('/polls', { token: session.token }).then(setPolls).catch(e => setError(e.message)) }, [session])
  useEffect(() => {
    if (!pollId) return
    setPoll(null); setChoice(null); setVoted(localStorage.getItem('pulsepoll-voted-' + pollId) === 'yes')
    request('/polls/' + pollId).then(setPoll).catch(e => setError(e.message))
    const stream = new EventSource(API + '/polls/' + pollId + '/events')
    stream.onopen = () => setLive(true)
    stream.onerror = () => setLive(false)
    stream.addEventListener('poll', e => { try { setPoll(JSON.parse(e.data)) } catch { /* retry on reconnect */ } })
    return () => { stream.close(); setLive(false) }
  }, [pollId])
  function toast(msg) { setMessage(msg); setTimeout(() => setMessage(''), 4000) }
  async function submitAuth(e) {
    e.preventDefault(); setLoading(true); setError('')
    try { const data = await request('/auth/' + authMode, { method: 'POST', body: JSON.stringify(form) }); localStorage.setItem('pulsepoll-session', JSON.stringify(data)); setSession(data); navigate('/dashboard') }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  async function create(e) {
    e.preventDefault(); setLoading(true); setError('')
    try { const data = await request('/polls', { method: 'POST', token: session.token, body: JSON.stringify(draft) }); setDraft({ title: '', description: '', options: ['', ''] }); navigate('/p/' + data.id); toast('Poll created. Your share link is ready.') }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  async function vote(e) {
    e.preventDefault(); if (choice === null) return
    setLoading(true); setError('')
    try { await request('/polls/' + pollId + '/votes', { method: 'POST', body: JSON.stringify({ option: choice, voter: getVoter() }) }); localStorage.setItem('pulsepoll-voted-' + pollId, 'yes'); setVoted(true); setPoll(await request('/polls/' + pollId)); toast('Your vote has been counted.') }
    catch (e) { if (e.message.includes('already voted')) { setVoted(true); localStorage.setItem('pulsepoll-voted-' + pollId, 'yes') } setError(e.message) } finally { setLoading(false) }
  }
  async function close() {
    if (!confirm('Close this poll? New votes will no longer be accepted.')) return
    setLoading(true); setError('')
    try { await request('/polls/' + pollId + '/close', { method: 'PATCH', token: session.token }); setPoll(await request('/polls/' + pollId)); toast('Poll closed.') }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  async function share() { try { await navigator.clipboard.writeText(location.href); toast('Link copied to clipboard.') } catch { toast('Copy the address from your browser to share.') } }
  function signout() { localStorage.removeItem('pulsepoll-session'); setSession(null); navigate('/') }
  const managed = poll && polls.some(p => p.id === poll.id)
  return <div className="app">
    <header className="nav"><button className="brand" onClick={() => navigate('/')}><span className="brand-mark">P<span>•</span></span> pulse<span className="brand-light">poll</span></button><nav><button className="nav-link" onClick={() => navigate('/dashboard')}>My polls</button>{session ? <><span className="hello">Hi, {session.user.name.split(' ')[0]}</span><button className="button small ghost" onClick={signout}>Sign out</button></> : <button className="button small" onClick={() => navigate('/login')}>Get started <span>↗</span></button>}</nav></header>
    <main>
      {error && <div className="notice error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
      {message && <div className="notice success" role="status">{message}</div>}
      {page === '/' && <><section className="hero"><div className="eyebrow"><span className="dot"/> MEETINGS, CLASSES, COMMUNITIES</div><h1>Good questions.<br/><em>Instant answers.</em></h1><p>Create a poll in seconds. Share one link. Watch the room come alive as every vote lands in real time.</p><div className="hero-actions"><button className="button large" onClick={() => navigate(session ? '/create' : '/login')}>Create your first poll <span>↗</span></button><button className="text-button" onClick={() => document.querySelector('#how')?.scrollIntoView({ behavior: 'smooth' })}>See how it works ↓</button></div><div className="hero-foot"><span className="avatars">◉ ◉ ◉</span> Made for the moments that need everyone's voice.</div></section><section className="feature-wrap" id="how"><div className="feature-heading"><div><div className="eyebrow">SIMPLE BY DESIGN</div><h2>From question to clarity.</h2></div><p>Everything you need for a great live poll. Nothing getting in the way.</p></div><div className="features"><article><span className="feature-icon">✳</span><span className="feature-number">01 / CREATE</span><h3>Ask anything.</h3><p>Add your question and up to eight thoughtful options. Your poll is ready the moment you hit create.</p></article><article><span className="feature-icon">↗</span><span className="feature-number">02 / SHARE</span><h3>One link. Everyone in.</h3><p>Send your link to your audience. They can vote without making an account.</p></article><article><span className="feature-icon">▥</span><span className="feature-number">03 / DISCOVER</span><h3>Feel the momentum.</h3><p>Results shift live on every connected screen. No refresh. No waiting.</p></article></div></section></>}
      {page === '/login' && <section className="panel auth-panel"><div className="eyebrow">YOUR SPACE STARTS HERE</div><h1>{authMode === 'signup' ? 'Make your voice count.' : 'Welcome back.'}</h1><p>Sign {authMode === 'signup' ? 'up to create polls that bring people together.' : 'in to create and manage your polls.'}</p><form onSubmit={submitAuth}>{authMode === 'signup' && <label>Your name<input required minLength="2" maxLength="70" autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>}<label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label><label>Password<input required type="password" minLength="8" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></label><button className="button full" disabled={loading}>{loading ? 'Please wait…' : authMode === 'signup' ? 'Create account ↗' : 'Sign in ↗'}</button></form><p className="switch">{authMode === 'signup' ? 'Already have an account?' : 'New to PulsePoll?'} <button onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setError('') }}>{authMode === 'signup' ? 'Sign in' : 'Create account'}</button></p></section>}
      {page === '/dashboard' && (session ? <section className="workspace"><div className="workspace-top"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>Your polls<span className="accent">.</span></h1><p>Every conversation starts somewhere.</p></div><button className="button" onClick={() => navigate('/create')}>+ Create poll</button></div><div className="dashboard-stats"><div><strong>{polls.length}</strong><span>Total polls</span></div><div><strong>{polls.reduce((a, p) => a + total(p), 0)}</strong><span>Votes collected</span></div><div><strong>{polls.filter(p => !p.closed).length}</strong><span>Live right now</span></div></div><div className="section-label">ALL POLLS</div>{polls.length ? <div className="poll-grid">{polls.map(p => <button className="poll-card" key={p.id} onClick={() => navigate('/p/' + p.id)}><span className={'badge ' + (p.closed ? 'closed' : '')}>{p.closed ? 'Closed' : '● Live'}</span><h3>{p.title}</h3><p>{p.options.length} choices · {total(p)} votes</p><span className="card-arrow">↗</span></button>)}</div> : <div className="empty"><span>✳</span><h2>Your first poll starts here.</h2><p>Ask a question, share the link, and see answers arrive live.</p><button className="button" onClick={() => navigate('/create')}>Create a poll ↗</button></div>}</section> : <section className="panel auth-panel"><h1>Sign in to see your polls.</h1><button className="button" onClick={() => navigate('/login')}>Sign in ↗</button></section>)}
      {page === '/create' && (session ? <section className="workspace creator"><button className="back" onClick={() => navigate('/dashboard')}>← Back to polls</button><div className="eyebrow">NEW POLL</div><h1>Start with a <em>question.</em></h1><p>Make it clear. Make it interesting. Let your audience do the rest.</p><form onSubmit={create} className="create-form"><label>YOUR QUESTION<input required minLength="5" maxLength="160" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="What should we explore next?" /></label><label>DESCRIPTION <span className="optional">OPTIONAL</span><textarea maxLength="500" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Add a little context for your audience…" /></label><div className="label-title">ANSWER OPTIONS <span className="optional">2 TO 8</span></div>{draft.options.map((v, i) => <div className="option-row" key={i}><span className="option-letter">{String.fromCharCode(65 + i)}</span><input required maxLength="100" value={v} onChange={e => setDraft({ ...draft, options: draft.options.map((o, n) => n === i ? e.target.value : o) })} placeholder={`Option ${i + 1}`} />{draft.options.length > 2 && <button type="button" aria-label="Remove option" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, n) => n !== i) })}>×</button>}</div>)}{draft.options.length < 8 && <button className="add-option" type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}>+ Add another option</button>}<div className="form-bottom"><span>Ready when you are.</span><button className="button" disabled={loading}>{loading ? 'Creating…' : 'Publish poll ↗'}</button></div></form></section> : <section className="panel auth-panel"><h1>Sign in to create a poll.</h1><button className="button" onClick={() => navigate('/login')}>Sign in ↗</button></section>)}
      {pollId && <section className="workspace poll-view"><button className="back" onClick={() => navigate(session ? '/dashboard' : '/')}>← {session ? 'My polls' : 'Home'}</button>{poll ? <><div className="poll-intro"><div className="eyebrow">THE LIVE POLL <span className={live ? 'live-indicator' : 'offline-indicator'}>{live ? '● Connected live' : '○ Reconnecting…'}</span></div><h1>{poll.title}</h1>{poll.description && <p>{poll.description}</p>}<div className="poll-meta"><span className={'badge ' + (poll.closed ? 'closed' : '')}>{poll.closed ? 'Poll closed' : '● Voting open'}</span><span>{total(poll)} {total(poll) === 1 ? 'vote' : 'votes'} so far</span></div></div><div className="poll-layout"><div className="vote-box"><h2>{voted || poll.closed ? 'The results are in.' : 'Cast your vote.'}</h2><p>{voted ? 'Thanks for having your say. Watch results update as others vote.' : poll.closed ? 'Voting has ended. Here’s what everyone thought.' : 'Choose one answer below. One vote per device.'}</p>{!voted && !poll.closed ? <form onSubmit={vote} className="choices">{poll.options.map((o, i) => <label key={i} className={'choice ' + (choice === i ? 'selected' : '')}><input type="radio" name="choice" checked={choice === i} onChange={() => setChoice(i)} /><span className="option-letter">{String.fromCharCode(65 + i)}</span><span>{o.text}</span><span className="radio-circle" /></label>)}<button className="button full" disabled={choice === null || loading}>{loading ? 'Submitting…' : 'Submit vote ↗'}</button></form> : <div className="results">{poll.options.map((o, i) => <div className="result" key={i}><div className="result-top"><span><b>{String.fromCharCode(65 + i)}</b> {o.text}</span><strong>{total(poll) ? Math.round(o.votes / total(poll) * 100) : 0}%</strong></div><div className="track"><div style={{ width: `${total(poll) ? o.votes / total(poll) * 100 : 0}%` }} /></div><small>{o.votes} {o.votes === 1 ? 'vote' : 'votes'}</small></div>)}</div>}</div><aside className="share-box"><div className="share-icon">↗</div><h3>Better together.</h3><p>Share this poll with your people. Every new vote shows up live.</p><button className="button ghost full" onClick={share}>Copy poll link ⧉</button><div className="share-url">{location.origin + '/p/' + pollId}</div>{managed && !poll.closed && <button className="close-poll" onClick={close} disabled={loading}>Close voting</button>}</aside></div></> : !error && <div className="loading-panel">Loading poll…</div>}</section>}
    </main><footer className="footer"><span className="brand-footer">P<span>•</span> pulsepoll</span><span>Make every voice visible.</span><span>© {new Date().getFullYear()} PulsePoll</span></footer>
  </div>
}
export default App
