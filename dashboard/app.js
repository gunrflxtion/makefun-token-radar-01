// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail dialog with the model's own
// inputs and the protocol's farm plan, and the calibration table the multiples come from.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var rows = DATA.rows || [];
  var live = DATA.live || [];
  var state = { q: '', category: 'all', chain: 'all', watchonly: false, tab: 'pre', sort: 'rank', dir: 1 };

  function el(id) { return document.getElementById(id); }
  function text(parent, value) { parent.appendChild(document.createTextNode(value == null ? '' : String(value))); }

  function money(n) {
    if (n == null) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageLabel(days) {
    if (days == null) return '—';
    if (days < 365) return days + 'd';
    var y = Math.floor(days / 365);
    var m = Math.floor((days % 365) / 30);
    return y + 'y' + (m > 0 ? ' ' + m + 'm' : '');
  }
  function chainLabel(chains) {
    if (!chains || chains.length === 0) return '—';
    return chains.length > 2 ? chains.slice(0, 2).join(', ') + ' +' + (chains.length - 2) : chains.join(', ');
  }

  /* Header and stats. */
  el('asof').textContent = 'Snapshot ' + DATA.as_of;
  el('modelver').textContent = 'Model ' + DATA.model_version;
  var stats = el('stats');
  var totalImplied = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
  var statDefs = [
    ['Rows', String(DATA.board_size), 'pre-token protocols'],
    ['Watchlist', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'covered in full'],
    ['Early finds', String(DATA.early_size), 'below the watchlist floor'],
    ['Total implied', money(totalImplied), 'across the board'],
    ['Median multiple', DATA.global_multiple.toFixed(3), 'mcap / TVL, all live tokens'],
  ];
  statDefs.forEach(function (d) {
    var box = document.createElement('div');
    var dt = document.createElement('dt'); text(dt, d[0]);
    var dd = document.createElement('dd'); text(dd, d[1]);
    var sm = document.createElement('small'); text(sm, ' ' + d[2]);
    dd.appendChild(sm);
    box.appendChild(dt); box.appendChild(dd);
    stats.appendChild(box);
  });

  /* Filter options, from the data itself. */
  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
  }
  uniqueSorted(rows.map(function (r) { return r.category || 'Other'; })).forEach(function (c) {
    var o = document.createElement('option'); o.value = c; text(o, c); el('category').appendChild(o);
  });
  uniqueSorted(rows.reduce(function (all, r) { return all.concat(r.chains || []); }, [])).forEach(function (c) {
    var o = document.createElement('option'); o.value = c; text(o, c); el('chain').appendChild(o);
  });

  /* The calibration table: where each multiple comes from. */
  var calBody = el('calibration-rows');
  (DATA.calibration || []).forEach(function (c) {
    var tr = document.createElement('tr');
    var td1 = document.createElement('td'); text(td1, c.category);
    var td2 = document.createElement('td'); td2.className = 'num'; text(td2, c.multiple.toFixed(4));
    var td3 = document.createElement('td'); td3.className = 'num'; text(td3, String(c.live_count));
    var td4 = document.createElement('td'); text(td4, c.source === 'category' ? 'Same-category live tokens' : 'Global median (fewer than 3 comps)');
    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
    calBody.appendChild(tr);
  });

  /* Filtering and sorting. */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.watchonly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (q !== '' && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    list.sort(function (a, b) {
      var va = a[key];
      var vb = b[key];
      if (va == null && vb == null) return a.slug < b.slug ? -1 : 1;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
    return list;
  }

  function render() {
    var body = el('rows');
    body.innerHTML = '';
    if (state.tab === 'pre') {
      var list = filtered();
      el('count').textContent = 'Showing ' + list.length + ' of ' + rows.length + ' pre-token protocols, ranked by implied value.';
      var maxImplied = rows.length > 0 ? rows[0].implied_value_usd : 1;
      list.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.addEventListener('click', function () { openDetail(r); });
        var tdRank = document.createElement('td'); tdRank.className = 'num'; text(tdRank, '#' + r.rank);
        var tdName = document.createElement('td'); tdName.className = 'name';
        var b = document.createElement('b'); text(b, r.name); tdName.appendChild(b);
        var s = document.createElement('span'); text(s, (r.category || 'Other') + ' · ' + chainLabel(r.chains)); tdName.appendChild(s);
        var tdTvl = document.createElement('td'); tdTvl.className = 'num'; text(tdTvl, money(r.tvl_usd));
        var tdChg = document.createElement('td'); tdChg.className = 'num ' + (r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'); text(tdChg, pct(r.change_7d));
        var tdAge = document.createElement('td'); tdAge.className = 'num'; text(tdAge, ageLabel(r.age_days));
        var tdMult = document.createElement('td'); tdMult.className = 'num'; text(tdMult, r.multiple.toFixed(3));
        var tdImp = document.createElement('td'); tdImp.className = 'num';
        var bar = document.createElement('span'); bar.className = 'bar';
        bar.style.width = Math.max(2, Math.round(120 * r.implied_value_usd / maxImplied)) + 'px';
        tdImp.appendChild(bar); text(tdImp, money(r.implied_value_usd));
        var tdStatus = document.createElement('td');
        var badge = document.createElement('span'); badge.className = 'badge ' + (r.watchlist ? 'watch' : 'early');
        text(badge, r.watchlist ? 'WATCHLIST' : 'EARLY'); tdStatus.appendChild(badge);
        tr.appendChild(tdRank); tr.appendChild(tdName); tr.appendChild(tdTvl); tr.appendChild(tdChg);
        tr.appendChild(tdAge); tr.appendChild(tdMult); tr.appendChild(tdImp); tr.appendChild(tdStatus);
        body.appendChild(tr);
      });
    } else {
      el('count').textContent = live.length + ' live-token protocols by market cap, shown to calibrate the model — they already trade, so they are not ranked.';
      var maxMcap = live.length > 0 ? (live[0].mcap_usd || 1) : 1;
      live.forEach(function (r, i) {
        var tr = document.createElement('tr');
        tr.addEventListener('click', function () { openLiveDetail(r, i + 1); });
        var tdRank = document.createElement('td'); tdRank.className = 'num'; text(tdRank, '#' + (i + 1));
        var tdName = document.createElement('td'); tdName.className = 'name';
        var b = document.createElement('b'); text(b, r.name); tdName.appendChild(b);
        var s = document.createElement('span'); text(s, (r.category || 'Other') + ' · ' + chainLabel(r.chains)); tdName.appendChild(s);
        var tdTvl = document.createElement('td'); tdTvl.className = 'num'; text(tdTvl, money(r.tvl_usd));
        var tdChg = document.createElement('td'); tdChg.className = 'num ' + (r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'); text(tdChg, pct(r.change_7d));
        var tdAge = document.createElement('td'); tdAge.className = 'num'; text(tdAge, '—');
        var tdMult = document.createElement('td'); tdMult.className = 'num'; text(tdMult, r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(3) : '—');
        var tdImp = document.createElement('td'); tdImp.className = 'num';
        var bar = document.createElement('span'); bar.className = 'bar';
        bar.style.width = Math.max(2, Math.round(120 * (r.mcap_usd || 0) / maxMcap)) + 'px';
        tdImp.appendChild(bar); text(tdImp, money(r.mcap_usd));
        var tdStatus = document.createElement('td');
        var badge = document.createElement('span'); badge.className = 'badge live'; text(badge, 'LIVE TOKEN'); tdStatus.appendChild(badge);
        tr.appendChild(tdRank); tr.appendChild(tdName); tr.appendChild(tdTvl); tr.appendChild(tdChg);
        tr.appendChild(tdAge); tr.appendChild(tdMult); tr.appendChild(tdImp); tr.appendChild(tdStatus);
        body.appendChild(tr);
      });
    }
    document.querySelectorAll('#table thead th[data-sort]').forEach(function (th) {
      th.setAttribute('aria-sort', th.getAttribute('data-sort') === state.sort ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    });
  }

  /* Detail dialog. */
  var dialog = el('detail');
  function splitStep(step) {
    var costAt = step.lastIndexOf(' Cost: ');
    var timeAt = step.lastIndexOf(' Time: ');
    if (costAt === -1 || timeAt === -1 || timeAt <= costAt) return { text: step, cost: '', time: '' };
    return {
      text: step.slice(0, costAt),
      cost: step.slice(costAt + 7, timeAt),
      time: step.slice(timeAt + 7).replace(/\.$/, ''),
    };
  }
  function openDetail(r) {
    var body = el('detail-body');
    body.innerHTML = '';
    var h = document.createElement('h2'); text(h, r.name); body.appendChild(h);
    var sub = document.createElement('p'); sub.className = 'sub';
    text(sub, 'Rank #' + r.rank + ' · ' + (r.category || 'Other') + ' · ' + chainLabel(r.chains) + ' · listed ' + (r.listed_at || 'date unknown') + ' · pre-token: the snapshot records no token');
    body.appendChild(sub);
    var h3a = document.createElement('h3'); text(h3a, 'Model breakdown'); body.appendChild(h3a);
    var base = r.tvl_usd * r.multiple;
    var afterGrowth = base * r.growth_multiplier;
    var afterMaturity = afterGrowth * r.maturity_multiplier;
    var lines = [
      'TVL ' + money(r.tvl_usd) + ' × multiple ' + r.multiple.toFixed(4) + ' (' + (r.multiple_source === 'category' ? 'same-category live tokens' : 'global median') + ') ≈ ' + money(base),
      '× growth ' + r.growth_multiplier.toFixed(4) + ' (7d ' + pct(r.change_7d) + ') ≈ ' + money(afterGrowth),
      '× maturity ' + r.maturity_multiplier.toFixed(4) + ' (age ' + ageLabel(r.age_days) + ') ≈ ' + money(afterMaturity),
      '× breadth ' + r.breadth_multiplier.toFixed(4) + ' (' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + ')',
      '= implied value ' + money(r.implied_value_usd) + ' (multipliers rounded to 4 dp)',
    ];
    var pre = document.createElement('p'); pre.className = 'breakdown'; text(pre, lines.join('\n')); body.appendChild(pre);
    var h3b = document.createElement('h3'); text(h3b, 'Farm plan'); body.appendChild(h3b);
    var ol = document.createElement('ol'); ol.className = 'steps';
    (r.farm_steps || []).forEach(function (step) {
      var parts = splitStep(step);
      var li = document.createElement('li');
      text(li, parts.text + ' ');
      var cost = document.createElement('span'); cost.className = 'cost';
      text(cost, 'Cost: ' + parts.cost + ' · Time: ' + parts.time + '.');
      li.appendChild(cost);
      ol.appendChild(li);
    });
    body.appendChild(ol);
    dialog.showModal();
  }
  function openLiveDetail(r, rank) {
    var body = el('detail-body');
    body.innerHTML = '';
    var h = document.createElement('h2'); text(h, r.name); body.appendChild(h);
    var sub = document.createElement('p'); sub.className = 'sub';
    text(sub, 'Live token #' + rank + ' by market cap · ' + (r.category || 'Other') + ' · ' + chainLabel(r.chains));
    body.appendChild(sub);
    var h3a = document.createElement('h3'); text(h3a, 'Market value, not a model'); body.appendChild(h3a);
    var p = document.createElement('p');
    text(p, 'Market cap ' + money(r.mcap_usd) + ' on TVL ' + money(r.tvl_usd) + ' — a market-cap-to-TVL ratio of ' + (r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(3) : '—') + '. It already trades, so it is not ranked; it is one of the live-token protocols the multiples are calibrated from.');
    body.appendChild(p);
    dialog.showModal();
  }

  /* Controls. */
  el('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  el('category').addEventListener('change', function (e) { state.category = e.target.value; render(); });
  el('chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  el('watchonly').addEventListener('change', function (e) { state.watchonly = e.target.checked; render(); });
  function setTab(tab) {
    state.tab = tab;
    el('tab-pre').setAttribute('aria-selected', tab === 'pre' ? 'true' : 'false');
    el('tab-live').setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    var heads = document.querySelectorAll('#table thead th');
    heads[5].textContent = tab === 'pre' ? 'Multiple' : 'Mcap / TVL';
    heads[6].textContent = tab === 'pre' ? 'Implied value' : 'Market cap';
    state.sort = 'rank';
    render();
  }
  el('tab-pre').addEventListener('click', function () { setTab('pre'); });
  el('tab-live').addEventListener('click', function () { setTab('live'); });
  document.querySelectorAll('#table thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      if (state.tab === 'live') return;
      var key = th.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      render();
    });
  });

  /* Deep links: ?q=..&category=..&chain=..&watchonly=1&tab=live&detail=<slug> share one view. */
  var params = new URLSearchParams(window.location.search);
  if (params.get('q')) { state.q = params.get('q'); el('q').value = state.q; }
  if (params.get('category')) { state.category = params.get('category'); el('category').value = state.category; }
  if (params.get('chain')) { state.chain = params.get('chain'); el('chain').value = state.chain; }
  if (params.get('watchonly') === '1') { state.watchonly = true; el('watchonly').checked = true; }
  if (params.get('tab') === 'live') setTab('live');
  render();
  var detailSlug = params.get('detail');
  if (detailSlug) {
    var found = null;
    rows.forEach(function (r) { if (r.slug === detailSlug) found = r; });
    if (found) openDetail(found);
  }
})();
