import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'

// ── Contract config ───────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = '0x773f4cE08bF7efEa3a73B0A893F40c547a448F33'
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const PAYMENT_AMOUNT = 1_000_000n
const ARC_CHAIN_ID = '0x4CEF52'
const ARC_EXPLORER = 'https://explorer.arc.testnet.circle.com'

const NFT_ABI = [
  'function registerMerchant(string name) external',
  'function payMerchant(address merchant) external',
  'function getTier(address buyer, address merchant) external view returns (uint8)',
  'function getPaymentCount(address buyer, address merchant) external view returns (uint256)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function merchants(address) external view returns (bool registered, string name)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]

const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]

const short = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''
const TIERS = ['Bronze', 'Silver', 'Gold']
const TCOLORS = ['#CD7F32', '#C0C0C0', '#FFD700']
const TCLS = ['bronze', 'silver', 'gold']

function decodeTokenURI(uri) {
  try { return JSON.parse(atob(uri.split(',')[1])) } catch { return null }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ── switchToArc ───────────────────────────────────────────────────────────────
async function switchToArc() {
  const arcParams = {
    chainId: '0x4CEF52',
    chainName: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
    rpcUrls: ['https://5042002.rpc.thirdweb.com'],
    blockExplorerUrls: [ARC_EXPLORER],
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_ID }],
    })
  } catch (e) {
    // 4902 = chain not added, -32603 = unrecognized chain — both mean add it
    if (e.code === 4902 || e.code === -32603) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [arcParams],
      })
    } else {
      throw e
    }
  }
}

// ── getFreshSigner — always call AFTER switchToArc ────────────────────────────
async function getFreshSigner() {
  const provider = new ethers.BrowserProvider(window.ethereum)
  return provider.getSigner()
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('buyer')
  const [account, setAccount] = useState(null)
  const [signer, setSigner] = useState(null)
  const [connecting, setConnecting] = useState(false)

  const connectWallet = async () => {
    if (!window.ethereum) return alert('MetaMask not found. Please install it.')
    setConnecting(true)
    try {
      await switchToArc()                                                          // 1. switch first
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) // 2. then accounts
      const freshSigner = await getFreshSigner()                                  // 3. then signer (now on Arc)
      setSigner(freshSigner)
      setAccount(accounts[0])
    } catch (e) { console.error(e) }
    finally { setConnecting(false) }
  }

  useEffect(() => {
    if (!window.ethereum) return
    const onAccounts = accs => {
      if (!accs.length) { setAccount(null); setSigner(null) }
      else setAccount(accs[0])
    }
    const onChainChanged = async () => {
      // Recreate signer when chain changes — don't reload page
      try {
        const freshSigner = await getFreshSigner()
        setSigner(freshSigner)
      } catch {
        setSigner(null)
        setAccount(null)
      }
    }
    window.ethereum.on('accountsChanged', onAccounts)
    window.ethereum.on('chainChanged', onChainChanged)
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccounts)
      window.ethereum.removeListener('chainChanged', onChainChanged)
    }
  }, [])

  const nftContract = signer ? new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer) : null
  const usdcContract = signer ? new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer) : null
  const isPlaceholder = CONTRACT_ADDRESS === 'YOUR_CONTRACT_ADDRESS_HERE'

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">P</div>
            <span className="logo-text">PaymentNFT</span>
          </div>
          <span className="network-badge">Arc Testnet</span>
        </div>
        <div className="header-right">
          {account
            ? <div className="wallet-chip connected"><span className="wallet-dot" />{short(account)}</div>
            : <button className="btn btn-connect" onClick={connectWallet} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          }
        </div>
      </header>

      <div className="tab-bar">
        {[['merchant', '🏪 Merchant Dashboard'], ['buyer', '🛒 Buyer Dashboard']].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <main className="main">
        {isPlaceholder && (
          <div className="warning-banner">
            ⚠️ <strong>CONTRACT_ADDRESS</strong> is not set. Replace <code>YOUR_CONTRACT_ADDRESS_HERE</code> in App.jsx.
          </div>
        )}
        {tab === 'merchant'
          ? <MerchantDashboard account={account} contract={nftContract} connect={connectWallet} connecting={connecting} />
          : <BuyerDashboard account={account} contract={nftContract} usdc={usdcContract} connect={connectWallet} connecting={connecting} />
        }
      </main>
    </div>
  )
}

// ── Merchant Dashboard ────────────────────────────────────────────────────────
function MerchantDashboard({ account, contract, connect, connecting }) {
  const [name, setName] = useState('')
  const [registered, setReg] = useState(false)
  const [regName, setRegName] = useState('')
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!contract || !account) { setReg(false); return }
    setChecking(true)
    contract.merchants(account)
      .then(({ registered: r, name: n }) => { setReg(r); if (r) setRegName(n) })
      .catch(console.error)
      .finally(() => setChecking(false))
  }, [contract, account])

  const register = async () => {
    if (!name.trim()) return setError('Please enter a merchant name.')
    setError(''); setLoading(true)
    try {
      await switchToArc()                                          // 1. switch
      const freshSigner = await getFreshSigner()                   // 2. fresh signer on Arc
      const freshContract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, freshSigner) // 3. fresh contract
      const tx = await freshContract.registerMerchant(name.trim()) // 4. send tx
      await tx.wait()
      setReg(true); setRegName(name.trim())
    } catch (e) {
      setError(e.reason || e.message || 'Transaction failed.')
    } finally { setLoading(false) }
  }

  return (
    <div className="dashboard">
      <div className="card">
        <div className="card-header">
          <h2>Merchant Registration</h2>
          <p className="card-sub">Register your wallet to receive 1 USDC payments and issue loyalty NFTs to buyers.</p>
        </div>

        {!account ? (
          <div className="connect-prompt">
            <div className="connect-icon">🔗</div>
            <p>Connect your wallet to register as a merchant</p>
            <button className="btn btn-primary" onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          </div>
        ) : checking ? (
          <div className="loading-state"><div className="spinner" />Checking registration…</div>
        ) : registered ? (
          <div className="registered-state">
            <div className="registered-badge"><span className="check-icon">✓</span>Registered</div>
            <div className="merchant-info">
              <div className="info-row">
                <span className="info-label">Name</span>
                <span className="info-value">{regName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Address</span>
                <span className="info-value mono">{account}</span>
              </div>
            </div>
            <p className="info-hint">Share your wallet address with buyers so they can pay you.</p>
          </div>
        ) : (
          <>
            <div className="field">
              <label className="field-label">Merchant Name</label>
              <input className="input" type="text" placeholder="e.g. Coffee Corner, TechShop…"
                value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && register()} disabled={loading} />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button className="btn btn-primary btn-full" onClick={register} disabled={loading || !name.trim()}>
              {loading ? <><span className="spinner-sm" />Registering…</> : 'Register as Merchant'}
            </button>
          </>
        )}
      </div>

      <div className="card card-info">
        <h3>How it works</h3>
        <ol className="steps">
          <li>Register your wallet as a merchant with a display name.</li>
          <li>Share your wallet address with buyers.</li>
          <li>Buyers approve 1 USDC, then call payMerchant — you receive it directly.</li>
          <li>Each payment mints a loyalty NFT: Bronze (1–9) → Silver (10–49) → Gold (50+).</li>
        </ol>
      </div>
    </div>
  )
}

// ── Buyer Dashboard ───────────────────────────────────────────────────────────
function BuyerDashboard({ account, contract, usdc, connect, connecting }) {
  const [merchant, setMerchant] = useState('')
  const [mName, setMName] = useState('')
  const [mValid, setMValid] = useState(false)
  const [mChecking, setMChecking] = useState(false)
  const [approved, setApproved] = useState(false)
  const [appLoading, setAppLoading] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [payCount, setPayCount] = useState(null)
  const [tier, setTier] = useState(null)
  const [nftImg, setNftImg] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    if (!account) return
    const raw = localStorage.getItem(`pnft_history_${account.toLowerCase()}`)
    setHistory(raw ? JSON.parse(raw) : [])
  }, [account])

  useEffect(() => {
    setMValid(false); setMName(''); setError('')
    if (!ethers.isAddress(merchant) || !contract) return
    setMChecking(true)
    contract.merchants(merchant)
      .then(({ registered: r, name: n }) => { setMValid(r); setMName(r ? n : '') })
      .catch(() => { })
      .finally(() => setMChecking(false))
  }, [merchant, contract])

  const refreshStats = useCallback(async () => {
    if (!contract || !account || !mValid) return
    try {
      const [cnt, t] = await Promise.all([
        contract.getPaymentCount(account, merchant),
        contract.getTier(account, merchant),
      ])
      setPayCount(Number(cnt))
      setTier(Number(t))
    } catch (e) { console.error(e) }
  }, [contract, account, merchant, mValid])

  useEffect(() => { refreshStats() }, [refreshStats])
  useEffect(() => { setApproved(false) }, [merchant])

  const handleApprove = async () => {
    setError(''); setAppLoading(true)
    try {
      await switchToArc()                                           // 1. switch
      const freshSigner = await getFreshSigner()                    // 2. fresh signer
      const freshUsdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, freshSigner) // 3. fresh contract
      const tx = await freshUsdc.approve(CONTRACT_ADDRESS, PAYMENT_AMOUNT)       // 4. send tx
      await tx.wait()
      setApproved(true)
    } catch (e) {
      setError(e.reason || e.message || 'Approval failed.')
    } finally { setAppLoading(false) }
  }

  const handlePay = async () => {
    setError(''); setSuccessMsg(''); setPayLoading(true)
    try {
      await switchToArc()                                           // 1. switch
      const freshSigner = await getFreshSigner()                    // 2. fresh signer
      const freshContract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, freshSigner) // 3. fresh contract
      const tx = await freshContract.payMerchant(merchant)          // 4. send tx
      const receipt = await tx.wait()

      const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)')
      const mintLog = receipt.logs.find(l =>
        l.topics[0] === TRANSFER_TOPIC &&
        l.topics[1] === ethers.zeroPadValue('0x00', 32)
      )

      if (mintLog) {
        const tokenId = BigInt(mintLog.topics[3])
        const uri = await freshContract.tokenURI(tokenId)
        const meta = decodeTokenURI(uri)
        if (meta?.image) setNftImg(meta.image)
      }

      await refreshStats()

      const newCount = (payCount ?? 0) + 1
      const newTier = newCount >= 50 ? 2 : newCount >= 10 ? 1 : 0
      const entry = { merchant, mName, tier: newTier, count: newCount, ts: Date.now() }
      const key = `pnft_history_${account.toLowerCase()}`
      const prev = JSON.parse(localStorage.getItem(key) || '[]')
      const next = [entry, ...prev]
      localStorage.setItem(key, JSON.stringify(next))
      setHistory(next)

      setSuccessMsg('Payment successful! NFT minted to your wallet.')
      setApproved(false)
    } catch (e) {
      setError(e.reason || e.message || 'Payment failed.')
    } finally { setPayLoading(false) }
  }

  return (
    <div className="dashboard">
      <div className="card">
        <div className="card-header">
          <h2>Pay a Merchant</h2>
          <p className="card-sub">Enter a merchant's wallet address, approve 1 USDC, then complete the payment to earn a loyalty NFT.</p>
        </div>

        {!account ? (
          <div className="connect-prompt">
            <div className="connect-icon">🛒</div>
            <p>Connect your wallet to make payments</p>
            <button className="btn btn-primary" onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          </div>
        ) : (
          <>
            <div className="field">
              <label className="field-label">
                Merchant Address
                {mChecking && <span className="merchant-status checking">Checking…</span>}
                {!mChecking && ethers.isAddress(merchant) && (
                  <span className={`merchant-status ${mValid ? 'valid' : 'invalid'}`}>
                    {mValid ? `✓ ${mName}` : '✗ Not registered'}
                  </span>
                )}
              </label>
              <input className="input mono" type="text" placeholder="0x…"
                value={merchant} onChange={e => setMerchant(e.target.value.trim())} />
            </div>

            <div className="action-steps">
              <div className="action-step">
                <div className={`step-num ${approved ? 'done' : ''}`}>{approved ? '✓' : '1'}</div>
                <div className="step-info">
                  <div className="step-title">Approve 1 USDC</div>
                  <div className="step-desc">Allow the contract to transfer 1 USDC from your wallet</div>
                </div>
                <button className="btn btn-secondary" onClick={handleApprove}
                  disabled={!mValid || appLoading || approved}>
                  {appLoading ? <><span className="spinner-sm" />Approving…</> : approved ? 'Approved ✓' : 'Approve USDC'}
                </button>
              </div>

              <div className="action-step">
                <div className="step-num">2</div>
                <div className="step-info">
                  <div className="step-title">Pay Merchant (1 USDC)</div>
                  <div className="step-desc">Transfer 1 USDC and mint your loyalty NFT</div>
                </div>
                <button className="btn btn-primary" onClick={handlePay}
                  disabled={!approved || payLoading}>
                  {payLoading ? <><span className="spinner-sm" />Paying…</> : 'Pay & Mint NFT'}
                </button>
              </div>
            </div>

            {error && <div className="error-msg">{error}</div>}
            {successMsg && <div className="success-msg">🎉 {successMsg}</div>}
          </>
        )}
      </div>

      {account && mValid && payCount !== null && (
        <div className="nft-display">
          {nftImg && <img src={nftImg} alt={`${TIERS[tier]} loyalty NFT`} />}
          {!nftImg && tier !== null && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div className="connect-icon" style={{ fontSize: 60 }}>
                {tier === 2 ? '🥇' : tier === 1 ? '🥈' : '🥉'}
              </div>
            </div>
          )}
          {tier !== null && (
            <div className={`tier-badge ${TCLS[tier]}`}>
              <span>⬤</span> {TIERS[tier]} Member
            </div>
          )}
          <div className="nft-stats">
            <div>
              <div className="stat-val">{payCount}</div>
              <div className="stat-label">Payments</div>
            </div>
            <div>
              <div className="stat-val" style={{ color: tier !== null ? TCOLORS[tier] : 'inherit' }}>
                {tier !== null ? TIERS[tier] : '—'}
              </div>
              <div className="stat-label">Current Tier</div>
            </div>
            <div>
              <div className="stat-val">{tier === 2 ? '∞' : tier === 1 ? 50 - payCount : 10 - payCount}</div>
              <div className="stat-label">{tier === 2 ? 'Max Tier' : 'Until Next'}</div>
            </div>
          </div>
        </div>
      )}

      {account && (
        <div className="card">
          <div className="history-section">
            <div className="history-title">Payment History</div>
            {history.length === 0 ? (
              <div className="empty-history">No payments yet. Make your first payment above!</div>
            ) : (
              <div className="history-list">
                {history.slice(0, 20).map((h, i) => (
                  <div className="history-item" key={i}>
                    <div className="history-tier-dot" style={{ background: TCOLORS[h.tier] }} />
                    <div className="history-meta">
                      <div className="history-addr">{h.mName || h.merchant}</div>
                      <div className="history-addr" style={{ fontSize: 11 }}>{h.merchant}</div>
                      <div className="history-time">{timeAgo(h.ts)}</div>
                    </div>
                    <div>
                      <div className={`history-badge ${TCLS[h.tier]}`}>{TIERS[h.tier]}</div>
                      <div className="history-time" style={{ textAlign: 'right' }}>#{h.count}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
