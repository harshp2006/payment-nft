import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { playMintSound, playTierUpgradeSound, playErrorSound } from './sounds'

// ── Arc Config ───────────────────────────────────────────────────────────────
const ARC_CHAIN_ID = '0x4CEF52'
const RPC = 'https://5042002.rpc.thirdweb.com'
const ARC_EXPLORER = 'https://testnet.arcscan.app'
const CONTRACT_ADDRESS = '0xAbc942e33C1f92B53A9Acc217c85f0edB913F165'
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

const NFT_ABI = [
  'function registerMerchant(string name, string category, string description, string websiteUrl, string logoUrl, uint8 collectionId) external',
  'function setCollection(uint8 collectionId) external',
  'function payMerchant(address merchant, uint256 amount) external',
  'function getLoyaltyTier(address buyer, address merchant) external view returns (uint8)',
  'function getWhaleTier(address buyer, address merchant) external view returns (uint8)',
  'function getPaymentCount(address buyer, address merchant) external view returns (uint256)',
  'function getTotalSpent(address buyer, address merchant) external view returns (uint256)',
  'function merchants(address) external view returns (bool registered, string name, string category, string description, string websiteUrl, string logoUrl, uint8 collectionId, uint256 totalPaymentsReceived, uint256 totalUsdcReceived)',
  'function getBuyerStats(address buyer) external view returns (uint256 totalSpentAllMerchants, uint256 uniqueMerchantCount)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'event PaymentMade(address indexed buyer, address indexed merchant, uint256 amount, uint256 tokenId)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
]

const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
]

const COLLECTIONS = [
  { name: 'Cosmic', bg: '#0D0D2B', accent: '#7B2FBE', tags: ['Deep Space', 'Mystical', 'Nebula'] },
  { name: 'Samurai', bg: '#1A0A0A', accent: '#CC2200', tags: ['Honor', 'Katana', 'Crimson'] },
  { name: 'Nature', bg: '#0A1F0A', accent: '#2D6A2D', tags: ['Growth', 'Forest', 'Earthy'] },
  { name: 'Cyberpunk', bg: '#050510', accent: '#00FFFF', tags: ['Neon', 'Future', 'Glitch'] },
  { name: 'Royal', bg: '#1A0D2E', accent: '#DAA520', tags: ['Majestic', 'Luxury', 'Gold'] },
  { name: 'Ocean', bg: '#020D1A', accent: '#0077B6', tags: ['Tidal', 'Abyss', 'Azure'] }
]

const LOYALTY_TIERS = ['Bronze', 'Silver', 'Gold']
const WHALE_TIERS = ['Copper', 'Pearl', 'Diamond']
const LOYALTY_COLORS = ['#CD7F32', '#C0C0C0', '#FFD700']
const WHALE_COLORS = ['#B87333', '#EAE0C8', '#B9F2FF']

// ── Helpers ──────────────────────────────────────────────────────────────────
const short = a => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''
const formatUSDC = v => ethers.formatUnits(v || 0, 6)
const parseUSDC = v => ethers.parseUnits(v || '0', 6)

function decodeTokenURI(uri) {
  try { return JSON.parse(atob(uri.split(',')[1])) } catch { return null }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

async function switchToArc() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x4CEF52' }],
    })
  } catch (e) {
    if (e.code === 4902 || e.code === -32603) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x4CEF52',
          chainName: 'Arc Testnet',
          nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
          rpcUrls: ['https://5042002.rpc.thirdweb.com'],
          blockExplorerUrls: ['https://testnet.arcscan.app'],
        }],
      })
    } else { throw e }
  }
}

async function getFreshSigner() {
  const provider = new ethers.BrowserProvider(window.ethereum)
  return provider.getSigner()
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('merchant')
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(false)
  const [buyerPreload, setBuyerPreload] = useState('')

  const connectWallet = async () => {
    if (!window.ethereum) return alert('MetaMask not found')
    try {
      setLoading(true)
      await switchToArc()
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setAccount(accs[0])
    } catch (e) { console.error(e); playErrorSound() }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!window.ethereum) return
    window.ethereum.request({ method: 'eth_accounts' }).then(accs => { if (accs[0]) setAccount(accs[0]) })
    window.ethereum.on('accountsChanged', accs => setAccount(accs[0] || null))
    window.ethereum.on('chainChanged', () => window.location.reload())
  }, [])

  // Handle URL pre-fill for merchant profile
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const m = params.get('merchant')
    if (m && ethers.isAddress(m)) {
      setBuyerPreload(m)
      setTab('profile')
    }
  }, [])

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="logo-section">
          <div className="logo-v2">Payment<span>NFT</span></div>
          <div className="network-pill">Arc Testnet</div>
        </div>
        <div className="header-actions">
          {account ? (
            <div className="account-chip">
              <span className="dot" />
              {short(account)}
            </div>
          ) : (
            <button className="btn btn-connect" onClick={connectWallet} disabled={loading}>
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      <nav className="tab-nav">
        {[
          { id: 'merchant', icon: '🏪', label: 'Merchant Dashboard' },
          { id: 'buyer', icon: '🛒', label: 'Buyer Dashboard' },
          { id: 'profile', icon: '👤', label: 'Merchant Profile' },
          { id: 'stats', icon: '📊', label: 'My Stats' }
        ].map(t => (
          <button 
            key={t.id} 
            className={`nav-item ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="content-area">
        {tab === 'merchant' && <MerchantDashboard account={account} connect={connectWallet} />}
        {tab === 'buyer' && <BuyerDashboard account={account} connect={connectWallet} preload={buyerPreload} setBuyerPreload={setBuyerPreload} />}
        {tab === 'profile' && <MerchantProfile account={account} preload={buyerPreload} setTab={setTab} setBuyerPreload={setBuyerPreload} />}
        {tab === 'stats' && <MyStats account={account} connect={connectWallet} />}
      </main>

      <footer className="main-footer">
        <p>Built for Arc Testnet &copy; 2026 PaymentNFT V2</p>
      </footer>
    </div>
  )
}

// ── Tab 1: Merchant Dashboard ────────────────────────────────────────────────
function MerchantDashboard({ account, connect }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [regForm, setRegForm] = useState({ name: '', category: 'Food', desc: '', website: '', logo: '', collection: 0 })
  const [submitting, setSubmitting] = useState(false)
  const [showCollModal, setShowCollModal] = useState(false)
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const fetchMerchant = useCallback(async () => {
    if (!account) return setLoading(false)
    try {
      const provider = new ethers.JsonRpcProvider(RPC)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider)
      const data = await contract.merchants(account)
      if (data.registered) {
        setInfo({
          name: data.name,
          category: data.category,
          desc: data.description,
          website: data.websiteUrl,
          logo: data.logoUrl,
          collection: Number(data.collectionId),
          payments: Number(data.totalPaymentsReceived),
          usdc: data.totalUsdcReceived
        })
      } else {
        setInfo(null)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [account])

  useEffect(() => { fetchMerchant() }, [fetchMerchant])

  const handleRegister = async () => {
    try {
      setSubmitting(true)
      await switchToArc()
      const signer = await getFreshSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer)
      const tx = await contract.registerMerchant(
        regForm.name, regForm.category, regForm.desc, regForm.website, regForm.logo, regForm.collection
      )
      await tx.wait()
      await fetchMerchant()
    } catch (e) { 
      console.error(e)
      playErrorSound()
      alert('Registration failed')
    }
    finally { setSubmitting(false) }
  }

  const handleUpdateColl = async (id) => {
    try {
      setSubmitting(true)
      await switchToArc()
      const signer = await getFreshSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer)
      const tx = await contract.setCollection(id)
      await tx.wait()
      await fetchMerchant()
      setShowCollModal(false)
    } catch (e) { 
      console.error(e)
      playErrorSound()
      alert('Changing collection failed')
    }
    finally { setSubmitting(false) }
  }

  const copyAddr = () => {
    navigator.clipboard.writeText(account)
    setCopiedAddr(true)
    setTimeout(() => setCopiedAddr(false), 2000)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`https://payment-nft.vercel.app/?merchant=${account}`)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  if (!account) return <div className="empty-state"><h3>Connect your wallet to access the Merchant Dashboard</h3><button className="btn btn-primary" onClick={connect}>Connect Wallet</button></div>
  if (loading) return <div className="loading-spinner">Loading...</div>

  if (!info) {
    return (
      <div className="card reg-card">
        <h2>Register as a Merchant</h2>
        <div className="form-group">
          <label>Merchant Name *</label>
          <input type="text" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} placeholder="e.g. Arc Coffee" />
        </div>
        <div className="form-group">
          <label>Category</label>
          <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})}>
            {['Food', 'Retail', 'Services', 'Entertainment', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Description ({regForm.desc.length}/200)</label>
          <textarea maxLength={200} value={regForm.desc} onChange={e => setRegForm({...regForm, desc: e.target.value})} placeholder="Tell your customers about your business..." />
        </div>
        <div className="form-group">
          <label>Website URL</label>
          <input type="text" value={regForm.website} onChange={e => setRegForm({...regForm, website: e.target.value})} placeholder="https://..." />
        </div>
        <div className="form-group">
          <label>Logo URL</label>
          <input type="text" value={regForm.logo} onChange={e => setRegForm({...regForm, logo: e.target.value})} placeholder="https://image.url" />
          {regForm.logo && <div className="logo-preview"><img src={regForm.logo} alt="Logo Preview" onError={(e) => { e.target.style.display = 'none' }} /></div>}
        </div>
        <div className="form-group">
          <label>Choose Your Collection</label>
          <div className="collection-grid">
            {COLLECTIONS.map((c, i) => (
              <div 
                key={c.name} 
                className={`coll-card ${regForm.collection === i ? 'selected' : ''}`}
                onClick={() => setRegForm({...regForm, collection: i})}
              >
                <div className="coll-preview" style={{ background: c.bg, border: `2px solid ${c.accent}` }} />
                <div className="coll-info">
                  <div className="coll-name" style={{ color: c.accent }}>{c.name}</div>
                  <ul className="coll-tags">
                    {c.tags.map(t => <li key={t}>{t}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button 
          className="btn btn-primary btn-full" 
          disabled={!regForm.name || submitting} 
          onClick={handleRegister}
        >
          {submitting ? 'Registering...' : 'Complete Registration'}
        </button>
      </div>
    )
  }

  return (
    <div className="merchant-dashboard">
      <div className="card profile-header-card">
        <div className="profile-top">
          <div className="profile-logo">
            {info.logo ? <img src={info.logo} alt={info.name} onError={(e) => { e.target.src = 'https://via.placeholder.com/100?text=No+Logo' }} /> : <img src="https://via.placeholder.com/100?text=No+Logo" alt={info.name} />}
          </div>
          <div className="profile-text">
            <h3>{info.name} <span className="badge-category">{info.category}</span></h3>
            <p className="merchant-desc">{info.desc}</p>
          </div>
        </div>
        <div className="stats-row">
          <div className="stat-item"><label>Total Payments</label><div className="val">{info.payments}</div></div>
          <div className="stat-item"><label>USDC Received</label><div className="val">{formatUSDC(info.usdc)}</div></div>
        </div>
      </div>

      <div className="card coll-display-card">
        <div className="coll-current">
          <div className="coll-label">Active Collection</div>
          <div className="coll-name-large" style={{ color: COLLECTIONS[info.collection].accent }}>{COLLECTIONS[info.collection].name}</div>
          <button className="btn btn-secondary" onClick={() => setShowCollModal(true)}>Change Collection</button>
        </div>
      </div>

      <div className="card share-card">
        <h3>Share Your Profile</h3>
        <div className="share-actions">
          <div className="addr-box">
            <code>{account}</code>
            <button className="btn-copy" onClick={copyAddr}>
              {copiedAddr ? 'Copied! ✓' : '📋 Copy Address'}
            </button>
          </div>
          <button className="btn btn-primary" onClick={copyLink}>
            {copiedLink ? 'Link Copied! ✓' : 'Share Profile Link'}
          </button>
          <a href={`${ARC_EXPLORER}/address/${account}`} target="_blank" rel="noreferrer" className="explorer-link">
            View on Explorer ↗
          </a>
        </div>
      </div>

      {showCollModal && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h2>Select New Collection</h2>
            <div className="collection-grid">
              {COLLECTIONS.map((c, i) => (
                <div 
                  key={c.name} 
                  className={`coll-card ${info.collection === i ? 'selected' : ''}`}
                  onClick={() => handleUpdateColl(i)}
                >
                  <div className="coll-preview" style={{ background: c.bg, border: `2px solid ${c.accent}` }} />
                  <div className="coll-name" style={{ color: c.accent }}>{c.name}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-outline btn-full" style={{ marginTop: '20px' }} onClick={() => setShowCollModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Buyer Dashboard ───────────────────────────────────────────────────
function BuyerDashboard({ account, connect, preload, setBuyerPreload }) {
  const [merchant, setMerchant] = useState(preload || '')
  const [mInfo, setMInfo] = useState(null)
  const [mValid, setMValid] = useState(false)
  const [amount, setAmount] = useState('0.1')
  const [status, setStatus] = useState({ step: 1, loading: false, error: '' })
  const [allowance, setAllowance] = useState(0n)
  const [lastTx, setLastTx] = useState(null)
  const [buyerStats, setBuyerStats] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    if (!account) return
    const stored = localStorage.getItem(`pnft_v2_history_${account.toLowerCase()}`)
    if (stored) setHistory(JSON.parse(stored))
  }, [account])

  const checkAllowance = useCallback(async () => {
    if (!account) return
    try {
      const provider = new ethers.JsonRpcProvider(RPC)
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider)
      const allowed = await usdc.allowance(account, CONTRACT_ADDRESS)
      setAllowance(allowed)
    } catch (e) { console.error("Allowance check error:", e) }
  }, [account])

  const fetchStats = useCallback(async () => {
    if (!account || !merchant || !ethers.isAddress(merchant)) return
    try {
      const provider = new ethers.JsonRpcProvider(RPC)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider)
      const [count, spent, lTier, wTier] = await Promise.all([
        contract.getPaymentCount(account, merchant),
        contract.getTotalSpent(account, merchant),
        contract.getLoyaltyTier(account, merchant),
        contract.getWhaleTier(account, merchant)
      ])
      setBuyerStats({
        count: Number(count),
        spent: spent,
        loyalty: Number(lTier),
        whale: Number(wTier)
      })
    } catch (e) { console.error(e) }
  }, [account, merchant])

  useEffect(() => {
    if (!ethers.isAddress(merchant)) { setMValid(false); setMInfo(null); return }
    const provider = new ethers.JsonRpcProvider(RPC)
    const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider)
    contract.merchants(merchant).then(data => {
      if (data.registered) {
        setMValid(true)
        setMInfo({ name: data.name, category: data.category, desc: data.description, logo: data.logoUrl, website: data.websiteUrl })
        fetchStats()
        checkAllowance()
      } else {
        setMValid(false); setMInfo(null)
      }
    }).catch(() => { setMValid(false); setMInfo(null) })
  }, [merchant, fetchStats, checkAllowance])

  useEffect(() => {
    checkAllowance()
  }, [amount, account, checkAllowance])

  const handlePayment = async () => {
    const amtUnits = parseUSDC(amount)
    if (amtUnits < 100000n) {
      setStatus(s => ({ ...s, error: 'Min payment is 0.1 USDC' }))
      playErrorSound()
      return
    }
    try {
      setStatus(s => ({ ...s, loading: true, error: '' }))
      await switchToArc()
      const signer = await getFreshSigner()
      
      // Step 1: Approve USDC
      if (allowance < amtUnits) {
        const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer)
        const tx = await usdc.approve(CONTRACT_ADDRESS, amtUnits)
        await tx.wait()
        await checkAllowance()
        setStatus(s => ({ ...s, step: 2, loading: false, error: '' }))
        return
      }

      // Step 2: Pay & Mint
      const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer)
      const tx = await nft.payMerchant(merchant, amtUnits)
      const receipt = await tx.wait()

      // Find Mint Transfer event
      const transferLog = receipt.logs.find(l => 
        l.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() && 
        l.topics[0] === ethers.id("Transfer(address,address,uint256)") &&
        l.topics[1] === ethers.zeroPadValue(ethers.ZeroAddress, 32)
      )
      
      let uri = ''
      if (transferLog) {
        const tid = BigInt(transferLog.topics[3])
        uri = await nft.tokenURI(tid)
      }

      playMintSound()
      const oldLoyalty = buyerStats?.loyalty || 0
      const oldWhale = buyerStats?.whale || 0
      
      // Fetch fresh stats
      const [count, spent, lTier, wTier] = await Promise.all([
        nft.getPaymentCount(account, merchant),
        nft.getTotalSpent(account, merchant),
        nft.getLoyaltyTier(account, merchant),
        nft.getWhaleTier(account, merchant)
      ])
      const freshStats = {
        count: Number(count),
        spent: spent,
        loyalty: Number(lTier),
        whale: Number(wTier)
      }
      setBuyerStats(freshStats)

      if (freshStats.loyalty > oldLoyalty || freshStats.whale > oldWhale) {
        playTierUpgradeSound()
      }

      const decoded = decodeTokenURI(uri)
      setLastTx({ hash: receipt.hash, svg: decoded?.image })

      // Save History
      const entry = {
        mName: mInfo.name,
        mAddr: merchant,
        amount: amount,
        loyalty: freshStats.loyalty,
        whale: freshStats.whale,
        ts: Date.now(),
        hash: receipt.hash,
        svg: decoded?.image
      }
      const nextHist = [entry, ...history].slice(0, 50)
      setHistory(nextHist)
      localStorage.setItem(`pnft_v2_history_${account.toLowerCase()}`, JSON.stringify(nextHist))
      await checkAllowance()
    } catch (e) {
      console.error(e)
      setStatus(s => ({ ...s, error: e.reason || e.message || 'Transaction failed', loading: false }))
      playErrorSound()
    } finally {
      setStatus(s => ({ ...s, loading: false }))
    }
  }

  // Next tier progress helpers
  const getLoyaltyProgress = () => {
    if (!buyerStats) return { pct: 0, text: '0/10 payments' }
    const c = buyerStats.count
    if (c < 10) return { pct: (c / 10) * 100, text: `${c}/10 payments (to Silver)` }
    if (c < 50) return { pct: ((c - 10) / 40) * 100, text: `${c}/50 payments (to Gold)` }
    return { pct: 100, text: `${c} payments (Gold - Max)` }
  }

  const getWhaleProgress = () => {
    if (!buyerStats) return { pct: 0, text: '0/25 USDC' }
    const s = Number(formatUSDC(buyerStats.spent))
    if (s < 25) return { pct: (s / 25) * 100, text: `${s.toFixed(1)}/25 USDC (to Pearl)` }
    if (s < 100) return { pct: ((s - 25) / 75) * 100, text: `${s.toFixed(1)}/100 USDC (to Diamond)` }
    return { pct: 100, text: `${s.toFixed(1)} USDC spent (Diamond - Max)` }
  }

  const loyaltyProg = getLoyaltyProgress()
  const whaleProg = getWhaleProgress()

  return (
    <div className="buyer-dashboard">
      <div className="card pay-card">
        <h2>Pay a Merchant</h2>
        <div className="form-group">
          <label>Merchant Wallet Address</label>
          <input 
            type="text" 
            value={merchant} 
            onChange={e => {
              setMerchant(e.target.value.trim())
              setBuyerPreload('') // Clear preload URL status on manual input
            }} 
            placeholder="0x..." 
            className="input-mono"
          />
          {ethers.isAddress(merchant) && (
            <div className={`addr-status ${mValid ? 'valid' : 'invalid'}`}>
              {mValid ? `✓ Found: ${mInfo.name}` : '✗ Merchant not registered'}
            </div>
          )}
        </div>

        {mValid && (
          <div className="merchant-mini-card">
            <div className="mini-logo">
              <img src={mInfo.logo || 'https://via.placeholder.com/50?text=Logo'} alt="" onError={(e) => { e.target.src = 'https://via.placeholder.com/50?text=Logo' }} />
            </div>
            <div className="mini-info">
              <div className="mini-name">{mInfo.name} <span className="mini-cat">{mInfo.category}</span></div>
              <div className="mini-desc">{mInfo.desc}</div>
              {mInfo.website && <a href={mInfo.website} target="_blank" rel="noreferrer" className="mini-link">Visit Website ↗</a>}
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Amount (USDC)</label>
          <div className="amount-input-row">
            <input type="number" step="0.1" min="0.1" value={amount} onChange={e => setAmount(e.target.value)} />
            <span className="unit">USDC</span>
          </div>
          <div className="pill-row">
            {[0.1, 0.5, 1.0, 5.0, 10.0].map(p => (
              <button key={p} className={`pill ${Number(amount) === p ? 'active' : ''}`} onClick={() => setAmount(p.toFixed(1))}>
                {p} USDC
              </button>
            ))}
          </div>
        </div>

        {status.error && <div className="error-banner">{status.error}</div>}

        <div className="payment-flow">
          <div className={`flow-step ${allowance >= parseUSDC(amount) ? 'done' : 'active'}`}>
            <div className="step-num">{allowance >= parseUSDC(amount) ? '✓' : '1'}</div>
            <div className="step-label">Approve USDC</div>
          </div>
          <div className={`flow-step ${allowance >= parseUSDC(amount) ? 'active' : ''}`}>
            <div className="step-num">2</div>
            <div className="step-label">Pay & Mint</div>
          </div>
        </div>

        <button 
          className="btn btn-primary btn-full" 
          disabled={!mValid || status.loading}
          onClick={handlePayment}
        >
          {status.loading ? 'Processing...' : allowance >= parseUSDC(amount) ? 'Pay & Mint NFT' : 'Approve USDC'}
        </button>
      </div>

      {lastTx && (
        <div className="card mint-success-card animate-slide-up">
          <div className="success-header">🎉 Payment Successful!</div>
          <div className="nft-preview-container">
            {lastTx.svg ? <img src={lastTx.svg} alt="Your New NFT" className="nft-preview-svg" /> : <div className="nft-preview-placeholder">No SVG Art Available</div>}
          </div>
          {buyerStats && (
            <>
              <div className="tier-row">
                <div className="tier-badge loyalty" style={{ borderColor: LOYALTY_COLORS[buyerStats.loyalty], color: LOYALTY_COLORS[buyerStats.loyalty] }}>
                  👑 {LOYALTY_TIERS[buyerStats.loyalty]}
                </div>
                <div className="tier-badge whale" style={{ borderColor: WHALE_COLORS[buyerStats.whale], color: WHALE_COLORS[buyerStats.whale] }}>
                  💎 {WHALE_TIERS[buyerStats.whale]}
                </div>
              </div>
              <div className="progress-section">
                <div className="prog-item">
                  <div className="prog-labels"><span>Loyalty Progress</span> <span>{loyaltyProg.text}</span></div>
                  <div className="prog-bar">
                    <div className="prog-fill" style={{ width: `${Math.min(100, loyaltyProg.pct)}%`, background: LOYALTY_COLORS[buyerStats.loyalty] }} />
                  </div>
                </div>
                <div className="prog-item">
                  <div className="prog-labels"><span>Whale Progress</span> <span>{whaleProg.text}</span></div>
                  <div className="prog-bar">
                    <div className="prog-fill" style={{ width: `${Math.min(100, whaleProg.pct)}%`, background: WHALE_COLORS[buyerStats.whale] }} />
                  </div>
                </div>
              </div>
            </>
          )}
          <a href={`${ARC_EXPLORER}/tx/${lastTx.hash}`} target="_blank" rel="noreferrer" className="tx-link">
            View Transaction on ArcScan ↗
          </a>
        </div>
      )}

      {account && history.length > 0 && (
        <div className="card history-card" style={{ marginTop: '20px' }}>
          <h3>Recent Payments</h3>
          <div className="history-list">
            {history.slice(0, 5).map((h, i) => (
              <div key={i} className="hist-item">
                <div className="hist-main">
                  <div className="hist-name">{h.mName} <span className="hist-amt">{h.amount} USDC</span></div>
                  <div className="hist-time">{timeAgo(h.ts)}</div>
                </div>
                <div className="hist-tiers">
                  <span className="h-tier" style={{ color: LOYALTY_COLORS[h.loyalty], border: `1px solid ${LOYALTY_COLORS[h.loyalty]}`, padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>
                    {LOYALTY_TIERS[h.loyalty]}
                  </span>
                  <span className="h-tier" style={{ color: WHALE_COLORS[h.whale], border: `1px solid ${WHALE_COLORS[h.whale]}`, padding: '2px 6px', borderRadius: '10px', fontSize: '10px', marginLeft: '5px' }}>
                    {WHALE_TIERS[h.whale]}
                  </span>
                </div>
                <a href={`${ARC_EXPLORER}/tx/${h.hash}`} target="_blank" rel="noreferrer" className="h-link" style={{ marginLeft: '10px' }}>↗</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Merchant Profile ──────────────────────────────────────────────────
function MerchantProfile({ account, preload, setTab, setBuyerPreload }) {
  const [addr, setAddr] = useState(preload || '')
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  const lookup = useCallback(async (a) => {
    if (!ethers.isAddress(a)) return
    setLoading(true)
    try {
      const provider = new ethers.JsonRpcProvider(RPC)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider)
      const data = await contract.merchants(a)
      if (data.registered) {
        setInfo({
          addr: a,
          name: data.name,
          category: data.category,
          desc: data.description,
          website: data.websiteUrl,
          logo: data.logoUrl,
          collection: Number(data.collectionId),
          payments: Number(data.totalPaymentsReceived),
          usdc: data.totalUsdcReceived
        })
      } else {
        setInfo(null)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { 
    if (preload) {
      lookup(preload) 
    } else if (account && !info) {
      // Auto-load if connected wallet is a registered merchant
      const provider = new ethers.JsonRpcProvider(RPC)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider)
      contract.merchants(account).then(data => {
        if (data.registered) {
          lookup(account)
          setAddr(account)
        }
      }).catch(console.error)
    }
  }, [preload, lookup, account, info])

  return (
    <div className="merchant-profile-view">
      <div className="card lookup-card">
        <h3>Lookup Merchant</h3>
        <div className="lookup-row">
          <input type="text" value={addr} onChange={e => setAddr(e.target.value.trim())} placeholder="0x..." />
          <button className="btn btn-secondary" onClick={() => lookup(addr)}>Search</button>
        </div>
      </div>

      {loading && <div className="loading-spinner">Searching...</div>}

      {info && (
        <div className="profile-details animate-fade-in" style={{ marginTop: '20px' }}>
          <div className="profile-main-card card">
            <div className="large-logo">
              <img src={info.logo || 'https://via.placeholder.com/200?text=No+Logo'} alt={info.name} onError={(e) => { e.target.src = 'https://via.placeholder.com/200?text=No+Logo' }} />
            </div>
            <div className="large-info">
              <h1>{info.name} <span className="cat-badge">{info.category}</span></h1>
              <p className="full-desc">{info.desc}</p>
              {info.website && <a href={info.website} target="_blank" rel="noreferrer" className="web-link">{info.website}</a>}
              
              <div className="profile-stats">
                <div className="p-stat"><strong>{info.payments}</strong> Payments</div>
                <div className="p-stat"><strong>{formatUSDC(info.usdc)}</strong> USDC</div>
                <div className="p-stat coll-badge" style={{ background: COLLECTIONS[info.collection].bg, color: COLLECTIONS[info.collection].accent, border: `1px solid ${COLLECTIONS[info.collection].accent}` }}>
                  Collection: {COLLECTIONS[info.collection].name}
                </div>
              </div>

              <div className="profile-footer">
                <a href={`${ARC_EXPLORER}/address/${info.addr}`} target="_blank" rel="noreferrer" className="explorer-link">
                  View Address on ArcScan ↗
                </a>
                <button className="btn btn-primary btn-pay-now" onClick={() => {
                  setBuyerPreload(info.addr)
                  setTab('buyer')
                }}>
                  Pay This Merchant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 4: My Stats ──────────────────────────────────────────────────────────
function MyStats({ account, connect }) {
  const [stats, setStats] = useState({ spent: 0n, merchants: 0, bestLoyalty: 0, bestWhale: 0 })
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!account) return setLoading(false)
    const stored = localStorage.getItem(`pnft_v2_history_${account.toLowerCase()}`)
    const hist = stored ? JSON.parse(stored) : []
    setHistory(hist)

    const fetchGlobal = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(RPC)
        const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider)
        const [spent, mCount] = await contract.getBuyerStats(account)
        
        let bestL = 0, bestW = 0
        hist.forEach(h => {
          if (h.loyalty > bestL) bestL = h.loyalty
          if (h.whale > bestW) bestW = h.whale
        })

        setStats({ spent, merchants: Number(mCount), bestLoyalty: bestL, bestWhale: bestW })
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    fetchGlobal()
  }, [account])

  if (!account) return <div className="empty-state"><h3>Connect your wallet to see your stats</h3><button className="btn btn-primary" onClick={connect}>Connect Wallet</button></div>
  if (loading) return <div className="loading-spinner">Loading stats...</div>

  return (
    <div className="my-stats-view">
      <div className="stats-grid">
        <div className="stat-card card">
          <label>Total USDC Spent</label>
          <div className="stat-val">{formatUSDC(stats.spent)}</div>
        </div>
        <div className="stat-card card">
          <label>Unique Merchants</label>
          <div className="stat-val">{stats.merchants}</div>
        </div>
        <div className="stat-card card">
          <label>Best Loyalty Tier</label>
          <div className="stat-val" style={{ color: LOYALTY_COLORS[stats.bestLoyalty] }}>
            👑 {LOYALTY_TIERS[stats.bestLoyalty]}
          </div>
        </div>
        <div className="stat-card card">
          <label>Best Whale Tier</label>
          <div className="stat-val" style={{ color: WHALE_COLORS[stats.bestWhale] }}>
            💎 {WHALE_TIERS[stats.bestWhale]}
          </div>
        </div>
      </div>

      <h2 className="section-title">My NFT Collection</h2>
      <div className="nft-grid">
        {history.map((h, i) => (
          <div key={i} className="nft-card card">
            <div className="nft-card-art">
              {h.svg ? <img src={h.svg} alt="NFT Art" /> : <div className="nft-art-placeholder">No SVG Art</div>}
            </div>
            <div className="nft-card-info">
              <div className="nft-merchant-label">{h.mName}</div>
              <div className="nft-tiers-badges">
                <span className="badge badge-loyalty" style={{ borderColor: LOYALTY_COLORS[h.loyalty], color: LOYALTY_COLORS[h.loyalty], border: '1px solid' }}>
                  👑 {LOYALTY_TIERS[h.loyalty]}
                </span>
                <span className="badge badge-whale" style={{ borderColor: WHALE_COLORS[h.whale], color: WHALE_COLORS[h.whale], border: '1px solid', marginLeft: '5px' }}>
                  💎 {WHALE_TIERS[h.whale]}
                </span>
              </div>
              <div className="nft-footer-stats">
                <a href={`${ARC_EXPLORER}/tx/${h.hash}`} target="_blank" rel="noreferrer" className="tx-link">
                  View Tx ↗
                </a>
              </div>
            </div>
          </div>
        ))}
        {history.length === 0 && <div className="card empty-grid" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>No NFTs collected yet.</div>}
      </div>

      <h2 className="section-title">Payment History</h2>
      <div className="card table-card">
        <div className="table-responsive">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Tiers</th>
                <th>Date</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td>
                    <div className="td-name">{h.mName}</div>
                    <div className="td-addr">{short(h.mAddr)}</div>
                  </td>
                  <td className="td-amt">{h.amount} USDC</td>
                  <td>
                    <span className="t-badge" style={{ color: LOYALTY_COLORS[h.loyalty], border: `1px solid ${LOYALTY_COLORS[h.loyalty]}`, padding: '2px 6px', borderRadius: '10px', fontSize: '11px' }}>
                      {LOYALTY_TIERS[h.loyalty]}
                    </span>
                    <span className="t-badge" style={{ color: WHALE_COLORS[h.whale], border: `1px solid ${WHALE_COLORS[h.whale]}`, padding: '2px 6px', borderRadius: '10px', fontSize: '11px', marginLeft: '5px' }}>
                      {WHALE_TIERS[h.whale]}
                    </span>
                  </td>
                  <td className="td-time">{timeAgo(h.ts)}</td>
                  <td><a href={`${ARC_EXPLORER}/tx/${h.hash}`} target="_blank" rel="noreferrer" className="tx-icon">↗</a></td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: '#7c8bad' }}>No payments found in history.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
