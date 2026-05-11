/* ============================================================
   CLICK SMP LEADERBOARD — app.js
   ============================================================

   SETUP:
   1. https://console.cloud.google.com → Enable YouTube Data API v3
   2. Credentials → Create API Key → paste below
   3. Add channel IDs below (UCxxx... format is fastest)

   ============================================================ */

/* ── ✏️  YOUR API KEY ─────────────────────────────────────── */
/* ── ✏️  YOUR API KEY ─────────────────────────────────────── */
const YOUTUBE_API_KEY = 'AIzaSyB7RZoZXyPlUuGIS5i3k3344nINEPxLklk';

/* ── ✏️  YOUR SMP MEMBERS ────────────────────────────────── */
/* Add/remove channel entries. Use channel IDs (UCxxx...) for
   fastest loading. Custom handles (@Name) also work.          */
const CHANNELS = [
  { id: 'UC22sjwkxLxgecj1JytqVmIw' },  // MrBeast (example)
  { id: 'UC-yMNwCYHhDxbCyJTvxKAkQ' },  // example
  { id: 'UC9PA3keDvE6BansQGzJYpnQ' },
  { id: 'UCY5bByqvhzZm_423ktlaCWQ' },
  { id: 'UCBGp0LtQR__FMn78G0G8W7A' },
  { id: 'UC-v7iAWeGUCSRAx4BwXZG4Q' },
  { id: 'UCrZaDSUdOGakfHzmcEEaKPg' },  // MrBeast (example)
  { id: 'UCh8tisWbz2u9oKmIFqY5lew' },  // example
  { id: 'UCTWfPVRZ-r8CLKSVbHZvbrA' },
  { id: 'UCCrt8hj2s0cpJuQkDCz7e5Q' },
  { id: 'UCclL0KruCx4_TDvkTF_5Kvw' },
  { id: 'UCRVtuFiUTfTsHhUKUFERp4A' },
     { id: 'UCoBVWPVkeg3D6u26AgxhB0w' },
  { id: 'UC2uPNlirX7bJXZQqkKYjPuw' },
  { id: 'UCluciE6JD-z-VWGD-52YuZQ' },  // MrBeast (example)
  { id: 'UC8zY4QXo_5VcL9Fb9T6qwmg' },  // example
  { id: 'UC-dJHMczPppOUPs-Zu7fWRA' },
  { id: 'UCWPLaAeDKxkfnEwZZHMcWCQ' },
  { id: 'UCt3SETIQ7I5fncdGiUbByGg' },
  { id: 'UCZUa8UHlqByXminjKixsH9w' },
   { id: 'UCMX81wOt7zI7ycBqBfTpLVw' },

   // example
];

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'clicksmp_snapshots';

/* ============================================================
   STATE
   ============================================================ */
let channelData  = [];
let snapshots    = loadSnapshots();
let currentTab   = 'overall';
let refreshTimer = null;
let compareA     = null;
let compareB     = null;

/* ============================================================
   SNAPSHOT / GROWTH TRACKING
   Uses localStorage to remember last seen stats
   ============================================================ */
function loadSnapshots() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveSnapshots() {
  const now = Date.now();
  channelData.forEach(ch => {
    snapshots[ch.id] = {
      subscribers: ch.subscribers,
      views:       ch.views,
      videos:      ch.videos,
      ts:          now,
    };
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots)); }
  catch {}
}

function getGrowth(ch) {
  const snap = snapshots[ch.id];
  if (!snap) return null;
  return {
    subscribers: ch.subscribers - snap.subscribers,
    views:       ch.views       - snap.views,
    videos:      ch.videos      - snap.videos,
    since:       snap.ts,
  };
}

/* ============================================================
   YOUTUBE API
   ============================================================ */
async function fetchChannelStats(channelId) {
  const cleanId = channelId.trim();
  let resolvedId = cleanId;

  if (cleanId.startsWith('@') || cleanId.startsWith('https://')) {
    const handle = cleanId.replace('https://www.youtube.com/', '').replace('https://youtube.com/', '');
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&key=${YOUTUBE_API_KEY}&maxResults=1`);
    const d = await r.json();
    if (!d.items?.length) throw new Error(`Cannot find: ${cleanId}`);
    resolvedId = d.items[0].snippet.channelId;
  }

  const res  = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${resolvedId}&key=${YOUTUBE_API_KEY}`);
  const data = await res.json();
  if (!data.items?.length) throw new Error(`No data: ${resolvedId}`);

  const ch    = data.items[0];
  const stats = ch.statistics;

  return {
    id:          resolvedId,
    name:        ch.snippet.title,
    avatar:      ch.snippet.thumbnails?.default?.url || null,
    url:         `https://www.youtube.com/channel/${resolvedId}`,
    subscribers: parseInt(stats.subscriberCount || 0),
    views:       parseInt(stats.viewCount       || 0),
    videos:      parseInt(stats.videoCount      || 0),
    joinedAt:    new Date(ch.snippet.publishedAt),
  };
}

async function loadAllChannels() {
  setStatus('Fetching...', '');

  if (YOUTUBE_API_KEY === 'YOUR_API_KEY_HERE') { showDemoData(); return; }

  try {
    const results = await Promise.allSettled(CHANNELS.map(ch => fetchChannelStats(ch.id)));
    channelData   = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed  = results.filter(r => r.status === 'rejected').length;

    if (!channelData.length) { showError('No channel data loaded. Check API key and channel IDs.'); return; }

    saveSnapshots();

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setStatus(`Updated ${timeStr}${failed ? ` (${failed} failed)` : ''}`, 'live');

    populateCompareSelects();
    renderMvpCard();
    render();
  } catch (err) {
    showError('API error: ' + err.message);
  }
}

/* ============================================================
   SCORING
   Subs 50% | Avg views/video 35% | Total videos 15%
   High video count with low avg views is naturally penalised
   ============================================================ */
function computeOverallScore(ch, allChannels) {
  const vpv = c => c.videos > 0 ? c.views / c.videos : 0;

  const maxSubs   = Math.max(...allChannels.map(c => c.subscribers), 1);
  const maxVpv    = Math.max(...allChannels.map(c => vpv(c)), 1);
  const maxVideos = Math.max(...allChannels.map(c => c.videos), 1);

  const subScore   = (ch.subscribers / maxSubs)   * 1000;
  const vpvScore   = (vpv(ch)        / maxVpv)    * 1000;
  const videoScore = (ch.videos      / maxVideos) * 1000;

  return Math.round(subScore * 0.35 + vpvScore * 0.5 + videoScore * 0.15);
}

/* ============================================================
   MVP CARD — crowns whoever leads the most categories
   ============================================================ */
function renderMvpCard() {
  const card = document.getElementById('mvp-card');
  if (!channelData.length) { card.style.display = 'none'; return; }

  const wins = {};
  channelData.forEach(ch => wins[ch.id] = 0);

  const categories = [
    { key: 'overall',     fn: ch => computeOverallScore(ch, channelData) },
    { key: 'subscribers', fn: ch => ch.subscribers },
    { key: 'views',       fn: ch => ch.views },
    { key: 'vpv',         fn: ch => ch.videos > 0 ? ch.views / ch.videos : 0 },
    { key: 'videos',      fn: ch => ch.videos },
    { key: 'age',         fn: ch => -(Date.now() - ch.joinedAt.getTime()) },
  ];

  categories.forEach(cat => {
    const best = channelData.reduce((a, b) => cat.fn(a) >= cat.fn(b) ? a : b);
    wins[best.id] = (wins[best.id] || 0) + 1;
  });

  const mvpId  = Object.entries(wins).sort((a, b) => b[1] - a[1])[0][0];
  const mvp    = channelData.find(c => c.id === mvpId);
  const mvpWin = wins[mvpId];

  card.style.display = '';
  card.innerHTML = `
    <div class="mvp-inner">
      <div class="mvp-badge">MVP</div>
      ${mvp.avatar ? `<img class="mvp-avatar" src="${mvp.avatar}" alt="${mvp.name}" />` : `<div class="mvp-avatar-placeholder">${mvp.name[0]}</div>`}
      <div class="mvp-info">
        <div class="mvp-label">Currently Dominating</div>
        <div class="mvp-name"><a href="${mvp.url}" target="_blank" rel="noopener">${mvp.name}</a></div>
        <div class="mvp-stat">Leading ${mvpWin} of ${categories.length} categories</div>
      </div>
      <div class="mvp-cats">
        ${categories.map(cat => {
          const best = channelData.reduce((a, b) => cat.fn(a) >= cat.fn(b) ? a : b);
          const won  = best.id === mvpId;
          const labels = { overall:'Overall', subscribers:'Subs', views:'Views', vpv:'Avg Views', videos:'Videos', age:'Veteran' };
          return `<span class="mvp-cat ${won ? 'mvp-cat-win' : ''}">${labels[cat.key]}</span>`;
        }).join('')}
      </div>
    </div>
  `;
}

/* ============================================================
   SORTING
   ============================================================ */
function getSortedChannels(tab) {
  const clone = [...channelData];
  switch (tab) {
    case 'overall':     return clone.sort((a, b) => computeOverallScore(b, clone) - computeOverallScore(a, clone));
    case 'subscribers': return clone.sort((a, b) => b.subscribers - a.subscribers);
    case 'views':       return clone.sort((a, b) => b.views - a.views);
    case 'videos':      return clone.sort((a, b) => b.videos - a.videos);
    case 'age':         return clone.sort((a, b) => a.joinedAt - b.joinedAt);
    case 'frequency':   return clone.sort((a, b) => uploadFreq(b) - uploadFreq(a));
    default:            return clone;
  }
}

/* ============================================================
   FORMAT HELPERS
   ============================================================ */
function fmt(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function fmtDelta(n) {
  if (!n || n === 0) return null;
  const sign = n > 0 ? '+' : '';
  return sign + fmt(Math.abs(n));
}

function fmtDate(d)    { return d.toLocaleDateString([], { year: 'numeric', month: 'short' }); }
function fmtDateFull(d){ return d.toLocaleDateString([], { year: 'numeric', month: 'long',  day: 'numeric' }); }

function channelAge(d) {
  const ms    = Date.now() - d.getTime();
  const years = ms / (1000 * 60 * 60 * 24 * 365.25);
  if (years >= 1) return years.toFixed(1) + 'y';
  return Math.round(years * 12) + 'mo';
}

function uploadFreq(ch) {
  const months = (Date.now() - ch.joinedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  return months > 0 ? ch.videos / months : 0;
}

function avatarEl(ch, size = 32) {
  if (ch.avatar)
    return `<img src="${ch.avatar}" alt="${ch.name}" width="${size}" height="${size}" style="border-radius:50%;border:1px solid var(--border);object-fit:cover;" onerror="this.style.display='none'" />`;
  return `<div class="channel-cell-placeholder" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.38)}px">${ch.name[0]}</div>`;
}

function nextMilestone(n) {
  const milestones = [1e3,5e3,1e4,5e4,1e5,5e5,1e6,2e6,5e6,1e7,2e7,5e7,1e8,2e8,5e8,1e9];
  return milestones.find(m => m > n) || null;
}

/* ============================================================
   RENDER — ROUTER
   ============================================================ */
function render() {
  const sections = ['leaderboard-section','milestones-section','timeline-section','frequency-section','compare-section'];
  sections.forEach(id => document.getElementById(id).style.display = 'none');

  switch (currentTab) {
    case 'milestones': renderMilestones(); break;
    case 'timeline':   renderTimeline();   break;
    case 'frequency':  renderFrequency();  break;
    case 'compare':    renderCompare();    break;
    default:           renderLeaderboard(); break;
  }
}

/* ============================================================
   RENDER — LEADERBOARD
   ============================================================ */
function renderLeaderboard() {
  document.getElementById('leaderboard-section').style.display = '';
  renderPodium();
  renderTable();
}

function renderPodium() {
  const sorted = getSortedChannels(currentTab);
  const top3   = sorted.slice(0, 3);
  const labels = ['1ST', '2ND', '3RD'];

  document.getElementById('podium-row').innerHTML = top3.map((ch, i) => `
    <div class="podium-card rank-${i+1}">
      <div class="podium-rank">${labels[i]}</div>
      ${ch.avatar
        ? `<img class="podium-avatar" src="${ch.avatar}" alt="${ch.name}" onerror="this.outerHTML='<div class=\'podium-avatar-placeholder\'>${ch.name[0]}</div>'" />`
        : `<div class="podium-avatar-placeholder">${ch.name[0]}</div>`}
      <div class="podium-name">${ch.name}</div>
      <div class="podium-score">${getPrimaryScore(ch, currentTab)}</div>
      <div class="podium-label">${getPrimaryLabel(currentTab)}</div>
    </div>
  `).join('');
}

function getPrimaryScore(ch, tab) {
  switch (tab) {
    case 'overall':     return computeOverallScore(ch, channelData) + ' pts';
    case 'subscribers': return fmt(ch.subscribers);
    case 'views':       return fmt(ch.views);
    case 'videos':      return fmt(ch.videos) + ' vids';
    case 'age':         return channelAge(ch.joinedAt);
    case 'frequency':   return uploadFreq(ch).toFixed(1) + '/mo';
    default:            return '';
  }
}

function getPrimaryLabel(tab) {
  switch (tab) {
    case 'overall':     return 'Overall Score';
    case 'subscribers': return 'Subscribers';
    case 'views':       return 'Total Views';
    case 'videos':      return 'Videos Posted';
    case 'age':         return 'Channel Age';
    case 'frequency':   return 'Videos / Month';
    default:            return '';
  }
}

function renderTable() {
  const sorted     = getSortedChannels(currentTab);
  const maxPrimary = Math.max(...sorted.map(ch => getPrimaryValue(ch, currentTab)), 1);
  const isOverall  = currentTab === 'overall';

  document.getElementById('table-head').innerHTML = ['#', 'Channel', 'Subscribers', 'Views', 'Videos', 'Since', ...(isOverall ? ['Score'] : [])].map((h, i) => `<th class="${i > 1 ? 'num' : ''}">${h}</th>`).join('');

  document.getElementById('leaderboard-body').innerHTML = sorted.map((ch, i) => {
    const rank     = i + 1;
    const rankCls  = rank <= 3 ? `rank-${rank}` : '';
    const primary  = getPrimaryValue(ch, currentTab);
    const barWidth = Math.round((primary / maxPrimary) * 80);
    const growth   = getGrowth(ch);

    const growthBadge = (val) => {
      const d = growth ? (val === 'subscribers' ? growth.subscribers : val === 'views' ? growth.views : growth.videos) : 0;
      const str = fmtDelta(d);
      if (!str) return '';
      const cls = d > 0 ? 'growth-pos' : 'growth-neg';
      return `<span class="${cls}">${str}</span>`;
    };

    const scoreCell = isOverall ? `<td class="num"><div class="score-bar-wrap"><div class="score-bar" style="width:${barWidth}px"></div>${computeOverallScore(ch, channelData)}</div></td>` : '';

    return `
      <tr class="${rankCls}">
        <td><span class="rank-num">${rank}</span></td>
        <td>
          <div class="channel-cell">
            ${avatarEl(ch, 32)}
            <a class="channel-name-link" href="${ch.url}" target="_blank" rel="noopener">${ch.name}</a>
          </div>
        </td>
        <td class="${currentTab==='subscribers'?'num':'muted-num'}">${fmt(ch.subscribers)} ${growthBadge('subscribers')}</td>
        <td class="${currentTab==='views'?'num':'muted-num'}">${fmt(ch.views)} ${growthBadge('views')}</td>
        <td class="${currentTab==='videos'?'num':'muted-num'}">${fmt(ch.videos)} ${growthBadge('videos')}</td>
        <td class="${currentTab==='age'?'num':'muted-num'}">${fmtDate(ch.joinedAt)}</td>
        ${scoreCell}
      </tr>
    `;
  }).join('');
}

function getPrimaryValue(ch, tab) {
  switch (tab) {
    case 'overall':     return computeOverallScore(ch, channelData);
    case 'subscribers': return ch.subscribers;
    case 'views':       return ch.views;
    case 'videos':      return ch.videos;
    case 'age':         return Date.now() - ch.joinedAt.getTime();
    case 'frequency':   return uploadFreq(ch);
    default:            return 0;
  }
}

/* ============================================================
   RENDER — MILESTONES
   ============================================================ */
function renderMilestones() {
  document.getElementById('milestones-section').style.display = '';

  const rows = channelData.map(ch => {
    const nextSub  = nextMilestone(ch.subscribers);
    const nextView = nextMilestone(ch.views);

    const subPct  = nextSub  ? Math.round((ch.subscribers / nextSub)  * 100) : 100;
    const viewPct = nextView ? Math.round((ch.views       / nextView) * 100) : 100;

    const subLeft  = nextSub  ? fmt(nextSub  - ch.subscribers) + ' to go' : 'Maxed out';
    const viewLeft = nextView ? fmt(nextView - ch.views)       + ' to go' : 'Maxed out';

    return `
      <div class="milestone-card">
        <div class="milestone-channel">
          ${avatarEl(ch, 36)}
          <a href="${ch.url}" target="_blank" class="milestone-name">${ch.name}</a>
        </div>
        <div class="milestone-stats">
          <div class="milestone-row">
            <div class="milestone-meta">
              <span class="milestone-label">Subscribers</span>
              <span class="milestone-values">${fmt(ch.subscribers)} → <strong>${nextSub ? fmt(nextSub) : '—'}</strong></span>
            </div>
            <div class="milestone-bar-track"><div class="milestone-bar" style="width:${subPct}%"></div></div>
            <span class="milestone-left">${subLeft}</span>
          </div>
          <div class="milestone-row">
            <div class="milestone-meta">
              <span class="milestone-label">Views</span>
              <span class="milestone-values">${fmt(ch.views)} → <strong>${nextView ? fmt(nextView) : '—'}</strong></span>
            </div>
            <div class="milestone-bar-track"><div class="milestone-bar milestone-bar-views" style="width:${viewPct}%"></div></div>
            <span class="milestone-left">${viewLeft}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('milestones-content').innerHTML = rows;
}

/* ============================================================
   RENDER — TIMELINE
   ============================================================ */
function renderTimeline() {
  document.getElementById('timeline-section').style.display = '';

  const sorted  = [...channelData].sort((a, b) => a.joinedAt - b.joinedAt);
  const oldest  = sorted[0].joinedAt.getTime();
  const newest  = sorted[sorted.length - 1].joinedAt.getTime();
  const span    = newest - oldest || 1;

  const rows = sorted.map((ch, i) => {
    const pct = Math.round(((ch.joinedAt.getTime() - oldest) / span) * 85);
    return `
      <div class="timeline-row">
        <div class="timeline-channel">
          ${avatarEl(ch, 28)}
          <a href="${ch.url}" target="_blank" class="timeline-name">${ch.name}</a>
        </div>
        <div class="timeline-track">
          <div class="timeline-dot-wrap" style="left:${pct}%">
            <div class="timeline-dot ${i === 0 ? 'timeline-dot-first' : ''}"></div>
            <div class="timeline-date-label">${fmtDate(ch.joinedAt)}</div>
          </div>
          <div class="timeline-line"></div>
        </div>
        <div class="timeline-age">${channelAge(ch.joinedAt)} ago</div>
      </div>
    `;
  }).join('');

  document.getElementById('timeline-content').innerHTML = `<div class="timeline-list">${rows}</div>`;
}

/* ============================================================
   RENDER — UPLOAD FREQUENCY
   ============================================================ */
function renderFrequency() {
  document.getElementById('frequency-section').style.display = '';

  const sorted  = getSortedChannels('frequency');
  const maxFreq = Math.max(...sorted.map(uploadFreq), 1);

  const rows = sorted.map((ch, i) => {
    const freq    = uploadFreq(ch);
    const barPct  = Math.round((freq / maxFreq) * 100);
    const rank    = i + 1;
    const rankCls = rank <= 3 ? `rank-${rank}` : '';

    return `
      <div class="freq-row ${rankCls}">
        <span class="freq-rank rank-num">${rank}</span>
        <div class="freq-channel">
          ${avatarEl(ch, 30)}
          <a href="${ch.url}" target="_blank" class="channel-name-link">${ch.name}</a>
        </div>
        <div class="freq-bar-wrap">
          <div class="freq-bar" style="width:${barPct}%"></div>
        </div>
        <div class="freq-stats">
          <span class="freq-value">${freq.toFixed(2)}<span class="freq-unit">/mo</span></span>
          <span class="freq-total muted-num">${fmt(ch.videos)} total</span>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('frequency-content').innerHTML = `<div class="freq-list">${rows}</div>`;
}

/* ============================================================
   RENDER — COMPARE
   ============================================================ */
function populateCompareSelects() {
  const selA = document.getElementById('compare-select-a');
  const selB = document.getElementById('compare-select-b');
  const opts = channelData.map(ch => `<option value="${ch.id}">${ch.name}</option>`).join('');
  selA.innerHTML = opts;
  selB.innerHTML = opts;
  if (channelData.length >= 2) { selA.value = channelData[0].id; selB.value = channelData[1].id; }
  compareA = selA.value;
  compareB = selB.value;
}

function renderCompare() {
  document.getElementById('compare-section').style.display = '';
  const chA = channelData.find(c => c.id === compareA);
  const chB = channelData.find(c => c.id === compareB);
  if (!chA || !chB) return;

  const ageA   = Date.now() - chA.joinedAt.getTime();
  const ageB   = Date.now() - chB.joinedAt.getTime();
  const scoreA = computeOverallScore(chA, channelData);
  const scoreB = computeOverallScore(chB, channelData);
  const vpvA   = chA.videos > 0 ? chA.views / chA.videos : 0;
  const vpvB   = chB.videos > 0 ? chB.views / chB.videos : 0;
  const freqA  = uploadFreq(chA);
  const freqB  = uploadFreq(chB);

  const stats = [
    { label: 'Subscribers',       a: chA.subscribers, b: chB.subscribers, fmt: fmt,  higherWins: true  },
    { label: 'Total Views',        a: chA.views,       b: chB.views,       fmt: fmt,  higherWins: true  },
    { label: 'Avg Views / Video',  a: vpvA,            b: vpvB,            fmt: v => fmt(Math.round(v)), higherWins: true },
    { label: 'Videos',             a: chA.videos,      b: chB.videos,      fmt: fmt,  higherWins: true  },
    { label: 'Upload Freq',        a: freqA,           b: freqB,           fmt: v => v.toFixed(2)+'/mo', higherWins: true },
    { label: 'Channel Age',        a: ageA,            b: ageB,            fmt: v => channelAge(new Date(Date.now() - v)), higherWins: false },
    { label: 'Overall Score',      a: scoreA,          b: scoreB,          fmt: v => v+' pts', higherWins: true },
  ];

  let winsA = 0, winsB = 0;
  stats.forEach(s => {
    if (s.a === s.b) return;
    if (s.higherWins ? s.a > s.b : s.a < s.b) winsA++; else winsB++;
  });

  const verdict = winsA > winsB ? `${chA.name} wins ${winsA}–${winsB}` : winsB > winsA ? `${chB.name} wins ${winsB}–${winsA}` : 'All tied up';

  const rows = stats.map(s => {
    const aWins  = s.higherWins ? s.a > s.b : s.a < s.b;
    const bWins  = s.higherWins ? s.b > s.a : s.b < s.a;
    const tied   = s.a === s.b;
    const maxVal = Math.max(s.a, s.b, 1);
    const barA   = Math.round((s.a / maxVal) * 100);
    const barB   = Math.round((s.b / maxVal) * 100);

    return `
      <div class="compare-row">
        <div class="compare-side compare-side-a ${aWins?'winner':''} ${tied?'tied':''}">
          <span class="compare-value">${s.fmt(s.a)}</span>
          <div class="compare-bar-wrap"><div class="compare-bar compare-bar-a ${aWins?'bar-win':''}" style="width:${barA}%"></div></div>
        </div>
        <div class="compare-label-center">
          <span class="compare-stat-label">${s.label}</span>
          ${aWins ? '<span class="compare-arrow">◀</span>' : ''}
          ${bWins ? '<span class="compare-arrow">▶</span>' : ''}
          ${tied  ? '<span class="compare-tied">TIE</span>' : ''}
        </div>
        <div class="compare-side compare-side-b ${bWins?'winner':''} ${tied?'tied':''}">
          <div class="compare-bar-wrap"><div class="compare-bar compare-bar-b ${bWins?'bar-win':''}" style="width:${barB}%"></div></div>
          <span class="compare-value">${s.fmt(s.b)}</span>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('compare-content').innerHTML = `
    <div class="compare-header-row">
      <div class="compare-channel-header">
        ${chA.avatar ? `<img src="${chA.avatar}" class="compare-avatar" />` : `<div class="compare-avatar-placeholder">${chA.name[0]}</div>`}
        <a href="${chA.url}" target="_blank" class="compare-channel-name">${chA.name}</a>
      </div>
      <div class="compare-vs">VS</div>
      <div class="compare-channel-header compare-channel-header-b">
        <a href="${chB.url}" target="_blank" class="compare-channel-name">${chB.name}</a>
        ${chB.avatar ? `<img src="${chB.avatar}" class="compare-avatar" />` : `<div class="compare-avatar-placeholder">${chB.name[0]}</div>`}
      </div>
    </div>
    <div class="compare-rows">${rows}</div>
    <div class="compare-verdict">${verdict}</div>
  `;
}

/* ============================================================
   STATUS
   ============================================================ */
function setStatus(text, cls) {
  const el = document.getElementById('update-status');
  el.textContent = text;
  el.className   = 'update-pill' + (cls ? ' ' + cls : '');
}

function showError(msg) {
  setStatus('Error', 'error');
  document.getElementById('leaderboard-body').innerHTML = `<tr><td colspan="7" class="error-cell">${msg}</td></tr>`;
  document.getElementById('podium-row').innerHTML = '';
}

/* ============================================================
   DEMO DATA
   ============================================================ */
function showDemoData() {
  channelData = [
    { id:'1', name:'PixelKnight', avatar:null, url:'#', subscribers:2800000, views:145000000, videos:312, joinedAt:new Date('2018-03-14') },
    { id:'2', name:'CraftyQuinn', avatar:null, url:'#', subscribers:1200000, views:89000000,  videos:540, joinedAt:new Date('2017-07-22') },
    { id:'3', name:'NoxBuild',    avatar:null, url:'#', subscribers:960000,  views:61000000,  videos:228, joinedAt:new Date('2019-01-05') },
    { id:'4', name:'SkywardLuna', avatar:null, url:'#', subscribers:740000,  views:42000000,  videos:180, joinedAt:new Date('2020-06-18') },
    { id:'5', name:'RedstoneRex', avatar:null, url:'#', subscribers:510000,  views:29000000,  videos:400, joinedAt:new Date('2016-11-30') },
    { id:'6', name:'VoidWatcher', avatar:null, url:'#', subscribers:330000,  views:18500000,  videos:95,  joinedAt:new Date('2021-02-10') },
  ];
  setStatus('Demo mode — add your API key', 'error');
  populateCompareSelects();
  renderMvpCard();
  render();
}

/* ============================================================
   THEME TOGGLE
   ============================================================ */
const themeBtn = document.getElementById('theme-toggle');
themeBtn.addEventListener('click', () => {
  const html  = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeBtn.textContent = isDark ? '☾' : '☀';
  try { localStorage.setItem('clicksmp_theme', isDark ? 'light' : 'dark'); } catch {}
});

// Restore saved theme
try {
  const saved = localStorage.getItem('clicksmp_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    themeBtn.textContent = saved === 'light' ? '☾' : '☀';
  }
} catch {}

/* ============================================================
   TABS
   ============================================================ */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    if (channelData.length) render();
  });
});

/* ============================================================
   COMPARE SELECTS
   ============================================================ */
document.getElementById('compare-select-a').addEventListener('change', e => { compareA = e.target.value; if (currentTab === 'compare') renderCompare(); });
document.getElementById('compare-select-b').addEventListener('change', e => { compareB = e.target.value; if (currentTab === 'compare') renderCompare(); });

/* ============================================================
   REFRESH
   ============================================================ */
document.getElementById('refresh-btn').addEventListener('click', () => {
  clearInterval(refreshTimer);
  loadAllChannels();
  refreshTimer = setInterval(loadAllChannels, REFRESH_INTERVAL_MS);
});

/* ============================================================
   INIT
   ============================================================ */
loadAllChannels();
refreshTimer = setInterval(loadAllChannels, REFRESH_INTERVAL_MS);
