/* OKR Management System demo - page shell, shared components, charts and the AI Assist drawer. */
(function () {
  'use strict';

  var O = window.OKR;
  var esc = O.esc;

  // Surface unexpected script errors instead of failing silently.
  window.addEventListener('error', function (e) {
    document.documentElement.setAttribute('data-js-error', String(e.message || 'error'));
    toast('Something went wrong on this page', 'error', String(e.message || ''));
  });

  // ---------------------------------------------------------------- icons (inline SVG, 24px grid)
  var P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h5v-6h3v6h5V10"/>',
    explorer: '<rect x="3" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="10" width="7" height="4.5" rx="1.2"/><rect x="14" y="16.5" width="7" height="4.5" rx="1.2"/><path d="M6.5 8v10.75H14M6.5 12.25H14"/>',
    checkin: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    approvals: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.75h6V4"/><path d="m8.75 12.75 2.25 2.25 4.25-4.5"/>',
    reports: '<path d="M3 21h18"/><path d="M6.5 17v-5M11 17V6M15.5 17V9.5M20 17v-3"/>',
    notifications: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.75 2H4.25z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    admin: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    ai: '<path d="m11 3 1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="m18.5 15 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M4 19.5h16"/>',
    print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.5"/><path d="M7 14h10v6.5H7z"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>',
    comment: '<path d="M4 5h16v11H9l-5 4z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  };
  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (P[name] || '') + '</svg>';
  }

  // ---------------------------------------------------------------- small components
  function statusBadge(s) {
    var st = O.STATUS[s] || O.STATUS.NotStarted;
    return '<span class="badge status-' + esc(s) + '"><span class="glyph" aria-hidden="true">' + st.glyph + '</span>' + esc(st.label) + '</span>';
  }
  function levelChip(level) {
    return '<span class="chip lvl lvl-' + esc(level) + '">' + esc(O.LEVEL_LABELS[level] || level) + '</span>';
  }
  function approvalChip(state) {
    if (!state || state === 'Approved') return '';
    return '<span class="chip appr-' + esc(state) + '">' + esc(O.APPROVAL_STATES[state] || state) + '</span>';
  }
  function decisionChip(decision) {
    return '<span class="chip dec-' + esc(decision) + '">' + esc(decision) + '</span>';
  }
  function progress(value, status, label) {
    var v = Math.max(0, Math.min(100, Number(value) || 0));
    return '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(v) + '" aria-label="' + esc((label || 'Progress') + ': ' + Math.round(v) + '%') + '">' +
      '<span class="progress-track"><span class="progress-fill fill-' + esc(status || 'OnTrack') + '" style="inline-size:' + v + '%"></span></span>' +
      '<span class="progress-val">' + Math.round(v) + '%</span></div>';
  }
  var AVATAR_COLORS = ['#0B6A36', '#4F3E99', '#8E3A1E', '#00607A', '#7A2E62', '#5A5F00', '#1F4E9A', '#6B4A2B'];
  function initials(name) {
    return name.split(/\s+/).filter(Boolean).map(function (p) { return p[0]; }).slice(0, 2).join('').toUpperCase();
  }
  function avatar(userId, size) {
    var u = O.user(userId);
    var name = u ? u.displayName : 'Unassigned';
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    var px = size || 28;
    return '<span class="avatar" aria-hidden="true" style="background:' + AVATAR_COLORS[h % AVATAR_COLORS.length] + ';inline-size:' + px + 'px;block-size:' + px + 'px;font-size:' + Math.round(px * 0.4) + 'px">' + esc(initials(name)) + '</span>';
  }
  function person(userId, sub) {
    var u = O.user(userId);
    return '<span class="person">' + avatar(userId) + '<span><span class="person-name">' + esc(u ? u.displayName : 'Unassigned') + '</span>' +
      (sub && u ? '<span class="person-sub">' + esc(u.jobTitle) + '</span>' : '') + '</span></span>';
  }
  function flagChips(o) {
    return O.flags(o).map(function (f) {
      var cls = f === 'Overdue' ? 'flag-overdue' : f === 'Stale' ? 'flag-stale' : f === 'Due soon' ? 'flag-due' : 'flag-appr';
      return '<span class="chip ' + cls + '">' + esc(f) + '</span>';
    }).join(' ');
  }
  function okrLink(o, withTitle) {
    if (!o) return '–';
    return '<a href="okr.html?id=' + encodeURIComponent(o.id) + '" class="okr-link"><span class="code">' + esc(o.code) + '</span>' +
      (withTitle === false ? '' : ' ' + esc(o.title)) + '</a>';
  }
  function kpi(label, value, sub, tone) {
    return '<div class="kpi' + (tone ? ' kpi-' + tone : '') + '"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + value + '</div>' +
      (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>';
  }
  function breadcrumb(o, rootLabel, rootHref) {
    var items = ['<li><a href="' + (rootHref || 'explorer.html') + '">' + esc(rootLabel || 'OKR Explorer') + '</a></li>'];
    O.ancestors(o).forEach(function (a) { items.push('<li><a href="okr.html?id=' + encodeURIComponent(a.id) + '" title="' + esc(a.title) + '">' + esc(a.code) + '</a></li>'); });
    items.push('<li><span aria-current="page">' + esc(o.code) + '</span></li>');
    return '<nav aria-label="Breadcrumb"><ol class="breadcrumb">' + items.join('') + '</ol></nav>';
  }
  function pageHeader(opts) {
    return '<div class="page-header">' + (opts.before || '') +
      '<div class="page-header-row"><div><h1>' + esc(opts.title) + '</h1>' + (opts.subtitle ? '<p class="subtitle">' + opts.subtitle + '</p>' : '') + '</div>' +
      (opts.actions ? '<div class="actions">' + opts.actions + '</div>' : '') + '</div></div>';
  }
  function empty(msg) { return '<div class="empty">' + msg + '</div>'; }
  function selectOptions(list, selected, placeholder) {
    var out = placeholder !== undefined ? '<option value="">' + esc(placeholder) + '</option>' : '';
    return out + list.map(function (x) {
      var v = typeof x === 'string' ? x : x.value;
      var l = typeof x === 'string' ? x : x.label;
      return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }

  // ---------------------------------------------------------------- charts
  function chartCard(opts) {
    var id = opts.id;
    return '<section class="card chart-card" aria-labelledby="' + id + '-t">' +
      '<div class="card-head"><div><h2 class="card-title" id="' + id + '-t">' + esc(opts.title) + '</h2>' + (opts.desc ? '<p class="card-desc">' + esc(opts.desc) + '</p>' : '') + '</div>' +
      (opts.table ? '<button type="button" class="btn btn-subtle btn-sm" data-toggle-table="' + id + '" aria-pressed="false">' + icon('table') + '<span>Show table</span></button>' : '') + '</div>' +
      '<div id="' + id + '-chart">' + opts.chart + '</div>' +
      (opts.table ? '<div id="' + id + '-table" hidden>' + opts.table + '</div>' : '') + '</section>';
  }
  function simpleTable(headers, rows, caption) {
    return '<div class="table-wrap"><table class="data">' + (caption ? '<caption class="sr-only">' + esc(caption) + '</caption>' : '') +
      '<thead><tr>' + headers.map(function (h, i) { return '<th scope="col"' + (i ? ' class="num"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return i ? '<td class="num">' + c + '</td>' : '<th scope="row">' + c + '</th>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  }

  /** Donut of counts by status. rows: [{status, value}] */
  function statusDonut(counts, centerLabel) {
    var rows = O.STATUSES.map(function (s) { return { status: s, value: counts[s] || 0 }; });
    var total = rows.reduce(function (s, r) { return s + r.value; }, 0);
    var r = 64, c = 2 * Math.PI * r, gap = total > 1 ? 3 : 0, offset = 0;
    var arcs = rows.filter(function (x) { return x.value > 0; }).map(function (x) {
      var len = (x.value / total) * c;
      var st = O.STATUS[x.status];
      var tip = st.label + ': ' + x.value + ' (' + Math.round((x.value / total) * 100) + '%)';
      var seg = '<circle cx="90" cy="90" r="' + r + '" fill="none" stroke="' + st.color + '" stroke-width="22" stroke-dasharray="' + Math.max(len - gap, 0.5) + ' ' + (c - Math.max(len - gap, 0.5)) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 90 90)" data-tip="' + esc(tip) + '"/>';
      offset += len;
      return seg;
    }).join('');
    var legend = rows.map(function (x) {
      var st = O.STATUS[x.status];
      return '<li><span class="swatch" style="background:' + st.color + '" aria-hidden="true"></span><span class="glyph" aria-hidden="true" style="color:' + st.color + '">' + st.glyph + '</span>' +
        '<span class="legend-label">' + esc(st.label) + '</span><span class="legend-val">' + x.value + '</span></li>';
    }).join('');
    return '<div class="donut-wrap"><svg class="donut" viewBox="0 0 180 180" role="img" aria-label="' + esc(rows.map(function (x) { return O.STATUS[x.status].label + ' ' + x.value; }).join(', ')) + '">' +
      '<circle cx="90" cy="90" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="22"/>' + arcs +
      '<text x="90" y="88" text-anchor="middle" class="donut-total">' + total + '</text><text x="90" y="108" text-anchor="middle" class="donut-label">' + esc(centerLabel || 'items') + '</text></svg>' +
      '<ul class="legend">' + legend + '</ul></div>';
  }
  function statusTable(counts) {
    var total = O.STATUSES.reduce(function (s, k) { return s + (counts[k] || 0); }, 0) || 1;
    return simpleTable(['Status', 'Items', 'Share'], O.STATUSES.map(function (s) { return [esc(O.STATUS[s].label), counts[s] || 0, Math.round(((counts[s] || 0) / total) * 100) + '%']; }), 'Items by status');
  }

  /** Horizontal bars (0-100 by default). rows: [{label, value, status?, tip?, href?, sub?}] */
  function hbars(rows, opts) {
    opts = opts || {};
    var max = opts.max || 100;
    return '<ul class="hbars">' + rows.map(function (r) {
      var w = Math.max(0, Math.min(100, (r.value / max) * 100));
      var label = r.href ? '<a href="' + esc(r.href) + '">' + esc(r.label) + '</a>' : esc(r.label);
      return '<li data-tip="' + esc(r.tip || (r.label + ': ' + (opts.fmt ? opts.fmt(r.value) : Math.round(r.value) + '%'))) + '">' +
        '<span class="hbar-label">' + label + (r.sub ? '<span class="hbar-sub">' + esc(r.sub) + '</span>' : '') + '</span>' +
        '<span class="hbar-track"><span class="hbar-fill fill-' + esc(r.status || 'brand') + '" style="inline-size:' + w + '%"></span></span>' +
        '<span class="hbar-val">' + (opts.fmt ? opts.fmt(r.value) : Math.round(r.value) + '%') + '</span></li>';
    }).join('') + '</ul>';
  }

  /** Vertical bars for counts over time. rows: [{label, value}] */
  function vbars(rows, unit) {
    var W = 560, H = 200, padL = 30, padB = 26, padT = 18;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var niceMax = Math.ceil(max / 10) * 10;
    var bw = (W - padL) / rows.length;
    var y = function (v) { return H - padB - (v / niceMax) * (H - padB - padT); };
    var grid = [0, niceMax / 2, niceMax].map(function (g) {
      return '<line x1="' + padL + '" x2="' + W + '" y1="' + y(g) + '" y2="' + y(g) + '" class="grid"/><text x="' + (padL - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end" class="axis">' + g + '</text>';
    }).join('');
    var peak = rows.reduce(function (m, r, i) { return r.value > rows[m].value ? i : m; }, 0);
    var bars = rows.map(function (r, i) {
      var x = padL + i * bw + 4;
      var h = H - padB - y(r.value);
      var w = Math.max(bw - 8, 4);
      var path = h > 0 ? roundedTopBar(x, y(r.value), w, h, Math.min(4, w / 2, h)) : '';
      var showVal = i === peak || i === rows.length - 1;
      return '<g data-tip="' + esc('Week from ' + r.label + ': ' + r.value + ' ' + (unit || '')) + '"><rect x="' + (padL + i * bw) + '" y="' + padT + '" width="' + bw + '" height="' + (H - padB - padT) + '" fill="transparent"/>' +
        (path ? '<path d="' + path + '" class="bar"/>' : '') +
        (showVal ? '<text x="' + (x + w / 2) + '" y="' + (y(r.value) - 5) + '" text-anchor="middle" class="val">' + r.value + '</text>' : '') +
        (i % 2 === 0 || i === rows.length - 1 ? '<text x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="axis">' + esc(r.label) + '</text>' : '') + '</g>';
    }).join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(rows.map(function (r) { return r.label + ': ' + r.value; }).join('; ')) + '">' + grid + bars +
      '<line x1="' + padL + '" x2="' + W + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '" class="baseline"/></svg>';
  }
  function roundedTopBar(x, y, w, h, r) {
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  /** Progress over time (0-100) with a dashed "expected" line. points: [{date, value, tip}] */
  function progressLine(points, o) {
    var W = 600, H = 220, padL = 36, padR = 12, padB = 26, padT = 12;
    var t0 = new Date(o.startDate + 'T00:00:00Z').getTime();
    var t1 = new Date(o.dueDate + 'T00:00:00Z').getTime() + 86400000;
    if (points.length) t0 = Math.min(t0, new Date(points[0].date).getTime());
    var x = function (t) { return padL + ((t - t0) / (t1 - t0)) * (W - padL - padR); };
    var y = function (v) { return H - padB - (v / 100) * (H - padB - padT); };
    var grid = [0, 25, 50, 75, 100].map(function (g) {
      return '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(g) + '" y2="' + y(g) + '" class="grid"/><text x="' + (padL - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end" class="axis">' + g + '%</text>';
    }).join('');
    var months = '';
    var start = new Date(t0);
    for (var m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); m.getTime() < t1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 2, 1))) {
      months += '<text x="' + x(m.getTime()) + '" y="' + (H - 8) + '" text-anchor="middle" class="axis">' + O.fmtShort(m.toISOString()).replace(/^\d+\s/, '') + '</text>';
    }
    var asOfX = x(Math.min(O.asOf.getTime(), t1));
    var expected = '<line x1="' + x(new Date(o.startDate + 'T00:00:00Z').getTime()) + '" y1="' + y(0) + '" x2="' + x(t1) + '" y2="' + y(100) + '" class="expected"/>';
    var today = '<line x1="' + asOfX + '" x2="' + asOfX + '" y1="' + padT + '" y2="' + (H - padB) + '" class="today"/><text x="' + (asOfX - 4) + '" y="' + (padT + 10) + '" text-anchor="end" class="axis">Today</text>';
    var path = points.map(function (p, i) { return (i ? 'L' : 'M') + x(new Date(p.date).getTime()).toFixed(1) + ',' + y(p.value).toFixed(1); }).join('');
    var dots = points.map(function (p) {
      return '<circle cx="' + x(new Date(p.date).getTime()).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="4.5" class="dot fill-' + esc(p.status || 'OnTrack') + '" data-tip="' + esc(p.tip) + '"/>';
    }).join('');
    var last = points[points.length - 1];
    var lastLabel = last ? '<text x="' + (x(new Date(last.date).getTime()) + 8) + '" y="' + (y(last.value) - 8) + '" class="val">' + Math.round(last.value) + '%</text>' : '';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Progress over time for ' + esc(o.code) + '">' + grid + months + expected + today +
      '<path d="' + path + '" class="line"/>' + dots + lastLabel + '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="baseline"/></svg>' +
      '<p class="chart-key"><span class="key-line"></span> Actual progress <span class="key-dash"></span> Expected (linear to due date)</p>';
  }

  // ---------------------------------------------------------------- tooltip, toasts, dialogs, tabs
  var tipEl;
  function initTooltip() {
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { tipEl.hidden = true; return; }
      tipEl.textContent = t.getAttribute('data-tip');
      tipEl.hidden = false;
    });
    document.addEventListener('mousemove', function (e) {
      if (tipEl.hidden) return;
      var x = e.clientX + 14, y = e.clientY + 14;
      var r = tipEl.getBoundingClientRect();
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';
    });
    document.addEventListener('mouseleave', function () { tipEl.hidden = true; });
  }

  function toast(message, kind, detail) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (kind || 'success');
    el.innerHTML = '<strong>' + esc(message) + '</strong>' + (detail ? '<div>' + esc(detail) + '</div>' : '');
    host.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 4200);
    setTimeout(function () { el.remove(); }, 4700);
  }
  /** Show a toast on the next page (used when an action ends in a redirect). */
  function flash(message, kind, detail) {
    try { sessionStorage.setItem('okrDemo.flash', JSON.stringify({ message: message, kind: kind, detail: detail })); } catch (e) { /* ignore */ }
  }
  function showFlash() {
    try {
      var raw = sessionStorage.getItem('okrDemo.flash');
      if (!raw) return;
      sessionStorage.removeItem('okrDemo.flash');
      var f = JSON.parse(raw);
      toast(f.message, f.kind, f.detail);
    } catch (e) { /* ignore */ }
  }

  /**
   * Modal dialog built on the native <dialog> element (focus trap and Esc come for free).
   * opts: {title, body (html), okLabel, okClass, cancelLabel, onOk(dialogEl) -> false keeps it open}
   */
  function dialog(opts) {
    var dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.innerHTML = '<form method="dialog" novalidate><h2 id="dlg-title">' + esc(opts.title) + '</h2><div class="dialog-body">' + opts.body + '</div>' +
      '<div class="dialog-actions"><button type="button" class="btn" data-cancel>' + esc(opts.cancelLabel || 'Cancel') + '</button>' +
      (opts.okLabel ? '<button type="submit" class="btn ' + (opts.okClass || 'btn-primary') + '">' + esc(opts.okLabel) + '</button>' : '') + '</div></form>';
    document.body.appendChild(dlg);
    var close = function () { dlg.close(); };
    dlg.querySelector('[data-cancel]').addEventListener('click', close);
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.querySelector('form').addEventListener('submit', function (e) {
      if (opts.onOk && opts.onOk(dlg) === false) e.preventDefault();
    });
    dlg.showModal();
    return dlg;
  }

  /** Accessible tabs. root contains [role=tab][data-tab] buttons and [data-panel] sections. */
  function tabs(root, onChange) {
    var tabEls = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    function activate(name, focus, push) {
      tabEls.forEach(function (t) {
        var on = t.getAttribute('data-tab') === name;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
        var panel = root.querySelector('[data-panel="' + t.getAttribute('data-tab') + '"]');
        if (panel) panel.hidden = !on;
      });
      if (push) {
        var url = new URL(window.location.href);
        url.searchParams.set('tab', name);
        try { history.replaceState(null, '', url.toString()); } catch (e) { /* file:// in some browsers */ }
      }
      if (onChange) onChange(name);
    }
    tabEls.forEach(function (t, i) {
      t.addEventListener('click', function () { activate(t.getAttribute('data-tab'), false, true); });
      t.addEventListener('keydown', function (e) {
        var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (document.documentElement.dir === 'rtl') dir = -dir;
        if (e.key === 'Home') { activate(tabEls[0].getAttribute('data-tab'), true, true); e.preventDefault(); }
        if (e.key === 'End') { activate(tabEls[tabEls.length - 1].getAttribute('data-tab'), true, true); e.preventDefault(); }
        if (dir) { activate(tabEls[(i + dir + tabEls.length) % tabEls.length].getAttribute('data-tab'), true, true); e.preventDefault(); }
      });
    });
    var wanted = O.param('tab');
    var first = tabEls.filter(function (t) { return t.getAttribute('data-tab') === wanted; })[0] || tabEls[0];
    activate(first.getAttribute('data-tab'), false, false);
    return { activate: function (n) { activate(n, false, true); } };
  }

  // ---------------------------------------------------------------- page shell
  var NAV = [
    { key: 'home', href: 'index.html', label: 'Home' },
    { key: 'explorer', href: 'explorer.html', label: 'OKR Explorer' },
    { key: 'checkin', href: 'checkin.html', label: 'Check-in' },
    { key: 'approvals', href: 'approvals.html', label: 'Approvals' },
    { key: 'reports', href: 'reports.html', label: 'Reports' },
    { key: 'notifications', href: 'notifications.html', label: 'Notifications' },
    { key: 'admin', href: 'admin.html', label: 'Administration' },
  ];

  /**
   * Render the common layout and return the <main> element for the page's content.
   * Returns null (after showing a notice) when the current role may not open this screen.
   */
  function shell(navKey, title) {
    document.title = title + ' · OKR Management System';
    var dirParam = O.param('dir');
    if (dirParam === 'rtl' || dirParam === 'ltr') { try { sessionStorage.setItem('okrDemo.dir', dirParam); } catch (e) { /* ignore */ } }
    var dir = dirParam;
    try { dir = dir || sessionStorage.getItem('okrDemo.dir'); } catch (e) { /* ignore */ }
    document.documentElement.dir = dir === 'rtl' ? 'rtl' : 'ltr';

    var me = O.currentUser();
    var role = O.prefs.role;
    var cycle = O.currentCycle();
    var unread = O.unreadCount();
    var pending = O.pendingForMe().length;
    var badges = { notifications: unread, approvals: pending };

    var nav = NAV.filter(function (n) { return O.can.nav(n.key); }).map(function (n) {
      var count = badges[n.key] || 0;
      var active = n.key === navKey;
      return '<li><a href="' + n.href + '" class="nav-link' + (active ? ' active' : '') + '"' + (active ? ' aria-current="page"' : '') +
        ' title="' + esc(n.label) + '" data-nav="' + n.key + '"' + (count ? ' aria-label="' + esc(n.label + ', ' + count + ' new') + '"' : '') + '>' + icon(n.key) +
        '<span class="nav-label">' + esc(n.label) + '</span><span class="nav-badge" aria-hidden="true"' + (count ? '' : ' hidden') + '>' + count + '</span></a></li>';
    }).join('');

    var app = document.getElementById('app');
    app.innerHTML =
      '<a class="skip-link" href="#main">Skip to main content</a>' +
      '<div class="demo-banner" role="note">' + icon('info') + '<span>Demo environment with fictitious data – not an official DEWA system</span></div>' +
      '<header class="topbar">' +
      '<a href="index.html" class="wordmark" aria-label="OKR Management System, Transmission Power – home"><span class="wm-main">OKR Management System</span><span class="wm-divider" aria-hidden="true">|</span><span class="wm-sub">Transmission Power</span></a>' +
      '<form class="topbar-search" role="search" action="explorer.html" method="get"><label for="global-search" class="sr-only">Search OKRs</label>' + icon('search') +
      '<input id="global-search" name="q" type="search" placeholder="Search OKRs by title or code" autocomplete="off" value="' + esc(navKey === 'explorer' ? (O.param('q') || '') : '') + '"></form>' +
      '<div class="topbar-controls">' +
      '<label class="topbar-field"><span>Cycle</span><select id="period-select">' + O.PERIODS.map(function (p) {
        return '<option value="' + p + '"' + (p === O.prefs.period ? ' selected' : '') + '>' + esc(p === 'FY' ? cycle.name + ' (full year)' : cycle.name + ' ' + p) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="topbar-field"><span>View as</span><select id="role-select">' + O.ROLES.map(function (r) {
        var u = O.user(O.PERSONAS[r]);
        return '<option value="' + r + '"' + (r === role ? ' selected' : '') + '>' + esc(O.ROLE_LABELS[r] + ' – ' + u.displayName) + '</option>';
      }).join('') + '</select></label>' +
      (O.db.config.ai.enabled ? '<button type="button" class="btn btn-ai" id="ai-open" aria-haspopup="dialog" aria-controls="ai-drawer">' + icon('ai') + '<span>AI Assist</span></button>' : '') +
      '<span class="me" title="' + esc(me.displayName + ' – ' + me.jobTitle) + '">' + avatar(me.id, 32) + '<span class="sr-only">Signed in as ' + esc(me.displayName) + '</span></span>' +
      '</div></header>' +
      '<div class="app-body">' +
      '<nav class="navrail" aria-label="Main navigation"><ul>' + nav + '</ul>' +
      '<div class="nav-who"><span class="nav-who-label">Signed in as</span><strong>' + esc(me.displayName) + '</strong><span>' + esc(O.ROLE_LABELS[role]) + '</span></div></nav>' +
      '<main id="main" class="main" tabindex="-1"></main></div>' +
      '<footer class="footer"><span>Demo by Ducont – sample data only</span><span>Data as of ' + O.fmtDate(O.asOf.toISOString()) + ' · Fictitious names and figures · ' +
      '<button type="button" class="linklike" id="reset-demo">Reset demo data</button></span></footer>' +
      '<div id="toasts" class="toasts" aria-live="polite" aria-atomic="false"></div>';

    document.getElementById('role-select').addEventListener('change', function (e) {
      O.setPref('role', e.target.value);
      if (navKey && !O.can.nav(navKey, e.target.value)) window.location.href = 'index.html';
      else window.location.reload();
    });
    document.getElementById('period-select').addEventListener('change', function (e) {
      O.setPref('period', e.target.value);
      window.location.reload();
    });
    document.getElementById('reset-demo').addEventListener('click', confirmReset);
    initTooltip();
    initTableToggles();
    initAi();
    showFlash();

    var main = document.getElementById('main');
    if (navKey && !O.can.nav(navKey)) {
      main.innerHTML = pageHeader({ title: title }) +
        '<div class="msg msg-warning" role="status"><strong>Not available for your role.</strong> The ' + esc(O.ROLE_LABELS[role]) +
        ' role cannot open this screen. Switch role with “View as” at the top, or go back to <a href="index.html">Home</a>.</div>';
      return null;
    }
    return main;
  }

  /** Update the unread / pending counters in the navigation after an action on the same page. */
  function refreshNav() {
    var counts = { notifications: O.unreadCount(), approvals: O.pendingForMe().length };
    Object.keys(counts).forEach(function (key) {
      var link = document.querySelector('[data-nav="' + key + '"]');
      if (!link) return;
      var badge = link.querySelector('.nav-badge');
      var label = link.getAttribute('title');
      badge.textContent = counts[key];
      badge.hidden = !counts[key];
      if (counts[key]) link.setAttribute('aria-label', label + ', ' + counts[key] + ' new');
      else link.removeAttribute('aria-label');
    });
  }

  function confirmReset() {
    dialog({
      title: 'Reset demo data?',
      body: '<p>This removes every change made in this browser (check-ins, approvals, new items, settings) and restores the original sample data.</p>',
      okLabel: 'Reset',
      okClass: 'btn-danger',
      onOk: function () {
        O.resetDemo();
        flash('Demo data reset', 'success', 'The original sample data has been restored.');
        window.location.href = 'index.html';
      },
    });
  }

  function initTableToggles() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-toggle-table]');
      if (!b) return;
      var id = b.getAttribute('data-toggle-table');
      var table = document.getElementById(id + '-table');
      var chart = document.getElementById(id + '-chart');
      var showTable = table.hidden;
      table.hidden = !showTable;
      chart.hidden = showTable;
      b.setAttribute('aria-pressed', showTable ? 'true' : 'false');
      b.innerHTML = icon(showTable ? 'chart' : 'table') + '<span>' + (showTable ? 'Show chart' : 'Show table') + '</span>';
    });
  }

  // ---------------------------------------------------------------- AI Assist drawer
  var aiContext = {};
  function setAiContext(ctx) { aiContext = ctx || {}; }

  function initAi() {
    var openBtn = document.getElementById('ai-open');
    if (!openBtn) return;
    var feats = O.db.config.ai.features;
    var drawer = document.createElement('aside');
    drawer.id = 'ai-drawer';
    drawer.className = 'drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-labelledby', 'ai-title');
    drawer.hidden = true;
    var okrOptions = function (levels) {
      return O.cycleOkrs().filter(function (o) { return levels.indexOf(o.level) >= 0; }).map(function (o) {
        return { value: o.id, label: o.code + ' – ' + (o.title.length > 60 ? o.title.slice(0, 60) + '…' : o.title) };
      });
    };
    var featureList = [
      { key: 'draftObjective', label: 'Draft an objective' },
      { key: 'suggestKeyResults', label: 'Suggest key results' },
      { key: 'summariseCheckIns', label: 'Summarise check-ins' },
    ].filter(function (f) { return feats[f.key]; });

    drawer.innerHTML =
      '<div class="drawer-head"><h2 id="ai-title">' + icon('ai') + ' AI Assist</h2><button type="button" class="btn btn-icon" id="ai-close" aria-label="Close AI Assist">' + icon('close') + '</button></div>' +
      '<p class="msg msg-info small">Demo: suggestions are pre-written examples. No data leaves your browser and nothing is saved until you choose to use a suggestion.</p>' +
      (featureList.length ? '<form id="ai-form" class="stack">' +
        '<label class="field"><span class="field-label">What do you need?</span><select id="ai-feature">' + selectOptions(featureList.map(function (f) { return { value: f.key, label: f.label }; })) + '</select></label>' +
        '<label class="field" data-ai-for="draftObjective"><span class="field-label">Topic or rough idea (optional)</span><input id="ai-topic" type="text" placeholder="e.g. faster fault restoration"></label>' +
        '<label class="field" data-ai-for="suggestKeyResults"><span class="field-label">Objective</span><select id="ai-objective">' + selectOptions(okrOptions(['Objective'])) + '</select></label>' +
        '<label class="field" data-ai-for="summariseCheckIns"><span class="field-label">Item</span><select id="ai-item">' + selectOptions(okrOptions(['Objective', 'KeyResult', 'Initiative', 'ActionItem'])) + '</select></label>' +
        '<button type="submit" class="btn btn-primary">' + icon('ai') + '<span>Generate</span></button></form>' +
        '<div id="ai-results" class="stack" aria-live="polite"></div>'
        : '<p class="empty">All AI Assist features are turned off in Administration.</p>');
    document.body.appendChild(drawer);

    var featureSel = drawer.querySelector('#ai-feature');
    function syncFields() {
      if (!featureSel) return;
      drawer.querySelectorAll('[data-ai-for]').forEach(function (el) { el.hidden = el.getAttribute('data-ai-for') !== featureSel.value; });
    }
    function open() {
      if (featureSel && aiContext.feature && feats[aiContext.feature]) featureSel.value = aiContext.feature;
      if (aiContext.okrId) {
        var o = O.okr(aiContext.okrId);
        var objSel = drawer.querySelector('#ai-objective');
        var itemSel = drawer.querySelector('#ai-item');
        if (o && objSel && o.level === 'Objective') objSel.value = o.id;
        if (o && itemSel && o.level !== 'Goal') itemSel.value = o.id;
      }
      syncFields();
      drawer.hidden = false;
      openBtn.setAttribute('aria-expanded', 'true');
      drawer.querySelector('#ai-close').focus();
    }
    function close() {
      drawer.hidden = true;
      openBtn.setAttribute('aria-expanded', 'false');
      openBtn.focus();
    }
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.addEventListener('click', function () { if (drawer.hidden) open(); else close(); });
    drawer.querySelector('#ai-close').addEventListener('click', close);
    drawer.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    if (featureSel) featureSel.addEventListener('change', syncFields);
    syncFields();

    var form = drawer.querySelector('#ai-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var feature = featureSel.value;
      var ctx = {
        topic: drawer.querySelector('#ai-topic').value,
        okrId: feature === 'suggestKeyResults' ? drawer.querySelector('#ai-objective').value : drawer.querySelector('#ai-item').value,
      };
      var out = drawer.querySelector('#ai-results');
      out.innerHTML = '<p class="muted"><span class="spinner" aria-hidden="true"></span> Thinking…</p>';
      O.aiSuggest(feature, ctx).then(function (list) {
        out.innerHTML = '<h3 class="section-title">Suggestions</h3>' + list.map(function (s, i) {
          var action = '';
          var f = s.fields || {};
          if (feature === 'draftObjective' && O.can.create('Objective')) {
            action = '<a class="btn btn-sm" href="okr-edit.html?level=Objective&title=' + encodeURIComponent(f.title) + '&description=' + encodeURIComponent(f.description) + '">Use in a new objective</a>';
          } else if (feature === 'suggestKeyResults' && O.can.create('KeyResult')) {
            action = '<a class="btn btn-sm" href="okr-edit.html?level=KeyResult&parent=' + encodeURIComponent(ctx.okrId) + '&title=' + encodeURIComponent(f.title) +
              '&measurementType=' + encodeURIComponent(f.measurementType) + '&baseline=' + f.baseline + '&target=' + f.target + '&unit=' + encodeURIComponent(f.unit) + '">Create this key result</a>';
          }
          return '<article class="ai-card"><h4>' + esc(s.title) + '</h4><p>' + esc(f.description || s.body) + '</p>' + (f.description ? '<p class="small muted">' + esc(s.body) + '</p>' : '') +
            '<div class="row">' + action + '<button type="button" class="btn btn-sm btn-subtle" data-copy="' + i + '">Copy text</button></div></article>';
        }).join('');
        out.querySelectorAll('[data-copy]').forEach(function (b) {
          b.addEventListener('click', function () {
            var s = list[Number(b.getAttribute('data-copy'))];
            var text = s.title + '\n' + ((s.fields && s.fields.description) || s.body);
            var done = function () { toast('Copied to clipboard', 'success'); };
            if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { toast('Copy is not available here', 'error'); });
            else toast('Copy is not available here', 'error', 'Select the text and press Ctrl+C instead.');
          });
        });
      });
    });
  }

  window.OKR.ui = {
    icon: icon, statusBadge: statusBadge, levelChip: levelChip, approvalChip: approvalChip, decisionChip: decisionChip,
    progress: progress, avatar: avatar, person: person, flagChips: flagChips, okrLink: okrLink, kpi: kpi, breadcrumb: breadcrumb,
    pageHeader: pageHeader, empty: empty, selectOptions: selectOptions,
    chartCard: chartCard, simpleTable: simpleTable, statusDonut: statusDonut, statusTable: statusTable, hbars: hbars, vbars: vbars, progressLine: progressLine,
    toast: toast, flash: flash, dialog: dialog, tabs: tabs, shell: shell, setAiContext: setAiContext, refreshNav: refreshNav,
  };
})();
