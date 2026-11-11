/* OKR Management System demo - data store, business rules and helpers.
 * Plain browser JavaScript, no build step. Everything hangs off window.OKR.
 * Data lives in localStorage so changes survive moving between pages; "Reset demo data"
 * (Administration, or the footer link) restores the original sample data.
 */
(function () {
  'use strict';

  var SEED = window.OKR_SEED;
  var DB_KEY = 'okrDemo.db.v1';
  var PREF_KEY = 'okrDemo.prefs.v1';
  var DAY = 86400000;

  // ---------------------------------------------------------------- storage
  var storage = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function loadDb() {
    var raw = storage.get(DB_KEY);
    if (raw) {
      try {
        var saved = JSON.parse(raw);
        if (saved && saved.version === 1 && Array.isArray(saved.okrs)) return saved;
      } catch (e) { /* fall through to seed */ }
    }
    var fresh = clone(SEED);
    fresh.version = 1;
    fresh.tick = 0;
    return fresh;
  }

  var db = loadDb();
  var asOf = new Date(db.config.asOfDate);

  function save() {
    recalcAll(db.okrs);
    storage.set(DB_KEY, JSON.stringify(db));
  }
  function resetDemo() {
    storage.remove(DB_KEY);
    storage.remove(PREF_KEY);
  }
  /** Demo clock: new records are stamped just after the fixed "as of" date, one minute apart. */
  function now() {
    db.tick = (db.tick || 0) + 1;
    return new Date(asOf.getTime() + db.tick * 60000).toISOString();
  }
  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------------------------------------------------------------- reference lists
  var ROLES = ['Executive', 'VDO', 'DepartmentCoordinator', 'OkrChampion', 'PlatformAdmin'];
  var ROLE_LABELS = {
    Executive: 'Executive',
    VDO: 'VDO',
    DepartmentCoordinator: 'Department Coordinator',
    OkrChampion: 'OKR Champion',
    PlatformAdmin: 'Platform Administrator',
  };
  var PERSONAS = { Executive: 'u01', VDO: 'u03', DepartmentCoordinator: 'u07', OkrChampion: 'u11', PlatformAdmin: 'u13' };

  var LEVELS = ['Goal', 'Objective', 'KeyResult', 'Initiative', 'ActionItem'];
  var LEVEL_LABELS = { Goal: 'Goal', Objective: 'Objective', KeyResult: 'Key Result', Initiative: 'Initiative', ActionItem: 'Action Item' };
  var LEVEL_SHORT = { Goal: 'G', Objective: 'O', KeyResult: 'KR', Initiative: 'INI', ActionItem: 'ACT' };

  var STATUSES = ['OnTrack', 'AtRisk', 'OffTrack', 'Completed', 'NotStarted'];
  // Colour-blind-checked status palette; every badge also carries a shape and a text label.
  var STATUS = {
    OnTrack: { label: 'On track', color: '#228B4E', ink: '#17663A', bg: '#E6F4EC', glyph: '●' },
    AtRisk: { label: 'At risk', color: '#D29200', ink: '#7A5500', bg: '#FDF3DC', glyph: '▲' },
    OffTrack: { label: 'Off track', color: '#C4262E', ink: '#A51F26', bg: '#FBE8E9', glyph: '◆' },
    Completed: { label: 'Completed', color: '#0F6CBD', ink: '#0B5394', bg: '#E5F0FA', glyph: '✔' },
    NotStarted: { label: 'Not started', color: '#8A8886', ink: '#5C5B5A', bg: '#F1F1F0', glyph: '○' },
  };

  var MEASUREMENT_TYPES = ['RolledUp', 'Numeric', 'Percentage', 'Currency', 'Milestone'];
  var MEASUREMENT_LABELS = {
    RolledUp: 'Rolled up from children',
    Numeric: 'Number',
    Percentage: 'Percentage',
    Currency: 'Currency (AED)',
    Milestone: 'Milestones',
  };
  var APPROVAL_STATES = { Draft: 'Draft', PendingApproval: 'Pending approval', Approved: 'Approved', Rejected: 'Rejected' };
  var REQUEST_TYPES = { Create: 'New item', TargetChange: 'Target change', WeightChange: 'Weight change', Closure: 'Closure' };
  var REQUIRABLE_FIELDS = { description: 'Description', dueDate: 'Due date', baseline: 'Baseline', target: 'Target', unit: 'Unit', team: 'Team' };
  var PERIODS = ['FY', 'Q1', 'Q2', 'Q3', 'Q4'];

  // ---------------------------------------------------------------- preferences (role, period)
  var prefs = { role: 'Executive', period: 'FY' };
  try { Object.assign(prefs, JSON.parse(storage.get(PREF_KEY) || '{}')); } catch (e) { /* defaults */ }
  // Deep link to a persona, e.g. checkin.html?as=OkrChampion
  var asParam = new URLSearchParams(window.location.search).get('as');
  if (asParam && ROLES.indexOf(asParam) >= 0) {
    prefs.role = asParam;
    storage.set(PREF_KEY, JSON.stringify(prefs));
  }
  if (ROLES.indexOf(prefs.role) < 0) prefs.role = 'Executive';
  if (PERIODS.indexOf(prefs.period) < 0) prefs.period = 'FY';
  function setPref(key, value) {
    prefs[key] = value;
    storage.set(PREF_KEY, JSON.stringify(prefs));
  }

  // ---------------------------------------------------------------- lookups
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function user(id) { return id ? byId(db.users, id) : null; }
  function dept(id) { return id ? byId(db.departments, id) : null; }
  function team(id) { return id ? byId(db.teams, id) : null; }
  function okr(id) { return id ? byId(db.okrs, id) : null; }
  function currentUser() { return user(PERSONAS[prefs.role]); }
  function currentCycle() {
    return db.cycles.filter(function (c) { return c.isCurrent; })[0] || db.cycles[0];
  }
  function childIndex(list) {
    var idx = {};
    list.forEach(function (o) {
      if (!o.parentId) return;
      (idx[o.parentId] = idx[o.parentId] || []).push(o);
    });
    return idx;
  }
  function children(id) {
    return db.okrs.filter(function (o) { return o.parentId === id; });
  }
  function ancestors(o) {
    var out = [];
    var p = o && okr(o.parentId);
    while (p) { out.unshift(p); p = okr(p.parentId); }
    return out;
  }
  function descendants(id) {
    var out = [];
    children(id).forEach(function (c) { out.push(c); out = out.concat(descendants(c.id)); });
    return out;
  }
  function levelConfig(level) {
    return db.config.levels.filter(function (l) { return l.level === level; })[0];
  }
  function parentLevel(level) {
    var i = LEVELS.indexOf(level);
    return i > 0 ? LEVELS[i - 1] : null;
  }
  function childLevel(level) {
    var i = LEVELS.indexOf(level);
    return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
  }
  function levelOrder(a, b) {
    return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.code.localeCompare(b.code, 'en', { numeric: true });
  }

  // ---------------------------------------------------------------- roll-up and status rules
  function d(s) { return new Date(s.length === 10 ? s + 'T00:00:00Z' : s); }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function endOf(dateStr) { return d(dateStr).getTime() + DAY; }

  /** Progress of a measured (leaf) item: how far current has moved from baseline towards target. */
  function measuredProgress(o) {
    if (o.measurementType === 'RolledUp') return o.progress || 0;
    var b = Number(o.baseline) || 0;
    var t = Number(o.target) || 0;
    var c = Number(o.current) || 0;
    if (o.measurementType === 'Milestone') return clamp(t ? (c / t) * 100 : 0);
    if (t === b) return c === t ? 100 : 0;
    return clamp(((c - b) / (t - b)) * 100); // works for decreasing targets too
  }
  /** Linear expectation: share of the item's time window that has elapsed. */
  function expectedProgress(o, at) {
    var s = d(o.startDate).getTime();
    var e = endOf(o.dueDate);
    if (e <= s) return 100;
    return clamp((((at || asOf).getTime()) - s) / (e - s) * 100);
  }
  function isOverdue(o) { return o.progress < 100 && asOf.getTime() > endOf(o.dueDate); }
  function suggestStatus(progress, o) {
    if (progress >= 100) return 'Completed';
    if (asOf < d(o.startDate)) return 'NotStarted';
    if (asOf.getTime() > endOf(o.dueDate)) return 'OffTrack';
    var gap = expectedProgress(o) - progress;
    if (gap <= 10) return 'OnTrack';
    if (gap <= 25) return 'AtRisk';
    return 'OffTrack';
  }
  function deriveStatus(o) {
    if (o.progress >= 100) return 'Completed';
    if (asOf < d(o.startDate)) return 'NotStarted';
    if (isOverdue(o)) return 'OffTrack';
    if (o.reportedStatus && o.reportedStatus !== 'Completed') return o.reportedStatus;
    return suggestStatus(o.progress, o);
  }
  function countsInRollup(o) { return o.approvalState !== 'Rejected'; }

  /** Recalculate progress and status for every item, children first (weighted average up the tree). */
  function recalcAll(list) {
    var kids = childIndex(list);
    var done = {};
    function calc(o) {
      if (done[o.id]) return;
      done[o.id] = true;
      var ch = (kids[o.id] || []).filter(countsInRollup);
      ch.forEach(calc);
      if (o.measurementType === 'RolledUp') {
        var w = ch.reduce(function (s, c) { return s + (Number(c.weight) || 0); }, 0);
        o.progress = ch.length && w ? round1(ch.reduce(function (s, c) { return s + c.progress * (Number(c.weight) || 0); }, 0) / w) : 0;
        o.current = o.progress;
      } else {
        o.progress = round1(measuredProgress(o));
      }
      o.status = deriveStatus(o);
    }
    list.forEach(calc);
    return list;
  }

  /** Share of the parent's progress that one child carries (its weight / sum of sibling weights). */
  function weightShare(o) {
    if (!o.parentId) return null;
    var sibs = children(o.parentId).filter(countsInRollup);
    var w = sibs.reduce(function (s, c) { return s + (Number(c.weight) || 0); }, 0);
    return w ? (Number(o.weight) || 0) / w * 100 : 0;
  }

  function daysSince(iso) { return iso ? Math.floor((asOf.getTime() - d(iso).getTime()) / DAY) : null; }
  function isStale(o) {
    if (o.measurementType === 'RolledUp' || o.status === 'Completed' || o.status === 'NotStarted') return false;
    var days = daysSince(o.lastCheckInOn);
    return days === null || days > db.config.reminders.staleAfterDays;
  }
  function isDueSoon(o) {
    if (o.status === 'Completed' || isOverdue(o)) return false;
    var left = (endOf(o.dueDate) - asOf.getTime()) / DAY;
    return left >= 0 && left <= db.config.reminders.dueSoonDays;
  }
  function flags(o) {
    var f = [];
    if (isOverdue(o)) f.push('Overdue');
    if (isStale(o)) f.push('Stale');
    if (isDueSoon(o)) f.push('Due soon');
    if (o.approvalState === 'PendingApproval') f.push('Pending approval');
    if (o.approvalState === 'Draft') f.push('Draft');
    if (o.approvalState === 'Rejected') f.push('Rejected');
    return f;
  }

  /** What would happen to the item and its ancestors if a check-in were saved (nothing is written). */
  function previewRollup(okrId, value, status) {
    var copy = clone(db.okrs);
    var target = byId(copy, okrId);
    if (!target) return [];
    if (target.measurementType !== 'RolledUp') target.current = value;
    target.reportedStatus = status || null;
    recalcAll(copy);
    var rows = [];
    var cur = target;
    while (cur) {
      var before = okr(cur.id);
      rows.push({ id: cur.id, code: cur.code, title: cur.title, level: cur.level, before: before.progress, after: cur.progress, statusBefore: before.status, statusAfter: cur.status });
      cur = byId(copy, cur.parentId);
    }
    return rows;
  }

  // ---------------------------------------------------------------- cycle / period filter
  function periodRange(p) {
    var c = currentCycle();
    var y = d(c.startDate).getUTCFullYear();
    if (!p || p === 'FY') return [d(c.startDate).getTime(), endOf(c.endDate)];
    var q = Number(p.slice(1));
    return [Date.UTC(y, 3 * (q - 1), 1), Date.UTC(y, 3 * q, 1)];
  }
  function inPeriod(o, p) {
    var r = periodRange(p || prefs.period);
    return d(o.startDate).getTime() < r[1] && endOf(o.dueDate) > r[0];
  }
  function periodLabel(p) {
    var c = currentCycle();
    p = p || prefs.period;
    return p === 'FY' ? c.name + ' (full year)' : c.name + ' ' + p;
  }
  /** Items of the current cycle that overlap the selected period. */
  function cycleOkrs() {
    var c = currentCycle();
    return db.okrs.filter(function (o) { return o.cycleId === c.id && inPeriod(o); }).sort(levelOrder);
  }

  // ---------------------------------------------------------------- permissions (UI only; a real system enforces these server-side)
  var NAV_BY_ROLE = {
    Executive: ['home', 'explorer', 'approvals', 'reports', 'notifications'],
    VDO: ['home', 'explorer', 'approvals', 'reports', 'notifications'],
    DepartmentCoordinator: ['home', 'explorer', 'checkin', 'approvals', 'reports', 'notifications'],
    OkrChampion: ['home', 'explorer', 'checkin', 'approvals', 'notifications'],
    PlatformAdmin: ['home', 'explorer', 'reports', 'notifications', 'admin'],
  };
  var CREATE_RULES = {
    Goal: ['Executive', 'VDO'],
    Objective: ['Executive', 'VDO', 'DepartmentCoordinator'],
    KeyResult: ['VDO', 'DepartmentCoordinator', 'OkrChampion'],
    Initiative: ['DepartmentCoordinator', 'OkrChampion'],
    ActionItem: ['DepartmentCoordinator', 'OkrChampion'],
  };
  var can = {
    nav: function (key, role) { return NAV_BY_ROLE[role || prefs.role].indexOf(key) >= 0; },
    createLevels: function (role) {
      role = role || prefs.role;
      return LEVELS.filter(function (l) { return CREATE_RULES[l].indexOf(role) >= 0; });
    },
    create: function (level) { return level ? CREATE_RULES[level].indexOf(prefs.role) >= 0 : can.createLevels().length > 0; },
    edit: function (o) {
      var u = currentUser();
      if (u.role === 'PlatformAdmin') return false;
      if (o.ownerId === u.id) return true;
      if (u.role === 'Executive' || u.role === 'VDO') return true;
      if (u.role === 'DepartmentCoordinator') return u.departmentId === o.departmentId;
      return false;
    },
    checkIn: function (o) {
      var u = currentUser();
      if (u.role === 'PlatformAdmin') return false;
      if (o.ownerId === u.id) return true;
      return (u.role === 'DepartmentCoordinator' || u.role === 'OkrChampion') && u.departmentId === o.departmentId;
    },
    decide: function (a) {
      var u = currentUser();
      if (a.decision !== 'Pending' || a.requestedById === u.id || u.role !== a.approverRole) return false;
      return u.role !== 'DepartmentCoordinator' || u.departmentId === a.departmentId;
    },
  };

  // ---------------------------------------------------------------- formatting
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
  var dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
  var shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
  function fmtDate(s) { return s ? dateFmt.format(d(s.length === 10 ? s + 'T12:00:00Z' : s)) : '–'; }
  function fmtDateTime(s) { return s ? dateTimeFmt.format(d(s)) : '–'; }
  function fmtShort(s) { return s ? shortFmt.format(d(s.length === 10 ? s + 'T12:00:00Z' : s)) : '–'; }
  function fmtRelative(s) {
    if (!s) return 'never';
    var days = daysSince(s);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    if (days < 60) { var w = Math.round(days / 7); return w === 1 ? '1 week ago' : w + ' weeks ago'; }
    var m = Math.round(days / 30);
    return m === 1 ? '1 month ago' : m + ' months ago';
  }
  function fmtNumber(v) {
    return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function fmtValue(o, v) {
    if (v === null || v === undefined || v === '') return '–';
    v = Number(v);
    if (o.measurementType === 'Currency') {
      if (Math.abs(v) >= 1e6) return 'AED ' + fmtNumber(Math.round(v / 1e5) / 10) + 'M';
      if (Math.abs(v) >= 1e3) return 'AED ' + fmtNumber(Math.round(v / 100) / 10) + 'K';
      return 'AED ' + fmtNumber(v);
    }
    if (o.measurementType === 'RolledUp' || o.unit === '%') return fmtNumber(Math.round(v * 10) / 10) + '%';
    return fmtNumber(v) + (o.unit ? ' ' + o.unit : '');
  }
  function pct(v) { return Math.round(v) + '%'; }

  // ---------------------------------------------------------------- statistics
  function avg(list, fn) {
    if (!list.length) return 0;
    return list.reduce(function (s, x) { return s + fn(x); }, 0) / list.length;
  }
  function countByStatus(list) {
    var out = {};
    STATUSES.forEach(function (s) { out[s] = 0; });
    list.forEach(function (o) { out[o.status] = (out[o.status] || 0) + 1; });
    return out;
  }
  /** Average progress of each department's key results. */
  function progressByDepartment(list) {
    return db.departments.map(function (dp) {
      var krs = list.filter(function (o) { return o.level === 'KeyResult' && o.departmentId === dp.id; });
      return { id: dp.id, label: dp.name, code: dp.code, value: avg(krs, function (o) { return o.progress; }), count: krs.length };
    });
  }
  /** Check-ins per ISO week for the last n weeks before the as-of date. */
  function checkInsPerWeek(weeks) {
    var out = [];
    var end = asOf.getTime();
    for (var i = weeks - 1; i >= 0; i--) {
      var to = end - i * 7 * DAY;
      var from = to - 7 * DAY;
      var n = db.checkins.filter(function (c) { var t = d(c.date).getTime(); return t > from && t <= to; }).length;
      out.push({ label: fmtShort(new Date(from + DAY).toISOString()), value: n });
    }
    return out;
  }
  function checkInsFor(okrId) {
    return db.checkins.filter(function (c) { return c.okrId === okrId; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  // ---------------------------------------------------------------- mutations (each one is audited)
  function audit(action, entityType, entityId, entityName, details, departmentId) {
    db.audit.unshift({
      id: uid('ae'), timestamp: now(), actorId: currentUser().id, action: action, entityType: entityType,
      entityId: entityId, entityName: entityName, details: details, departmentId: departmentId || null,
    });
  }
  function notify(recipientId, type, title, message, okrId) {
    if (!recipientId) return;
    db.notifications.unshift({ id: uid('nt'), recipientId: recipientId, type: type, title: title, message: message, okrId: okrId || null, createdOn: now(), read: false });
  }
  function okrName(o) { return o.code + ' ' + o.title; }
  function coordinatorOf(departmentId) {
    return db.users.filter(function (u) { return u.role === 'DepartmentCoordinator' && u.departmentId === departmentId; })[0];
  }
  function approverFor(role, departmentId) {
    return db.users.filter(function (u) { return u.role === role && (role !== 'DepartmentCoordinator' || u.departmentId === departmentId); })[0];
  }

  function addCheckIn(input) {
    var o = okr(input.okrId);
    var me = currentUser();
    var ts = now();
    if (o.measurementType !== 'RolledUp') o.current = Number(input.value);
    o.reportedStatus = input.status || null;
    o.lastCheckInOn = ts;
    o.modifiedOn = ts;
    recalcAll(db.okrs);
    var ci = {
      id: uid('ci'), okrId: o.id, date: ts, value: o.measurementType === 'RolledUp' ? o.progress : Number(input.value),
      progress: o.progress, status: o.status, narrative: input.narrative, authorId: me.id, confidence: input.confidence,
    };
    db.checkins.push(ci);
    audit('CheckIn', 'dtp_checkin', ci.id, okrName(o), 'Check-in recorded: value ' + fmtValue(o, ci.value) + ', progress ' + pct(o.progress) + ', status ' + STATUS[o.status].label + '.', o.departmentId);
    var parent = okr(o.parentId);
    if (parent && parent.ownerId !== me.id) {
      notify(parent.ownerId, 'CheckIn', 'New check-in on ' + o.code, me.displayName + ' updated ' + o.code + ' to ' + pct(o.progress) + ' (' + STATUS[o.status].label + ').', o.id);
    }
    save();
    return ci;
  }

  function addComment(okrId, text) {
    var o = okr(okrId);
    var me = currentUser();
    var c = { id: uid('cm'), okrId: okrId, authorId: me.id, text: text, createdOn: now() };
    db.comments.push(c);
    audit('Commented', 'dtp_comment', c.id, okrName(o), 'Comment added.', o.departmentId);
    if (o.ownerId !== me.id) notify(o.ownerId, 'Comment', 'New comment on ' + o.code, me.displayName + ': “' + (text.length > 80 ? text.slice(0, 80) + '…' : text) + '”', o.id);
    save();
    return c;
  }

  function nextCode(level, parent) {
    var siblings = db.okrs.filter(function (o) { return o.level === level; });
    if (level === 'Goal') return 'G' + (siblings.length + 1);
    if (level === 'Initiative' || level === 'ActionItem') {
      var max = siblings.reduce(function (m, o) { var n = Number(o.code.split('-')[1]) || 0; return Math.max(m, n); }, 0);
      return LEVEL_SHORT[level] + '-' + String(max + 1).padStart(2, '0');
    }
    var base = parent ? parent.code.replace(/^[A-Z]+/, '') : '';
    var n = db.okrs.filter(function (o) { return o.parentId === (parent && parent.id); }).length + 1;
    return LEVEL_SHORT[level] + (base ? base + '.' : '') + n;
  }

  function submitForApproval(o, requestType, summary, proposed) {
    var me = currentUser();
    var cfg = levelConfig(o.level);
    var a = {
      id: uid('ap'), okrId: o.id, requestType: requestType, summary: summary, requestedById: me.id, requestedOn: now(),
      approverRole: cfg.approverRole, departmentId: o.departmentId, decision: 'Pending', decidedById: null, decidedOn: null,
      comment: '', proposed: proposed || null,
    };
    db.approvals.unshift(a);
    if (requestType === 'Create') o.approvalState = 'PendingApproval';
    audit('Submitted', 'dtp_approval', a.id, okrName(o), REQUEST_TYPES[requestType] + ' submitted for approval by ' + ROLE_LABELS[cfg.approverRole] + '.', o.departmentId);
    var approver = approverFor(cfg.approverRole, o.departmentId);
    if (approver) notify(approver.id, 'Approval', 'Approval needed: ' + REQUEST_TYPES[requestType].toLowerCase() + ' for ' + o.code, me.displayName + ' submitted a request: ' + summary, o.id);
    return a;
  }

  function createOkr(fields, submit) {
    var me = currentUser();
    var parent = okr(fields.parentId);
    var ts = now();
    var cfg = levelConfig(fields.level);
    var o = Object.assign({
      id: uid('okr'), code: nextCode(fields.level, parent), cycleId: currentCycle().id, current: fields.baseline || 0,
      progress: 0, status: 'NotStarted', reportedStatus: null, visibility: 'Public', lastCheckInOn: null, createdOn: ts, modifiedOn: ts,
      approvalState: cfg.approvalRequired ? 'Draft' : 'Approved',
    }, fields);
    db.okrs.push(o);
    audit('Created', 'dtp_okr', o.id, okrName(o), LEVEL_LABELS[o.level] + ' created' + (o.approvalState === 'Draft' ? ' as draft' : '') + '.', o.departmentId);
    if (o.ownerId !== me.id) notify(o.ownerId, 'Assignment', 'You own a new ' + LEVEL_LABELS[o.level].toLowerCase() + ': ' + o.code, me.displayName + ' assigned “' + o.title + '” to you.', o.id);
    if (submit && cfg.approvalRequired) submitForApproval(o, 'Create', 'New ' + LEVEL_LABELS[o.level].toLowerCase() + ': ' + o.title);
    save();
    return o;
  }

  /** Apply an edit. Target and weight changes on approved items that need approval become requests instead. */
  function updateOkr(id, fields) {
    var o = okr(id);
    var cfg = levelConfig(o.level);
    var gated = cfg.approvalRequired && o.approvalState === 'Approved';
    var requests = [];
    if (gated && fields.target !== undefined && Number(fields.target) !== Number(o.target)) {
      requests.push(submitForApproval(o, 'TargetChange', 'Change target of ' + o.code + ' from ' + fmtValue(o, o.target) + ' to ' + fmtValue(o, fields.target) + '.', { target: Number(fields.target) }));
      delete fields.target;
    }
    if (gated && fields.weight !== undefined && Number(fields.weight) !== Number(o.weight)) {
      requests.push(submitForApproval(o, 'WeightChange', 'Change weight of ' + o.code + ' from ' + o.weight + ' to ' + fields.weight + '.', { weight: Number(fields.weight) }));
      delete fields.weight;
    }
    var changed = Object.keys(fields).filter(function (k) { return String(fields[k]) !== String(o[k]); });
    changed.forEach(function (k) { o[k] = fields[k]; });
    if (changed.length) {
      o.modifiedOn = now();
      audit('Updated', 'dtp_okr', o.id, okrName(o), 'Changed: ' + changed.join(', ') + '.', o.departmentId);
    }
    save();
    return { changed: changed, requests: requests };
  }

  function requestApproval(okrId, requestType, summary, proposed) {
    var a = submitForApproval(okr(okrId), requestType, summary, proposed);
    save();
    return a;
  }

  function decide(approvalId, decision, comment) {
    var a = byId(db.approvals, approvalId);
    var o = okr(a.okrId);
    var me = currentUser();
    a.decision = decision;
    a.decidedById = me.id;
    a.decidedOn = now();
    a.comment = comment || '';
    if (o) {
      if (a.requestType === 'Create') o.approvalState = decision === 'Approved' ? 'Approved' : 'Rejected';
      if (decision === 'Approved' && a.proposed) Object.keys(a.proposed).forEach(function (k) { o[k] = a.proposed[k]; });
      if (decision === 'Approved' && a.requestType === 'Closure') { o.reportedStatus = 'Completed'; if (o.measurementType !== 'RolledUp') o.current = o.target; }
      o.modifiedOn = a.decidedOn;
    }
    audit(decision, 'dtp_approval', a.id, o ? okrName(o) : a.okrId, REQUEST_TYPES[a.requestType] + ' ' + decision.toLowerCase() + (comment ? ': ' + comment : '.'), a.departmentId);
    notify(a.requestedById, 'Decision', 'Request ' + decision.toLowerCase() + (o ? ': ' + o.code : ''), me.displayName + ' ' + decision.toLowerCase() + ' your ' + REQUEST_TYPES[a.requestType].toLowerCase() + ' request.' + (comment ? ' “' + comment + '”' : ''), a.okrId);
    save();
    return a;
  }

  function myNotifications() {
    var me = currentUser();
    return db.notifications.filter(function (n) { return n.recipientId === me.id; }).sort(function (a, b) { return a.createdOn < b.createdOn ? 1 : -1; });
  }
  function unreadCount() { return myNotifications().filter(function (n) { return !n.read; }).length; }
  function markRead(id, read) {
    var n = byId(db.notifications, id);
    if (n) n.read = read !== false;
    save();
  }
  function markAllRead() {
    myNotifications().forEach(function (n) { n.read = true; });
    save();
  }
  function pendingForMe() { return db.approvals.filter(can.decide); }

  // Administration
  function updateLevel(levelId, patch) {
    var l = byId(db.config.levels, levelId);
    Object.assign(l, patch);
    audit('ConfigChanged', 'dtp_levelconfig', l.id, l.displayName, 'Level settings updated: ' + Object.keys(patch).join(', ') + '.', null);
    save();
  }
  function updateReminders(patch) {
    Object.assign(db.config.reminders, patch);
    audit('ConfigChanged', 'dtp_reminderpolicy', 'reminders', 'Reminder policy', 'Reminder policy updated.', null);
    save();
  }
  function updateAi(patch) {
    if (patch.enabled !== undefined) db.config.ai.enabled = patch.enabled;
    if (patch.features) Object.assign(db.config.ai.features, patch.features);
    audit('ConfigChanged', 'dtp_aisetting', 'ai', 'AI Assist settings', 'AI Assist settings updated.', null);
    save();
  }
  function addRoleAssignment(userId, role, departmentId) {
    var u = user(userId);
    var ra = { id: uid('ra'), userId: userId, role: role, departmentId: departmentId || null, scopedAdmin: role === 'PlatformAdmin' && !!departmentId };
    db.roleAssignments.push(ra);
    audit('RoleAssigned', 'dtp_roleassignment', ra.id, u.displayName, ROLE_LABELS[role] + ' role assigned' + (departmentId ? ' for ' + dept(departmentId).name : '') + '.', departmentId);
    save();
    return ra;
  }
  function removeRoleAssignment(id) {
    var ra = byId(db.roleAssignments, id);
    db.roleAssignments = db.roleAssignments.filter(function (r) { return r.id !== id; });
    audit('RoleAssigned', 'dtp_roleassignment', id, user(ra.userId).displayName, ROLE_LABELS[ra.role] + ' role removed.', ra.departmentId);
    save();
  }
  function createApiCredential(name, scopes) {
    var me = currentUser();
    var hex = function (n) { var s = ''; for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; };
    var ts = now();
    var cred = {
      id: uid('api'), name: name, clientId: hex(8) + '-' + hex(4) + '-4' + hex(3) + '-a' + hex(3) + '-' + hex(12), scopes: scopes,
      createdOn: ts, createdById: me.id, expiresOn: new Date(d(ts).getTime() + 365 * DAY).toISOString(), lastUsedOn: null, status: 'Active',
    };
    db.apiCredentials.push(cred);
    audit('ApiKeyCreated', 'dtp_apicredential', cred.id, name, 'API credential created with scopes ' + scopes.join(', ') + '.', null);
    save();
    return { credential: cred, secret: 'demo_' + hex(40) };
  }
  function revokeApiCredential(id) {
    var c = byId(db.apiCredentials, id);
    c.status = 'Revoked';
    audit('ConfigChanged', 'dtp_apicredential', id, c.name, 'API credential revoked.', null);
    save();
  }
  function logExport(what) {
    audit('Exported', 'report', what, what, what + ' exported to CSV.', null);
    save();
  }

  // ---------------------------------------------------------------- AI Assist (canned suggestions; no model is called)
  function aiSuggest(feature, ctx) {
    ctx = ctx || {};
    var out = [];
    if (feature === 'draftObjective') {
      var topic = (ctx.topic || '').trim();
      out = [
        topic
          ? { title: 'Achieve a measurable improvement in ' + topic.toLowerCase() + ' by year end', body: 'Your topic rewritten as an outcome that a key result can measure.', fields: { title: 'Achieve a measurable improvement in ' + topic.toLowerCase() + ' by year end', description: 'Define the baseline for ' + topic.toLowerCase() + ', agree a target with the owning department and track it through monthly check-ins.' } }
          : { title: 'Improve first-time-right maintenance on critical substations', body: 'Outcome-focused, time-bound wording that a key result can measure.', fields: { title: 'Improve first-time-right maintenance on critical substations', description: 'Reduce repeat visits and unplanned follow-up work so that crews spend more time on planned maintenance.' } },
        { title: 'Reduce the impact of planned outages on customers', body: 'Focuses on customer impact rather than activity volume.', fields: { title: 'Reduce the impact of planned outages on customers', description: 'Coordinate outage windows across departments and use live-line techniques where possible so that planned work causes fewer customer interruptions.' } },
        { title: 'Make condition data the basis for every replacement decision', body: 'Links asset data quality to investment decisions.', fields: { title: 'Make condition data the basis for every replacement decision', description: 'Ensure every asset replacement proposal in the next cycle is backed by an up-to-date health index and risk score.' } },
      ];
    } else if (feature === 'suggestKeyResults') {
      var parent = okr(ctx.okrId);
      var base = parent ? parent.code + ' ' + parent.title : 'this objective';
      out = [
        { title: 'Reduce repeat corrective work orders from 14% to 7%', body: 'Measures the quality of work for ' + base + '.', fields: { title: 'Reduce repeat corrective work orders from 14% to 7%', measurementType: 'Percentage', baseline: 14, target: 7, unit: '%' } },
        { title: 'Complete 95% of planned maintenance within its window', body: 'A leading indicator that can be checked in weekly.', fields: { title: 'Complete 95% of planned maintenance within its window', measurementType: 'Percentage', baseline: 82, target: 95, unit: '%' } },
        { title: 'Cut average outage restoration time from 95 to 60 minutes', body: 'An outcome measure that customers notice.', fields: { title: 'Cut average outage restoration time from 95 to 60 minutes', measurementType: 'Numeric', baseline: 95, target: 60, unit: 'min' } },
      ];
    } else if (feature === 'summariseCheckIns') {
      var o = okr(ctx.okrId);
      var cis = o ? checkInsFor(o.id) : [];
      if (!o || !cis.length) {
        out = [{ title: 'No check-ins to summarise', body: 'This item has no check-ins yet.' }];
      } else {
        var first = cis[0];
        var last = cis[cis.length - 1];
        var delta = Math.round((last.progress - first.progress) * 10) / 10;
        var risky = cis.filter(function (c) { return c.status === 'AtRisk' || c.status === 'OffTrack'; }).length;
        out = [{
          title: 'Summary of ' + cis.length + ' check-ins for ' + o.code,
          body: o.code + ' moved from ' + pct(first.progress) + ' to ' + pct(last.progress) + ' (' + (delta >= 0 ? '+' : '') + delta + ' points) since ' + fmtDate(first.date) + '. ' +
            risky + ' of ' + cis.length + ' check-ins reported At risk or Off track. Latest update: “' + last.narrative + '” ' +
            (last.status === 'OnTrack' || last.status === 'Completed' ? 'Momentum is positive; keep the current cadence.' : 'Recommend agreeing a recovery plan and confirming resources at the next department review.'),
        }];
      }
    }
    return new Promise(function (resolve) { setTimeout(function () { resolve(out); }, 700); });
  }

  // ---------------------------------------------------------------- CSV export
  function toCsv(rows, columns) {
    var cell = function (v) {
      var s = String(v === null || v === undefined ? '' : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var lines = [columns.map(function (c) { return cell(c.label); }).join(',')];
    rows.forEach(function (r) { lines.push(columns.map(function (c) { return cell(c.value(r)); }).join(',')); });
    return lines.join('\r\n');
  }
  function downloadCsv(filename, csv) {
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ---------------------------------------------------------------- misc
  function param(name) { return new URLSearchParams(window.location.search).get(name); }

  window.OKR = {
    db: db, asOf: asOf, prefs: prefs, setPref: setPref, save: save, resetDemo: resetDemo,
    ROLES: ROLES, ROLE_LABELS: ROLE_LABELS, PERSONAS: PERSONAS, LEVELS: LEVELS, LEVEL_LABELS: LEVEL_LABELS,
    STATUSES: STATUSES, STATUS: STATUS, MEASUREMENT_TYPES: MEASUREMENT_TYPES, MEASUREMENT_LABELS: MEASUREMENT_LABELS,
    APPROVAL_STATES: APPROVAL_STATES, REQUEST_TYPES: REQUEST_TYPES, REQUIRABLE_FIELDS: REQUIRABLE_FIELDS, PERIODS: PERIODS,
    user: user, dept: dept, team: team, okr: okr, currentUser: currentUser, currentCycle: currentCycle,
    children: children, childIndex: childIndex, ancestors: ancestors, descendants: descendants, levelConfig: levelConfig,
    parentLevel: parentLevel, childLevel: childLevel, levelOrder: levelOrder,
    measuredProgress: measuredProgress, expectedProgress: expectedProgress, suggestStatus: suggestStatus,
    isOverdue: isOverdue, isStale: isStale, isDueSoon: isDueSoon, flags: flags, weightShare: weightShare,
    daysSince: daysSince, previewRollup: previewRollup, recalcAll: recalcAll,
    inPeriod: inPeriod, periodLabel: periodLabel, cycleOkrs: cycleOkrs, can: can,
    esc: esc, fmtDate: fmtDate, fmtDateTime: fmtDateTime, fmtShort: fmtShort, fmtRelative: fmtRelative, fmtValue: fmtValue, fmtNumber: fmtNumber, pct: pct,
    avg: avg, countByStatus: countByStatus, progressByDepartment: progressByDepartment, checkInsPerWeek: checkInsPerWeek, checkInsFor: checkInsFor,
    addCheckIn: addCheckIn, addComment: addComment, createOkr: createOkr, updateOkr: updateOkr, requestApproval: requestApproval, decide: decide,
    myNotifications: myNotifications, unreadCount: unreadCount, markRead: markRead, markAllRead: markAllRead, pendingForMe: pendingForMe,
    updateLevel: updateLevel, updateReminders: updateReminders, updateAi: updateAi, addRoleAssignment: addRoleAssignment,
    removeRoleAssignment: removeRoleAssignment, createApiCredential: createApiCredential, revokeApiCredential: revokeApiCredential, logExport: logExport,
    aiSuggest: aiSuggest, toCsv: toCsv, downloadCsv: downloadCsv, param: param, coordinatorOf: coordinatorOf,
  };

  recalcAll(db.okrs);
})();
