import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subStatus, setSubStatus] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Crypto payment flow state
  const [paymentRequest, setPaymentRequest] = useState(null); // { requestId, walletAddress, amount, expiresAt }
  const [paymentStatus, setPaymentStatus] = useState(null); // 'pending' | 'confirmed' | 'expired'
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user?.id) refreshSubStatus();
  }, [session]);

  function refreshSubStatus() {
    fetch(`/api/subscription-status?userId=${session.user.id}`)
      .then((r) => r.json())
      .then(setSubStatus)
      .catch(() => setSubStatus({ active: false, status: 'unknown' }));
  }

  // Countdown timer for payment window
  useEffect(() => {
    if (!paymentRequest) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(paymentRequest.expiresAt) - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setPaymentStatus('expired');
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [paymentRequest]);

  // Poll blockchain for matching payment
  useEffect(() => {
    if (!paymentRequest || paymentStatus === 'confirmed' || paymentStatus === 'expired') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    async function poll() {
      try {
        const res = await fetch(`/api/check-payment?requestId=${paymentRequest.requestId}`);
        const data = await res.json();
        setPaymentStatus(data.status);
        if (data.status === 'confirmed') {
          clearInterval(pollRef.current);
          setTimeout(refreshSubStatus, 500);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }
    poll();
    pollRef.current = setInterval(poll, 12000); // har 12 second check karo
    return () => clearInterval(pollRef.current);
  }, [paymentRequest, paymentStatus]);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setAuthError('✅ Signup ho gaya! Email check karo verification ke liye, phir login karo.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setAuthError(err.message);
    }
    setAuthLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSubStatus(null);
    setPaymentRequest(null);
    setPaymentStatus(null);
  }

  async function handleCreatePaymentRequest() {
    setCreatingRequest(true);
    try {
      const res = await fetch('/api/create-payment-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.user.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPaymentRequest(data);
      setPaymentStatus('pending');
    } catch (err) {
      alert(err.message);
    }
    setCreatingRequest(false);
  }

  function copyAddress() {
    navigator.clipboard.writeText(paymentRequest.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyAmount() {
    navigator.clipboard.writeText(String(paymentRequest.amount));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // ── LOADING ──
  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.loader}>Loading…</div>
      </div>
    );
  }

  // ── NOT LOGGED IN → SHOW LOGIN/SIGNUP ──
  if (!session) {
    return (
      <div style={styles.authWrap}>
        <div style={styles.authBox}>
          <div style={styles.logo}>⚡ DEEPSCAN PRO</div>
          <div style={styles.tagline}>Crypto Charting & Technical Analysis Tool</div>

          <div style={styles.tabRow}>
            <button
              style={authMode === 'login' ? styles.tabActive : styles.tab}
              onClick={() => setAuthMode('login')}
            >
              LOGIN
            </button>
            <button
              style={authMode === 'signup' ? styles.tabActive : styles.tab}
              onClick={() => setAuthMode('signup')}
            >
              SIGN UP
            </button>
          </div>

          <form onSubmit={handleAuth} style={styles.form}>
            <input
              style={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              style={styles.input}
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            {authError && <div style={styles.authMsg}>{authError}</div>}
            <button type="submit" style={styles.submitBtn} disabled={authLoading}>
              {authLoading ? '...' : authMode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'}
            </button>
          </form>

          <div style={styles.disclaimer}>
            DeepScan ek educational charting/analysis tool hai. Ye financial advice nahi hai.
          </div>
        </div>
      </div>
    );
  }

  // ── LOGGED IN BUT NOT SUBSCRIBED → CRYPTO PAYWALL ──
  if (!subStatus?.active) {
    return (
      <div style={styles.authWrap}>
        <div style={styles.authBox}>
          <div style={styles.logo}>⚡ DEEPSCAN PRO</div>
          <div style={styles.tagline}>Subscribe karo full access ke liye — USDT (TRC20)</div>

          {!paymentRequest && (
            <div style={styles.priceBox}>
              <div style={styles.priceAmount}>~$9.99<span style={styles.priceSub}>/30 days</span></div>
              <ul style={styles.featureList}>
                <li>✅ Live crypto charting (any symbol)</li>
                <li>✅ 8 pro-grade indicators (RSI, MACD, WaveTrend, VWAP, ADX, etc.)</li>
                <li>✅ Support/Resistance auto-detection</li>
                <li>✅ Candlestick pattern recognition</li>
                <li>✅ Real-time price updates (1 second)</li>
                <li>✅ Pay with USDT — no card needed</li>
              </ul>
              <button style={styles.subscribeBtn} onClick={handleCreatePaymentRequest} disabled={creatingRequest}>
                {creatingRequest ? 'Generating…' : 'PAY WITH USDT (TRC20)'}
              </button>
            </div>
          )}

          {paymentRequest && paymentStatus !== 'confirmed' && paymentStatus !== 'expired' && (
            <div style={styles.payBox}>
              <div style={styles.payTimer}>⏱ Time left: {fmtTime(secondsLeft)}</div>
              <div style={styles.payLabel}>Send EXACTLY this amount:</div>
              <div style={styles.payAmount} onClick={copyAmount}>
                {paymentRequest.amount} USDT <span style={styles.copyHint}>{copied ? '✓ copied' : '(tap to copy)'}</span>
              </div>
              <div style={styles.payLabel}>To this address (USDT-TRC20 / Tron network only):</div>
              <div style={styles.payAddress} onClick={copyAddress}>
                {paymentRequest.walletAddress}
              </div>
              <button style={styles.copyBtn} onClick={copyAddress}>
                {copied ? '✓ Copied!' : '📋 Copy Address'}
              </button>
              <div style={styles.payWarning}>
                ⚠️ Amount EXACT hona chahiye ({paymentRequest.amount} USDT), warna payment match nahi hoga.
                Sirf TRC20 (Tron) network use karo — kisi aur network se bheja gaya USDT nahi milega.
              </div>
              <div style={styles.payStatus}>
                <span style={styles.spinner}></span> Blockchain pe confirm hone ka wait kar rahe hain…
              </div>
            </div>
          )}

          {paymentStatus === 'expired' && (
            <div style={styles.payBox}>
              <div style={{ color: '#ff2d6f', fontFamily: 'monospace', fontSize: 13, textAlign: 'center', marginBottom: 14 }}>
                ⏱ Payment window expire ho gaya
              </div>
              <button style={styles.subscribeBtn} onClick={() => { setPaymentRequest(null); setPaymentStatus(null); }}>
                TRY AGAIN
              </button>
            </div>
          )}

          <button style={styles.logoutLink} onClick={handleLogout}>Logout</button>

          <div style={styles.disclaimer}>
            Educational analysis tool — financial advice nahi hai. Trading mein risk hota hai.
            Crypto transactions irreversible hain — amount aur address dhyan se check karo.
          </div>
        </div>
      </div>
    );
  }

  // ── SUBSCRIBED → SHOW THE TOOL ──
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={styles.topBar}>
        <span style={styles.topBarLogo}>⚡ DEEPSCAN PRO</span>
        <div style={styles.topBarRight}>
          <span style={styles.expiryNote}>
            Expires: {subStatus.currentPeriodEnd ? new Date(subStatus.currentPeriodEnd).toLocaleDateString() : '—'}
          </span>
          <button style={styles.topBarBtn} onClick={handleLogout}>LOGOUT</button>
        </div>
      </div>
      <iframe
        src="/deepscan-app.html"
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="DeepScan Pro"
      />
    </div>
  );
}

const styles = {
  center: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#02020a' },
  loader: { color: '#00ffb3', fontFamily: 'monospace', fontSize: 14, letterSpacing: 2 },
  authWrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(ellipse at top, #0d0d22, #02020a)', padding: 20,
  },
  authBox: {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, padding: '32px 28px', maxWidth: 380, width: '100%',
    backdropFilter: 'blur(20px)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
  },
  logo: {
    fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#00ffb3',
    textAlign: 'center', letterSpacing: 3, textShadow: '0 0 15px rgba(0,255,179,0.5)',
  },
  tagline: { fontFamily: 'monospace', fontSize: 11, color: '#787890', textAlign: 'center', marginTop: 6, marginBottom: 24 },
  tabRow: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: {
    flex: 1, padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, color: '#787890', fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, cursor: 'pointer',
  },
  tabActive: {
    flex: 1, padding: '10px', background: 'rgba(77,159,255,0.15)', border: '1px solid rgba(77,159,255,0.5)',
    borderRadius: 10, color: '#4d9fff', fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, cursor: 'pointer', fontWeight: 700,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
    padding: '12px 14px', color: '#fff', fontFamily: 'monospace', fontSize: 13, outline: 'none',
  },
  authMsg: { color: '#fbbf24', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 },
  submitBtn: {
    background: 'linear-gradient(135deg,#4d9fff,#7c3aed)', border: 'none', borderRadius: 10,
    padding: '13px', color: '#fff', fontFamily: 'monospace', fontWeight: 700, fontSize: 12,
    letterSpacing: 1, cursor: 'pointer', marginTop: 4,
  },
  priceBox: {
    background: 'rgba(0,255,179,0.05)', border: '1px solid rgba(0,255,179,0.25)',
    borderRadius: 16, padding: 20, textAlign: 'center', marginBottom: 16,
  },
  priceAmount: { fontFamily: 'monospace', fontSize: 32, fontWeight: 700, color: '#00ffb3' },
  priceSub: { fontSize: 13, color: '#787890' },
  featureList: {
    listStyle: 'none', padding: 0, margin: '16px 0', textAlign: 'left',
    fontFamily: 'monospace', fontSize: 11, color: '#b0b0c8', lineHeight: 2.2,
  },
  subscribeBtn: {
    width: '100%', background: 'linear-gradient(135deg,#00ffb3,#00cc90)', border: 'none', borderRadius: 10,
    padding: '14px', color: '#000', fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
    letterSpacing: 1, cursor: 'pointer',
  },
  logoutLink: {
    background: 'none', border: 'none', color: '#484868', fontFamily: 'monospace',
    fontSize: 10, textAlign: 'center', width: '100%', cursor: 'pointer', marginTop: 4,
  },
  payBox: {
    background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.25)',
    borderRadius: 16, padding: 18, marginBottom: 16,
  },
  payTimer: {
    fontFamily: 'monospace', fontSize: 12, color: '#fbbf24', textAlign: 'center',
    marginBottom: 14, fontWeight: 700, letterSpacing: 1,
  },
  payLabel: {
    fontFamily: 'monospace', fontSize: 9, color: '#787890', letterSpacing: 1, marginBottom: 5,
  },
  payAmount: {
    fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#00ffb3',
    background: 'rgba(0,255,179,0.08)', border: '1px solid rgba(0,255,179,0.3)',
    borderRadius: 10, padding: '10px 12px', marginBottom: 14, cursor: 'pointer',
    textAlign: 'center', wordBreak: 'break-all',
  },
  copyHint: { fontSize: 9, color: '#484868', fontWeight: 400 },
  payAddress: {
    fontFamily: 'monospace', fontSize: 11, color: '#d0d0f0',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '10px 12px', marginBottom: 10, cursor: 'pointer',
    wordBreak: 'break-all', lineHeight: 1.5,
  },
  copyBtn: {
    width: '100%', background: 'rgba(77,159,255,0.15)', border: '1px solid rgba(77,159,255,0.4)',
    borderRadius: 10, padding: '10px', color: '#4d9fff', fontFamily: 'monospace',
    fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', marginBottom: 14,
  },
  payWarning: {
    fontFamily: 'monospace', fontSize: 9, color: '#fbbf24', lineHeight: 1.6,
    background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
    borderRadius: 8, padding: '8px 10px', marginBottom: 14,
  },
  payStatus: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'monospace', fontSize: 10, color: '#22d3ee',
  },
  spinner: {
    width: 10, height: 10, borderRadius: '50%', border: '2px solid rgba(34,211,238,0.2)',
    borderTopColor: '#22d3ee', display: 'inline-block', animation: 'spin 1s linear infinite',
  },
  expiryNote: {
    fontFamily: 'monospace', fontSize: 9, color: '#787890', marginRight: 12,
  },
  topBarRight: { display: 'flex', alignItems: 'center' },
  disclaimer: {
    fontFamily: 'monospace', fontSize: 8, color: '#3a3a55', textAlign: 'center',
    marginTop: 18, lineHeight: 1.6, letterSpacing: 0.5,
  },
  topBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 16px', background: '#05050f', borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  topBarLogo: { fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#00ffb3', letterSpacing: 2 },
  topBarBtn: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
    padding: '6px 12px', color: '#b0b0c8', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1,
    cursor: 'pointer', marginLeft: 8,
  },
};
