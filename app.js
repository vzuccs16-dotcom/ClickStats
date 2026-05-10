/* ============================================================
   SMP LEADERBOARD — app.js
   ============================================================

   SETUP INSTRUCTIONS:
   ───────────────────
   1. Go to https://console.cloud.google.com/
   2. Create a project → Enable "YouTube Data API v3"
   3. Go to Credentials → Create API Key → copy it below
   4. Add your SMP members' YouTube channel URLs or IDs below

   YouTube Channel ID formats accepted:
   - Channel ID:  UCxxxxxxxxxxxxxxxxxxxxxx
   - Custom URL:  @ChannelName  (will be resolved automatically)
   - Full URL:    https://www.youtube.com/@ChannelName

   ============================================================ */

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
  { id: 'UC-v7iAWeGUCSRAx4BwXZG4Q' },  // example
  // Add more channels like:
  // { id: 'UC_your_channel_id_here' },
];

/* ── REFRESH INTERVAL ─────────────────────────────────────── */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/* ============================================================
   APP STATE
   ============================================================ */
let channelData = [];
let currentTab = 'overall';
let refreshTimer = null;

/* ============================================================
   YOUTUBE API
   ============================================================ */
async function fetchChannelStats(channelId) {
  const cleanId = channelId.trim();

  // Resolve @handle to channel ID if needed
  let resolvedId = cleanId;
  if (cleanId.startsWith('@') || cleanId.startsWith('https://')) {
    const handle = cleanId.replace('https://www.youtube.com/', '').replace('https://youtube.com/', '');
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&key=${YOUTUBE_API_KEY}&maxResults=1`
    );
    const searchData = await searchRes.json();
    if (!searchData.items || searchData.items.length === 0) throw new Error(`Could not find channel: ${cleanId}`);
    resolvedId = searchData.items[0].snippet.channelId;
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${resolvedId}&key=${YOUTUBE_API_KEY}`
  );
  const data = await res.json();

  if (!data.items || data.items.length === 0) throw new Error(`No data for channel: ${resolvedId}`);

  const ch = data.items[0];
  const stats = ch.statistics;

  return {
    id: resolvedId,
    name: ch.snippet.title,
    avatar: ch.snippet.thumbnails?.default?.url || null,
    url: `https://www.youtube.com/channel/${resolvedId}`,
    subscribers: parseInt(stats.subscriberCount || 0),
    views: parseInt(stats.viewCount || 0),
    videos: parseInt(stats.videoCount || 0),
    joinedAt: new Date(ch.snippet.publishedAt),
  };
}

async function loadAllChannels() {
  setStatus('Fetching...', '');

  if (YOUTUBE_API_KEY === 'YOUR_API_KEY_HERE') {
    showDemoData();
    return;
  }

  try {
    const results = await Promise.allSettled(
      CHANNELS.map(ch => fetchChannelStats(ch.id))
    );

    channelData = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const failed = results.filter(r => r.status === 'rejected').length;

    if (channelData.length === 0) {
      showError('No channel data could be loaded. Check your API key and channel IDs.');
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setStatus(`Updated ${timeStr}${failed ? ` (${failed} failed)` : ''}`, 'live');
    render();
  } catch (err) {
    showError('API error: ' + err.message);
  }
}

/* ============================================================
   SCORING (Overall tab)
   Subs and views are normalized 0–100 then averaged.
   ============================================================ */
function computeOverallScore(ch, allChannels) {
  const maxSubs = Math.max(...allChannels.map(c => c.subscribers), 1);
  const maxViews = Math.max(...allChannels.map(c => c.views), 1);
  const subScore = (ch.subscribers / maxSubs) * 1000;
  const viewScore = (ch.views / maxViews) * 1000;
  return Math.round((subScore * 0.4 + viewScore * 0.6));
}

/* ============================================================
   SORTING
   ============================================================ */
function getSortedChannels(tab) {
  const clone = [...channelData];
  switch (tab) {
    case 'overall':
      return clone.sort((a, b) =>
        computeOverallScore(b, clone) - computeOverallScore(a, clone));
    case 'subscribers':
      return clone.sort((a, b) => b.subscribers - a.subscribers);
    case 'views':
      return clone.sort((a, b) => b.views - a.views);
    case 'videos':
      return clone.sort((a, b) => b.videos - a.videos);
    case 'age':
      return clone.sort((a, b) => a.joinedAt - b.joinedAt);
    default:
      return clone;
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

function fmtDate(d) {
  return d.toLocaleDateString([], { year: 'numeric', month: 'short' });
}

function channelAge(d) {
  const years = ((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
  return years + 'y';
}

function avatarEl(ch, size = 32) {
  if (ch.avatar) {
    return `<img src="${ch.avatar}" alt="${ch.name}" width="${size}" height="${size}" onerror="this.style.display='none'" />`;
  }
  return `<div class="channel-cell-placeholder" style="width:${size}px;height:${size}px;font-size:${size * 0.4}px">${ch.name[0]}</div>`;
}

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  renderPodium();
  renderTable();
}

function renderPodium() {
  const sorted = getSortedChannels(currentTab);
  const top3 = sorted.slice(0, 3);
  const podium = document.getElementById('podium-row');

  const rankColors = ['var(--gold)', 'var(--silver)', 'var(--bronze)'];
  const rankLabels = ['1ST', '2ND', '3RD'];

  podium.innerHTML = top3.map((ch, i) => {
    const rankClass = `rank-${i + 1}`;
    const score = getPrimaryScore(ch, currentTab);
    const label = getPrimaryLabel(currentTab);
    return `
      <div class="podium-card ${rankClass}">
        <div class="podium-rank">${rankLabels[i]}</div>
        ${ch.avatar
          ? `<img class="podium-avatar" src="${ch.avatar}" alt="${ch.name}" onerror="this.outerHTML='<div class=\'podium-avatar-placeholder\'>${ch.name[0]}</div>'" />`
          : `<div class="podium-avatar-placeholder">${ch.name[0]}</div>`
        }
        <div class="podium-name">${ch.name}</div>
        <div class="podium-score">${score}</div>
        <div class="podium-label">${label}</div>
      </div>
    `;
  }).join('');
}

function getPrimaryScore(ch, tab) {
  switch (tab) {
    case 'overall':     return computeOverallScore(ch, channelData) + ' pts';
    case 'subscribers': return fmt(ch.subscribers);
    case 'views':       return fmt(ch.views);
    case 'videos':      return fmt(ch.videos) + ' videos';
    case 'age':         return channelAge(ch.joinedAt);
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
    default:            return '';
  }
}

function getTableHeaders(tab) {
  const base = ['#', 'Channel', 'Subscribers', 'Views', 'Videos', 'Since'];
  if (tab === 'overall') return [...base, 'Score'];
  return base;
}

function renderTable() {
  const sorted = getSortedChannels(currentTab);
  const maxPrimary = getPrimaryMax(currentTab, sorted);

  const thead = document.getElementById('table-head');
  thead.innerHTML = getTableHeaders(currentTab)
    .map((h, i) => `<th class="${i > 1 ? 'num' : ''}">${h}</th>`)
    .join('');

  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = sorted.map((ch, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const primary = getPrimaryValue(ch, currentTab);
    const barWidth = Math.round((primary / maxPrimary) * 80);

    const scoreCell = currentTab === 'overall'
      ? `<td class="num">
           <div class="score-bar-wrap">
             <div class="score-bar" style="width:${barWidth}px"></div>
             ${computeOverallScore(ch, channelData)}
           </div>
         </td>`
      : '';

    return `
      <tr class="${rankClass}">
        <td><span class="rank-num">${rank}</span></td>
        <td>
          <div class="channel-cell">
            ${avatarEl(ch, 32)}
            <a class="channel-name-link" href="${ch.url}" target="_blank" rel="noopener">${ch.name}</a>
          </div>
        </td>
        <td class="${currentTab === 'subscribers' ? 'num' : 'muted-num'}">${fmt(ch.subscribers)}</td>
        <td class="${currentTab === 'views' ? 'num' : 'muted-num'}">${fmt(ch.views)}</td>
        <td class="${currentTab === 'videos' ? 'num' : 'muted-num'}">${fmt(ch.videos)}</td>
        <td class="${currentTab === 'age' ? 'num' : 'muted-num'}">${fmtDate(ch.joinedAt)}</td>
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
    default:            return 0;
  }
}

function getPrimaryMax(tab, sorted) {
  return Math.max(...sorted.map(ch => getPrimaryValue(ch, tab)), 1);
}

/* ============================================================
   STATUS
   ============================================================ */
function setStatus(text, cls) {
  const el = document.getElementById('update-status');
  el.textContent = text;
  el.className = 'update-pill' + (cls ? ' ' + cls : '');
}

function showError(msg) {
  setStatus('Error', 'error');
  document.getElementById('leaderboard-body').innerHTML =
    `<tr><td colspan="7" class="error-cell">${msg}</td></tr>`;
  document.getElementById('podium-row').innerHTML = '';
}

/* ============================================================
   DEMO DATA (shown when no API key is set)
   ============================================================ */
function showDemoData() {
  channelData = [
    { id: '1', name: 'PixelKnight',  avatar: null, url: '#', subscribers: 2800000, views: 145000000, videos: 312, joinedAt: new Date('2018-03-14') },
    { id: '2', name: 'CraftyQuinn',  avatar: null, url: '#', subscribers: 1200000, views: 89000000,  videos: 540, joinedAt: new Date('2017-07-22') },
    { id: '3', name: 'NoxBuild',     avatar: null, url: '#', subscribers: 960000,  views: 61000000,  videos: 228, joinedAt: new Date('2019-01-05') },
    { id: '4', name: 'SkywardLuna',  avatar: null, url: '#', subscribers: 740000,  views: 42000000,  videos: 180, joinedAt: new Date('2020-06-18') },
    { id: '5', name: 'RedstoneRex',  avatar: null, url: '#', subscribers: 510000,  views: 29000000,  videos: 400, joinedAt: new Date('2016-11-30') },
    { id: '6', name: 'VoidWatcher',  avatar: null, url: '#', subscribers: 330000,  views: 18500000,  videos: 95,  joinedAt: new Date('2021-02-10') },
  ];

  setStatus('Demo mode — add your API key', 'error');
  render();
}

/* ============================================================
   TABS
   ============================================================ */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    if (channelData.length > 0) render();
  });
});

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
