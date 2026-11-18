/* OKR Management System demo - data store, business rules and helpers.
 * Plain browser JavaScript, no build step. Everything hangs off window.OKR.
 * Data lives in localStorage so changes survive moving between pages; "Reset demo data"
 * (Administration, or the footer link) restores the original sample data.
 * Each mutation below maps to one Dataverse write (plus audit/notification rows) when ported –
 * see docs/POWER-APPS-FEASIBILITY.md.
 */
(function () {
  'use strict';

  var SEED = window.OKR_SEED;
  var DB_VERSION = 2;
  var DB_KEY = 'okrDemo.db.v2';
  var PREF_KEY = 'okrDemo.prefs.v2';
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
        if (saved && saved.version === DB_VERSION && Array.isArray(saved.okrs)) return saved;
      } catch (e) { /* fall through to seed */ }
    }
    var fresh = clone(SEED);
    fresh.version = DB_VERSION;
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
    storage.remove('okrDemo.db.v1');
    storage.remove('okrDemo.prefs.v1');
  }
  /** Demo clock: new records are stamped just after the fixed "as of" date, one minute apart. */
  function now() {
    db.tick = (db.tick || 0) + 1;
    return new Date(asOf.getTime() + db.tick * 60000).toISOString();
  }
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  /** Deterministic pseudo-random number in [0,1) so simulated syncs are repeatable. */
  function rand(seed) { var x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }

  // ---------------------------------------------------------------- reference lists
  var ROLES = ['Executive', 'VDO', 'DepartmentCoordinator', 'OkrChampion', 'Employee', 'PlatformAdmin'];
  var ROLE_LABELS = {
    Executive: 'Executive', VDO: 'VDO', DepartmentCoordinator: 'Department Coordinator', OkrChampion: 'OKR Champion',
    Employee: 'Employee', PlatformAdmin: 'Platform Administrator', Manager: 'Line manager',
  };
  var PERSONAS = { Executive: 'u01', VDO: 'u03', DepartmentCoordinator: 'u07', OkrChampion: 'u11', Employee: 'u15', PlatformAdmin: 'u13' };

  /** The cascade. "Personal" (individual goals) sits outside it and can align to any of these. */
  var LEVELS = ['Goal', 'Objective', 'KeyResult', 'Initiative', 'ActionItem'];
  var ALL_LEVELS = LEVELS.concat(['Personal']);
  var LEVEL_LABELS = { Goal: 'Goal', Objective: 'Objective', KeyResult: 'Key Result', Initiative: 'Initiative', ActionItem: 'Action Item', Personal: 'Individual goal' };
  var LEVEL_SHORT = { Goal: 'G', Objective: 'O', KeyResult: 'KR', Initiative: 'INI', ActionItem: 'ACT', Personal: 'IND' };
  (db.config.levels || []).forEach(function (l) { if (l.displayName) LEVEL_LABELS[l.level] = l.displayName; });

  var STATUSES = ['OnTrack', 'AtRisk', 'OffTrack', 'Completed', 'NotStarted'];
  // Colour-blind-checked status palette; every badge also carries a shape and a text label.
  var STATUS = {
    OnTrack: { label: 'On track', color: '#228B4E', glyph: '●' },
    AtRisk: { label: 'At risk', color: '#D29200', glyph: '▲' },
    OffTrack: { label: 'Off track', color: '#C4262E', glyph: '◆' },
    Completed: { label: 'Completed', color: '#0F6CBD', glyph: '✔' },
    NotStarted: { label: 'Not started', color: '#8A8886', glyph: '○' },
  };
  Object.keys(db.config.statusLabels || {}).forEach(function (k) { if (STATUS[k] && db.config.statusLabels[k]) STATUS[k].label = db.config.statusLabels[k]; });

  var MEASUREMENT_TYPES = ['RolledUp', 'Numeric', 'Percentage', 'Currency', 'Milestone', 'StayAbove', 'StayBelow', 'Binary', 'Tasks'];
  var MEASUREMENT_LABELS = {
    RolledUp: 'Roll up from child goals', Numeric: 'Reach a number', Percentage: 'Reach a percentage', Currency: 'Reach an amount (AED)',
    Milestone: 'Milestones', StayAbove: 'Stay above a threshold', StayBelow: 'Stay below a threshold', Binary: 'Done / not done',
    Tasks: 'Roll up from tasks (Planner / To Do)',
  };
  var APPROVAL_STATES = { Draft: 'Draft', PendingApproval: 'Pending approval', Approved: 'Approved', Rejected: 'Rejected' };
  var REQUEST_TYPES = { Create: 'New item', TargetChange: 'Target change', WeightChange: 'Weight change', Closure: 'Closure' };
  var REQUIRABLE_FIELDS = { description: 'Description', dueDate: 'Due date', baseline: 'Baseline', target: 'Target', unit: 'Unit', team: 'Team', labels: 'Labels' };
  var CLOSED_STATES = { Closed: 'Closed', CarriedOver: 'Carried over', Dropped: 'Dropped' };
  var CONNECTION_TYPES = { PowerBI: 'Power BI dataset', SharePointExcel: 'Excel file on SharePoint', API: 'REST API', Planner: 'Microsoft Planner', ToDo: 'Microsoft To Do' };
  var PERIODS = ['FY', 'Q1', 'Q2', 'Q3', 'Q4'];

  // ---------------------------------------------------------------- preferences (role, cycle, period)
  var prefs = { role: 'Executive', period: 'FY', cycleId: null };
  try { Object.assign(prefs, JSON.parse(storage.get(PREF_KEY) || '{}')); } catch (e) { /* defaults */ }
  var asParam = new URLSearchParams(window.location.search).get('as'); // deep link to a persona, e.g. ?as=Employee
  if (asParam && ROLES.indexOf(asParam) >= 0) { prefs.role = asParam; storage.set(PREF_KEY, JSON.stringify(prefs)); }
  if (ROLES.indexOf(prefs.role) < 0) prefs.role = 'Executive';
  if (PERIODS.indexOf(prefs.period) < 0) prefs.period = 'FY';
  function setPref(key, value) { prefs[key] = value; storage.set(PREF_KEY, JSON.stringify(prefs)); }

  // ---------------------------------------------------------------- lookups
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function user(id) { return id ? byId(db.users, id) : null; }
  function people() { return db.users.filter(function (u) { return u.role !== 'System'; }); }
  function dept(id) { return id ? byId(db.departments, id) : null; }
  function team(id) { return id ? byId(db.teams, id) : null; }
  function okr(id) { return id ? byId(db.okrs, id) : null; }
  function label(id) { return byId(db.config.labels || [], id); }
  function connection(id) { return id ? byId(db.connections || [], id) : null; }
  function currentUser() { return user(PERSONAS[prefs.role]); }
  function cycle(id) { return byId(db.cycles, id); }
  function activeCycle() { return db.cycles.filter(function (c) { return c.isCurrent; })[0] || db.cycles[0]; }
  function currentCycle() { return (prefs.cycleId && cycle(prefs.cycleId)) || activeCycle(); }
  function childIndex(list) {
    var idx = {};
    list.forEach(function (o) { if (o.parentId) (idx[o.parentId] = idx[o.parentId] || []).push(o); });
    return idx;
  }
  function children(id) { return db.okrs.filter(function (o) { return o.parentId === id; }); }
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
  function levelConfig(level) { return db.config.levels.filter(function (l) { return l.level === level; })[0]; }
  function parentLevel(level) { var i = LEVELS.indexOf(level); return i > 0 ? LEVELS[i - 1] : null; }
  function parentLevelsFor(level) { return level === 'Personal' ? ['Objective', 'KeyResult', 'Initiative', 'ActionItem'] : (parentLevel(level) ? [parentLevel(level)] : []); }
  function childLevel(level) { var i = LEVELS.indexOf(level); return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null; }
  function levelOrder(a, b) {
    return ALL_LEVELS.indexOf(a.level) - ALL_LEVELS.indexOf(b.level) || a.code.localeCompare(b.code, 'en', { numeric: true });
  }
  function tasksFor(okrId) { return (db.tasks || []).filter(function (t) { return t.okrId === okrId; }); }

  // ---------------------------------------------------------------- reporting lines
  function managerOf(userId) { var u = user(userId); return u ? user(u.managerId) : null; }
  function managerChain(userId) {
    var out = [], m = managerOf(userId), guard = 0;
    while (m && guard++ < 20) { out.push(m); m = managerOf(m.id); }
    return out;
  }
  function directReports(userId) { return people().filter(function (u) { return u.managerId === userId; }); }
  function allReports(userId) {
    var out = [];
    directReports(userId).forEach(function (u) { out.push(u); out = out.concat(allReports(u.id)); });
    return out;
  }
  function isManagerOf(managerId, userId) { return managerChain(userId).some(function (m) { return m.id === managerId; }); }
  function owns(o, userId) { return o.ownerId === userId || (o.coOwnerIds || []).indexOf(userId) >= 0; }

  // ---------------------------------------------------------------- roll-up and status rules
  function d(s) { return new Date(s.length === 10 ? s + 'T00:00:00Z' : s); }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function endOf(dateStr) { return d(dateStr).getTime() + DAY; }
  function isStay(o) { return o.measurementType === 'StayAbove' || o.measurementType === 'StayBelow'; }

  /** Progress of a measured (leaf) item. */
  function measuredProgress(o) {
    var b = Number(o.baseline) || 0, t = Number(o.target) || 0, c = Number(o.current) || 0;
    switch (o.measurementType) {
      case 'RolledUp': return o.progress || 0;
      case 'Milestone': return clamp(t ? (c / t) * 100 : 0);
      case 'Binary': return c >= 1 ? 100 : 0;
      case 'Tasks': {
        var list = tasksFor(o.id);
        if (list.length) return (list.filter(function (x) { return x.done; }).length / list.length) * 100;
        return clamp(t ? (c / t) * 100 : 0);
      }
      case 'StayAbove': return c >= t ? 100 : clamp(b < t ? ((c - b) / (t - b)) * 100 : (c / t) * 100);
      case 'StayBelow': return c <= t ? 100 : clamp(b > t ? ((b - c) / (b - t)) * 100 : (t / c) * 100);
      default: return t === b ? (c === t ? 100 : 0) : clamp(((c - b) / (t - b)) * 100); // works for decreasing targets too
    }
  }
  /** Linear expectation: share of the item's time window that has elapsed. */
  function expectedProgress(o, at) {
    var s = d(o.startDate).getTime(), e = endOf(o.dueDate);
    if (e <= s) return 100;
    return clamp(((at || asOf).getTime() - s) / (e - s) * 100);
  }
  function isOverdue(o) { return !o.closedState && !isStay(o) && o.progress < 100 && asOf.getTime() > endOf(o.dueDate); }
  function suggestStatus(progress, o) {
    if (isStay(o)) {
      if (asOf.getTime() > endOf(o.dueDate)) return progress >= 100 ? 'Completed' : 'OffTrack';
      return progress >= 100 ? 'OnTrack' : progress >= 80 ? 'AtRisk' : 'OffTrack';
    }
    if (progress >= 100) return 'Completed';
    if (asOf < d(o.startDate)) return 'NotStarted';
    if (asOf.getTime() > endOf(o.dueDate)) return 'OffTrack';
    if (o.measurementType === 'Binary') return (endOf(o.dueDate) - asOf.getTime()) / DAY <= db.config.reminders.dueSoonDays ? 'AtRisk' : 'OnTrack';
    var gap = expectedProgress(o) - progress;
    if (gap <= 10) return 'OnTrack';
    if (gap <= 25) return 'AtRisk';
    return 'OffTrack';
  }
  function deriveStatus(o) {
    if (o.closedState) return o.finalStatus || (o.progress >= 100 ? 'Completed' : 'OffTrack');
    if (!isStay(o) && o.progress >= 100) return 'Completed';
    if (asOf < d(o.startDate)) return 'NotStarted';
    if (isOverdue(o)) return 'OffTrack';
    if (o.reportedStatus && o.reportedStatus !== 'Completed') return o.reportedStatus;
    if (db.config.autoStatus === false) return 'OnTrack';
    return suggestStatus(o.progress, o);
  }
  function countsInRollup(o) { return o.approvalState !== 'Rejected' && o.contributesToParent !== false && o.closedState !== 'Dropped'; }
  function weightOf(o) { return db.config.weightsInRollup === false ? 1 : (Number(o.weight) || 0); }

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
        var w = ch.reduce(function (s, c) { return s + weightOf(c); }, 0);
        o.progress = ch.length && w ? round1(ch.reduce(function (s, c) { return s + c.progress * weightOf(c); }, 0) / w) : 0;
        o.current = o.progress;
      } else {
        o.progress = round1(measuredProgress(o));
      }
      o.status = deriveStatus(o);
    }
    list.forEach(calc);
    return list;
  }
  function weightShare(o) {
    if (!o.parentId || !countsInRollup(o)) return null;
    var sibs = children(o.parentId).filter(countsInRollup);
    var w = sibs.reduce(function (s, c) { return s + weightOf(c); }, 0);
    return w ? weightOf(o) / w * 100 : 0;
  }
  function daysSince(iso) { return iso ? Math.floor((asOf.getTime() - d(iso).getTime()) / DAY) : null; }
  function isStale(o) {
    if (o.closedState || o.measurementType === 'RolledUp' || o.status === 'Completed' || o.status === 'NotStarted') return false;
    var days = daysSince(o.lastCheckInOn);
    return days === null || days > db.config.reminders.staleAfterDays;
  }
  function isDueSoon(o) {
    if (o.closedState || isStay(o) || o.status === 'Completed' || isOverdue(o)) return false;
    var left = (endOf(o.dueDate) - asOf.getTime()) / DAY;
    return left >= 0 && left <= db.config.reminders.dueSoonDays;
  }
  function flags(o) {
    var f = [];
    if (o.closedState) { f.push(CLOSED_STATES[o.closedState]); return f; }
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
    if (target.measurementType !== 'RolledUp' && target.measurementType !== 'Tasks') target.current = value;
    target.reportedStatus = status || null;
    recalcAll(copy);
    var rows = [];
    var cur = target;
    while (cur) {
      var before = okr(cur.id);
      rows.push({ id: cur.id, code: cur.code, title: cur.title, level: cur.level, before: before.progress, after: cur.progress, statusBefore: before.status, statusAfter: cur.status });
      if (!countsInRollup(cur)) break;
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
  /** Items of the selected cycle that overlap the selected period and that the current person may see. */
  function cycleOkrs() {
    var c = currentCycle();
    return db.okrs.filter(function (o) { return o.cycleId === c.id && inPeriod(o) && can.view(o); }).sort(levelOrder);
  }
  function myGoals(list) { var me = currentUser(); return (list || cycleOkrs()).filter(function (o) { return owns(o, me.id); }); }
  function teamGoals(list) {
    var ids = allReports(currentUser().id).map(function (u) { return u.id; });
    return (list || cycleOkrs()).filter(function (o) { return ids.indexOf(o.ownerId) >= 0 || (o.coOwnerIds || []).some(function (c) { return ids.indexOf(c) >= 0; }); });
  }

  // ---------------------------------------------------------------- permissions (UI only; a real system enforces these server-side)
  var NAV_BY_ROLE = {
    Executive: ['home', 'explorer', 'meetings', 'people', 'approvals', 'reports', 'notifications', 'teams'],
    VDO: ['home', 'explorer', 'meetings', 'people', 'approvals', 'reports', 'notifications', 'teams'],
    DepartmentCoordinator: ['home', 'explorer', 'checkin', 'meetings', 'people', 'approvals', 'reports', 'notifications', 'teams'],
    OkrChampion: ['home', 'explorer', 'checkin', 'meetings', 'people', 'approvals', 'notifications', 'teams'],
    Employee: ['home', 'explorer', 'checkin', 'meetings', 'people', 'notifications', 'teams'],
    PlatformAdmin: ['home', 'explorer', 'people', 'reports', 'notifications', 'admin', 'teams'],
  };
  function perms() { return db.config.permissions; }
  function cycleOpen(o) { var c = cycle(o.cycleId); return !o.closedState && (!c || c.status !== 'Closed'); }
  var can = {
    nav: function (key, role) { return NAV_BY_ROLE[role || prefs.role].indexOf(key) >= 0; },
    view: function (o) {
      var u = currentUser();
      if (!o.visibility || o.visibility === 'Public') return true;
      if (owns(o, u.id)) return true;
      if (u.role === 'Executive' || u.role === 'VDO' || u.role === 'PlatformAdmin') return true;
      if (isManagerOf(u.id, o.ownerId)) return true;
      return o.visibility === 'Department' && u.departmentId === o.departmentId;
    },
    createLevels: function (role) {
      role = role || prefs.role;
      if (currentCycle().status === 'Closed') return [];
      return ALL_LEVELS.filter(function (l) { return (perms().createRules[l] || []).indexOf(role) >= 0; });
    },
    create: function (level) { var ls = can.createLevels(); return level ? ls.indexOf(level) >= 0 : ls.length > 0; },
    edit: function (o) {
      var u = currentUser();
      if (!cycleOpen(o) || u.role === 'PlatformAdmin') return false;
      if (owns(o, u.id)) return perms().ownersCanEditOwn !== false;
      if (u.role === 'Executive' || u.role === 'VDO') return true;
      if (u.role === 'DepartmentCoordinator' && u.departmentId === o.departmentId) return true;
      return perms().managersCanEditReports !== false && isManagerOf(u.id, o.ownerId);
    },
    remove: function (o) { return can.edit(o) && children(o.id).length === 0; },
    checkIn: function (o) {
      var u = currentUser();
      if (!cycleOpen(o) || u.role === 'PlatformAdmin') return false;
      if (owns(o, u.id) || isManagerOf(u.id, o.ownerId)) return true;
      return (u.role === 'DepartmentCoordinator' || u.role === 'OkrChampion') && u.departmentId === o.departmentId;
    },
    decide: function (a) {
      var u = currentUser();
      if (a.decision !== 'Pending' || a.requestedById === u.id) return false;
      if (a.approverId) return a.approverId === u.id;
      if (u.role !== a.approverRole) return false;
      return u.role !== 'DepartmentCoordinator' || u.departmentId === a.departmentId;
    },
    exportData: function () { return (perms().exportRoles || []).indexOf(prefs.role) >= 0; },
    seeComment: function (c, o) {
      if (!c.private) return true;
      var u = currentUser();
      return c.authorId === u.id || owns(o, u.id) || isManagerOf(u.id, o.ownerId) || u.role === 'Executive';
    },
  };

  // ---------------------------------------------------------------- formatting
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
  var dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
  var shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
  var timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
  var weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
  function fmtDate(s) { return s ? dateFmt.format(d(s.length === 10 ? s + 'T12:00:00Z' : s)) : '–'; }
  function fmtDateTime(s) { return s ? dateTimeFmt.format(d(s)) : '–'; }
  function fmtShort(s) { return s ? shortFmt.format(d(s.length === 10 ? s + 'T12:00:00Z' : s)) : '–'; }
  function fmtTime(s) { return s ? timeFmt.format(d(s)) : '–'; }
  function fmtWeekday(s) { return s ? weekdayFmt.format(d(s)) : '–'; }
  function fmtRelative(s) {
    if (!s) return 'never';
    var days = daysSince(s);
    if (days < 0) { var ahead = -days; return ahead === 1 ? 'tomorrow' : 'in ' + ahead + ' days'; }
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    if (days < 60) { var w = Math.round(days / 7); return w === 1 ? '1 week ago' : w + ' weeks ago'; }
    var m = Math.round(days / 30);
    return m === 1 ? '1 month ago' : m + ' months ago';
  }
  function fmtNumber(v) { return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function fmtValue(o, v) {
    if (v === null || v === undefined || v === '') return '–';
    v = Number(v);
    if (o.measurementType === 'Binary') return v >= 1 ? 'Done' : 'Not done';
    if (o.measurementType === 'Tasks') return fmtNumber(v) + ' of ' + fmtNumber(o.target) + ' tasks';
    if (o.measurementType === 'Currency') {
      if (Math.abs(v) >= 1e6) return 'AED ' + fmtNumber(Math.round(v / 1e5) / 10) + 'M';
      if (Math.abs(v) >= 1e3) return 'AED ' + fmtNumber(Math.round(v / 100) / 10) + 'K';
      return 'AED ' + fmtNumber(v);
    }
    if (o.measurementType === 'RolledUp' || o.unit === '%') return fmtNumber(Math.round(v * 100) / 100) + '%';
    return fmtNumber(v) + (o.unit ? ' ' + o.unit : '');
  }
  function fmtTarget(o) {
    if (o.measurementType === 'StayAbove') return '≥ ' + fmtValue(o, o.target);
    if (o.measurementType === 'StayBelow') return '≤ ' + fmtValue(o, o.target);
    if (o.measurementType === 'Binary') return 'Done';
    if (o.measurementType === 'Tasks') return fmtNumber(o.target) + ' tasks';
    return fmtValue(o, o.target);
  }
  function pct(v) { return Math.round(v) + '%'; }

  // ---------------------------------------------------------------- statistics
  function avg(list, fn) { return list.length ? list.reduce(function (s, x) { return s + fn(x); }, 0) / list.length : 0; }
  function countByStatus(list) {
    var out = {};
    STATUSES.forEach(function (s) { out[s] = 0; });
    list.forEach(function (o) { out[o.status] = (out[o.status] || 0) + 1; });
    return out;
  }
  function progressByDepartment(list) {
    return db.departments.map(function (dp) {
      var krs = list.filter(function (o) { return o.level === 'KeyResult' && o.departmentId === dp.id; });
      return { id: dp.id, label: dp.name, code: dp.code, value: avg(krs, function (o) { return o.progress; }), count: krs.length };
    });
  }
  function checkInsPerWeek(weeks) {
    var out = [], end = asOf.getTime();
    for (var i = weeks - 1; i >= 0; i--) {
      var to = end - i * 7 * DAY, from = to - 7 * DAY;
      var n = db.checkins.filter(function (c) { var t = d(c.date).getTime(); return t > from && t <= to; }).length;
      out.push({ label: fmtShort(new Date(from + DAY).toISOString()), value: n });
    }
    return out;
  }
  function checkInsFor(okrId) {
    return db.checkins.filter(function (c) { return c.okrId === okrId; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  /** Timeline of updates (check-ins, comments, changes) for a set of items, newest first. */
  function feed(items, limit) {
    var ids = {};
    items.forEach(function (o) { ids[o.id] = o; });
    var out = [];
    db.checkins.forEach(function (c) { if (ids[c.okrId]) out.push({ kind: 'checkin', at: c.date, okr: ids[c.okrId], by: c.authorId, data: c }); });
    db.comments.forEach(function (c) { if (ids[c.okrId] && can.seeComment(c, ids[c.okrId])) out.push({ kind: 'comment', at: c.createdOn, okr: ids[c.okrId], by: c.authorId, data: c }); });
    db.audit.forEach(function (e) {
      if (e.action !== 'Created' && e.action !== 'Updated' && e.action !== 'Approved' && e.action !== 'TaskUpdated') return;
      var o = ids[e.entityId];
      if (o) out.push({ kind: 'change', at: e.timestamp, okr: o, by: e.actorId, data: e });
    });
    out.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    return limit ? out.slice(0, limit) : out;
  }

  // ---------------------------------------------------------------- AI agent: insights and digest (rule-based in the demo)
  function insights(items) {
    var open = items.filter(function (o) { return !o.closedState && o.status !== 'Completed' && o.status !== 'NotStarted'; });
    var drifting = [], stalled = [], deadlines = [], wins = [];
    open.forEach(function (o) {
      var cis = checkInsFor(o.id);
      if (cis.length >= 3 && (o.status === 'AtRisk' || o.status === 'OffTrack') && !isStay(o)) {
        var last = cis.slice(-3).map(function (c) { return expectedProgress(o, d(c.date)) - c.progress; });
        if (last[2] > last[0] + 3) drifting.push({ okr: o, detail: 'Gap to plan widened from ' + Math.round(last[0]) + ' to ' + Math.round(last[2]) + ' points over the last 3 check-ins.' });
      }
      if (isStay(o) && o.progress < 100) drifting.push({ okr: o, detail: 'Currently ' + fmtValue(o, o.current) + ' against a threshold of ' + fmtTarget(o) + '.' });
      if (isStale(o)) stalled.push({ okr: o, detail: 'No update for ' + (o.lastCheckInOn ? daysSince(o.lastCheckInOn) + ' days' : 'the whole cycle') + '.' });
      else if (cis.length >= 2 && o.measurementType !== 'RolledUp' && o.measurementType !== 'Binary') {
        var a = cis[cis.length - 2], b = cis[cis.length - 1];
        if (b.progress <= a.progress && d(b.date) - d(a.date) >= 14 * DAY && o.progress < 100 && !isStay(o)) stalled.push({ okr: o, detail: 'No progress between the last two check-ins (' + pct(b.progress) + ').' });
      }
      var left = (endOf(o.dueDate) - asOf.getTime()) / DAY;
      if (left >= 0 && left <= 21 && o.progress < 80 && !isStay(o)) deadlines.push({ okr: o, detail: 'Due ' + fmtDate(o.dueDate) + ' at ' + pct(o.progress) + '.' });
    });
    items.forEach(function (o) {
      if (o.status === 'Completed' && o.lastCheckInOn && daysSince(o.lastCheckInOn) <= 45) wins.push({ okr: o, detail: 'Completed ' + fmtRelative(o.lastCheckInOn) + '.' });
      if (isStay(o) && o.progress >= 100) wins.push({ okr: o, detail: 'Holding at ' + fmtValue(o, o.current) + ' (threshold ' + fmtTarget(o) + ').' });
    });
    var c = countByStatus(open);
    return {
      drifting: drifting, stalled: stalled, deadlines: deadlines, wins: wins,
      headline: (c.OnTrack || 0) + ' of ' + open.length + ' open goals on track. ' + drifting.length + ' drifting, ' + stalled.length + ' stalled, ' + deadlines.length + ' due within 3 weeks.',
    };
  }
  function digestScope() {
    var me = currentUser();
    var all = cycleOkrs();
    if (me.role === 'Employee') return { label: 'your goals', items: all.filter(function (o) { return owns(o, me.id); }) };
    if (me.role === 'DepartmentCoordinator' || me.role === 'OkrChampion') return { label: dept(me.departmentId).name, items: all.filter(function (o) { return o.departmentId === me.departmentId; }) };
    return { label: 'the division', items: all.filter(function (o) { return o.level !== 'Personal'; }) };
  }

  // ---------------------------------------------------------------- mutations (each one is audited)
  function audit(action, entityType, entityId, entityName, details, departmentId, actorId) {
    db.audit.unshift({ id: uid('ae'), timestamp: now(), actorId: actorId || currentUser().id, action: action, entityType: entityType, entityId: entityId, entityName: entityName, details: details, departmentId: departmentId || null });
  }
  function notify(recipientId, type, title, message, okrId) {
    if (!recipientId || (db.config.notifications && db.config.notifications[type] === false)) return;
    db.notifications.unshift({ id: uid('nt'), recipientId: recipientId, type: type, title: title, message: message, okrId: okrId || null, createdOn: now(), read: false });
  }
  function okrName(o) { return o.code + ' ' + o.title; }
  function approverFor(role, departmentId) {
    return people().filter(function (u) { return u.role === role && (role !== 'DepartmentCoordinator' || u.departmentId === departmentId); })[0];
  }

  function addCheckIn(input) {
    var o = okr(input.okrId);
    var me = user(input.authorId) || currentUser();
    var ts = now();
    if (o.measurementType !== 'RolledUp' && o.measurementType !== 'Tasks') o.current = Number(input.value);
    o.reportedStatus = input.status || null;
    o.lastCheckInOn = ts;
    o.modifiedOn = ts;
    recalcAll(db.okrs);
    var ci = { id: uid('ci'), okrId: o.id, date: ts, value: o.measurementType === 'RolledUp' ? o.progress : Number(o.current), progress: o.progress, status: o.status, narrative: input.narrative, authorId: me.id, confidence: input.confidence || null, channel: input.channel || 'Web' };
    db.checkins.push(ci);
    audit('CheckIn', 'dtp_checkin', o.id, okrName(o), 'Check-in recorded' + (ci.channel !== 'Web' ? ' from ' + ci.channel : '') + ': ' + fmtValue(o, ci.value) + ', progress ' + pct(o.progress) + ', status ' + STATUS[o.status].label + '.', o.departmentId, me.id);
    var parent = okr(o.parentId);
    if (parent && parent.ownerId !== me.id) notify(parent.ownerId, 'CheckIn', 'New check-in on ' + o.code, me.displayName + ' updated ' + o.code + ' to ' + pct(o.progress) + ' (' + STATUS[o.status].label + ').', o.id);
    save();
    return ci;
  }

  function addComment(okrId, text, isPrivate) {
    var o = okr(okrId), me = currentUser();
    var c = { id: uid('cm'), okrId: okrId, authorId: me.id, text: text, createdOn: now(), private: !!isPrivate };
    db.comments.push(c);
    audit('Commented', 'dtp_comment', o.id, okrName(o), (isPrivate ? 'Private comment' : 'Comment') + ' added.', o.departmentId);
    if (o.ownerId !== me.id) notify(o.ownerId, 'Comment', 'New ' + (isPrivate ? 'private ' : '') + 'comment on ' + o.code, me.displayName + ': “' + (text.length > 80 ? text.slice(0, 80) + '…' : text) + '”', o.id);
    save();
    return c;
  }

  function nextCode(level, parent, cycleId) {
    var inCycle = db.okrs.filter(function (o) { return o.level === level && o.cycleId === (cycleId || currentCycle().id); });
    if (level === 'Goal') return 'G' + (inCycle.length + 1);
    if (level === 'Initiative' || level === 'ActionItem' || level === 'Personal') {
      var max = db.okrs.filter(function (o) { return o.level === level; }).reduce(function (m, o) { var n = Number(o.code.split('-')[1]) || 0; return Math.max(m, n); }, 0);
      return LEVEL_SHORT[level] + '-' + String(max + 1).padStart(2, '0');
    }
    var basePart = parent ? parent.code.replace(/^[A-Z]+/, '') : '';
    var n = db.okrs.filter(function (o) { return o.parentId === (parent && parent.id) && o.level === level; }).length + 1;
    return LEVEL_SHORT[level] + (basePart ? basePart + '.' : '') + n;
  }

  function submitForApproval(o, requestType, summary, proposed) {
    var me = currentUser();
    var cfg = levelConfig(o.level);
    var byManager = o.level === 'Personal' || perms().approvalRouting === 'Manager';
    var mgr = byManager ? managerOf(o.ownerId === me.id ? me.id : o.ownerId) : null;
    var a = {
      id: uid('ap'), okrId: o.id, requestType: requestType, summary: summary, requestedById: me.id, requestedOn: now(),
      approverRole: mgr ? 'Manager' : cfg.approverRole, approverId: mgr ? mgr.id : null, departmentId: o.departmentId,
      decision: 'Pending', decidedById: null, decidedOn: null, comment: '', proposed: proposed || null,
    };
    db.approvals.unshift(a);
    if (requestType === 'Create') o.approvalState = 'PendingApproval';
    var approver = mgr || approverFor(cfg.approverRole, o.departmentId);
    audit('Submitted', 'dtp_approval', o.id, okrName(o), REQUEST_TYPES[requestType] + ' submitted for approval by ' + (mgr ? mgr.displayName + ' (line manager)' : ROLE_LABELS[cfg.approverRole]) + '.', o.departmentId);
    if (approver) notify(approver.id, 'Approval', 'Approval needed: ' + REQUEST_TYPES[requestType].toLowerCase() + ' for ' + o.code, me.displayName + ' submitted a request: ' + summary, o.id);
    return a;
  }

  function createOkr(fields, submit, taskTitles) {
    var me = currentUser();
    var parent = okr(fields.parentId);
    var ts = now();
    var cfg = levelConfig(fields.level);
    var cyc = currentCycle();
    var o = Object.assign({
      id: uid('okr'), code: nextCode(fields.level, parent, cyc.id), cycleId: cyc.id, current: fields.measurementType === 'Binary' ? 0 : (fields.baseline || 0),
      progress: 0, status: 'NotStarted', reportedStatus: null, visibility: 'Public', lastCheckInOn: null, createdOn: ts, modifiedOn: ts,
      approvalState: cfg.approvalRequired ? 'Draft' : 'Approved', labels: [], coOwnerIds: [], contributesToParent: fields.level !== 'Personal',
      dataSource: null, closedState: null, finalStatus: null,
    }, fields);
    db.okrs.push(o);
    if (o.measurementType === 'Tasks') {
      (taskTitles || []).forEach(function (t, i) { db.tasks.push({ id: uid('tk'), okrId: o.id, title: t, assigneeId: o.ownerId, dueDate: o.dueDate, done: false, source: o.level === 'Personal' ? 'ToDo' : 'Planner', order: i }); });
      o.target = tasksFor(o.id).length; o.current = 0; o.unit = 'tasks';
    }
    audit('Created', 'dtp_okr', o.id, okrName(o), LEVEL_LABELS[o.level] + ' created' + (o.approvalState === 'Draft' ? ' as draft' : '') + '.', o.departmentId);
    if (o.ownerId !== me.id) notify(o.ownerId, 'Assignment', 'You own a new ' + LEVEL_LABELS[o.level].toLowerCase() + ': ' + o.code, me.displayName + ' assigned “' + o.title + '” to you.', o.id);
    (o.coOwnerIds || []).forEach(function (c) { if (c !== me.id) notify(c, 'Assignment', 'You are a co-owner of ' + o.code, me.displayName + ' added you as co-owner of “' + o.title + '”.', o.id); });
    if (submit && cfg.approvalRequired) submitForApproval(o, 'Create', 'New ' + LEVEL_LABELS[o.level].toLowerCase() + ': ' + o.title);
    save();
    return o;
  }

  /** Apply an edit. Target and weight changes on approved items that need approval become requests instead. */
  function updateOkr(id, fields) {
    var o = okr(id), me = currentUser();
    var cfg = levelConfig(o.level);
    var gated = cfg.approvalRequired && o.approvalState === 'Approved';
    var requests = [];
    if (gated && fields.target !== undefined && Number(fields.target) !== Number(o.target) && o.measurementType !== 'Tasks') {
      requests.push(submitForApproval(o, 'TargetChange', 'Change target of ' + o.code + ' from ' + fmtValue(o, o.target) + ' to ' + fmtValue(o, fields.target) + '.', { target: Number(fields.target) }));
      delete fields.target;
    }
    if (gated && fields.weight !== undefined && Number(fields.weight) !== Number(o.weight)) {
      requests.push(submitForApproval(o, 'WeightChange', 'Change weight of ' + o.code + ' from ' + o.weight + ' to ' + fields.weight + '.', { weight: Number(fields.weight) }));
      delete fields.weight;
    }
    var changed = Object.keys(fields).filter(function (k) { return JSON.stringify(fields[k]) !== JSON.stringify(o[k]) && String(fields[k]) !== String(o[k]); });
    changed.forEach(function (k) { o[k] = fields[k]; });
    if (changed.length) {
      o.modifiedOn = now();
      audit('Updated', 'dtp_okr', o.id, okrName(o), 'Changed: ' + changed.join(', ') + '.', o.departmentId);
      if (o.ownerId !== me.id) notify(o.ownerId, 'Edited', me.displayName + ' edited ' + o.code, 'Changed: ' + changed.join(', ') + '.', o.id);
    }
    save();
    return { changed: changed, requests: requests };
  }

  function deleteOkr(id) {
    var o = okr(id), me = currentUser();
    db.okrs = db.okrs.filter(function (x) { return x.id !== id; });
    db.tasks = db.tasks.filter(function (t) { return t.okrId !== id; });
    audit('Deleted', 'dtp_okr', id, okrName(o), LEVEL_LABELS[o.level] + ' deleted.', o.departmentId);
    if (o.ownerId !== me.id) notify(o.ownerId, 'Deleted', me.displayName + ' deleted ' + o.code, '“' + o.title + '” was deleted.', null);
    save();
    return o;
  }

  function requestApproval(okrId, requestType, summary, proposed) {
    var a = submitForApproval(okr(okrId), requestType, summary, proposed);
    save();
    return a;
  }

  function decide(approvalId, decision, comment) {
    var a = byId(db.approvals, approvalId);
    var o = okr(a.okrId), me = currentUser();
    a.decision = decision; a.decidedById = me.id; a.decidedOn = now(); a.comment = comment || '';
    if (o) {
      if (a.requestType === 'Create') o.approvalState = decision === 'Approved' ? 'Approved' : 'Rejected';
      if (decision === 'Approved' && a.proposed) Object.keys(a.proposed).forEach(function (k) { o[k] = a.proposed[k]; });
      if (decision === 'Approved' && a.requestType === 'Closure') { o.reportedStatus = 'Completed'; if (o.measurementType !== 'RolledUp' && o.measurementType !== 'Tasks') o.current = o.target; }
      o.modifiedOn = a.decidedOn;
    }
    audit(decision, 'dtp_approval', a.okrId, o ? okrName(o) : a.okrId, REQUEST_TYPES[a.requestType] + ' ' + decision.toLowerCase() + (comment ? ': ' + comment : '.'), a.departmentId);
    notify(a.requestedById, 'Decision', 'Request ' + decision.toLowerCase() + (o ? ': ' + o.code : ''), me.displayName + ' ' + decision.toLowerCase() + ' your ' + REQUEST_TYPES[a.requestType].toLowerCase() + ' request.' + (comment ? ' “' + comment + '”' : ''), a.okrId);
    save();
    return a;
  }

  // tasks (Planner / To Do) -------------------------------------------------
  function syncTaskTotals(o) {
    var list = tasksFor(o.id);
    o.target = list.length;
    o.current = list.filter(function (t) { return t.done; }).length;
  }
  function setTaskDone(taskId, done) {
    var t = byId(db.tasks, taskId), o = okr(t.okrId);
    t.done = !!done;
    syncTaskTotals(o);
    o.lastCheckInOn = now(); o.modifiedOn = o.lastCheckInOn;
    audit('TaskUpdated', 'dtp_task', o.id, okrName(o), 'Task “' + t.title + '” marked ' + (done ? 'done' : 'not done') + ' (synced with ' + (t.source === 'ToDo' ? 'Microsoft To Do' : 'Microsoft Planner') + ').', o.departmentId);
    save();
    return o;
  }
  function addTask(okrId, title, assigneeId, dueDate) {
    var o = okr(okrId);
    var t = { id: uid('tk'), okrId: okrId, title: title, assigneeId: assigneeId || o.ownerId, dueDate: dueDate || o.dueDate, done: false, source: o.level === 'Personal' ? 'ToDo' : 'Planner' };
    db.tasks.push(t);
    syncTaskTotals(o);
    audit('TaskUpdated', 'dtp_task', o.id, okrName(o), 'Task “' + title + '” added.', o.departmentId);
    save();
    return t;
  }

  // data connections (simulated automatic key-result updates) ---------------
  function syncItem(o, conn) {
    if (o.measurementType === 'Tasks') { syncTaskTotals(o); o.dataSource.lastSync = now(); return null; }
    var seed = (db.tick || 0) + o.code.length * 7;
    var b = Number(o.baseline), t = Number(o.target), c = Number(o.current), next;
    if (isStay(o)) {
      var spread = Math.abs(t - b) * 0.6 || Math.abs(t) * 0.02;
      next = c + (rand(seed) - 0.45) * spread;
    } else if (o.progress >= 100) {
      next = c;
    } else {
      next = c + (t - c) * (0.08 + rand(seed) * 0.12);
    }
    var dp = Math.abs(t) < 10 ? 100 : 1;
    next = Math.round(next * dp) / dp;
    var ts = now();
    o.current = next; o.lastCheckInOn = ts; o.modifiedOn = ts; o.reportedStatus = null;
    o.dataSource.lastSync = ts;
    recalcAll(db.okrs);
    db.checkins.push({ id: uid('ci'), okrId: o.id, date: ts, value: next, progress: o.progress, status: o.status, narrative: 'Automatic update from ' + conn.name + ' (' + o.dataSource.field + ').', authorId: 'sys', confidence: null, channel: CONNECTION_TYPES[conn.type] });
    audit('Synced', 'dtp_okr', o.id, okrName(o), 'Value ' + fmtValue(o, next) + ' received from ' + conn.name + '.', o.departmentId, 'sys');
    notify(o.ownerId, 'Sync', o.code + ' updated automatically', conn.name + ' reported ' + fmtValue(o, next) + ' (' + STATUS[o.status].label + ').', o.id);
    return next;
  }
  function syncNow(okrId) {
    var o = okr(okrId);
    var conn = connection(o.dataSource && o.dataSource.connectionId);
    if (!conn) return null;
    var v = syncItem(o, conn);
    conn.lastSync = now();
    save();
    return v;
  }
  function syncConnection(connId) {
    var conn = connection(connId);
    var items = db.okrs.filter(function (o) { return o.dataSource && o.dataSource.connectionId === connId && !o.closedState; });
    items.forEach(function (o) { syncItem(o, conn); });
    conn.lastSync = now(); conn.status = 'Connected';
    audit('ConfigChanged', 'dtp_dataconnection', conn.id, conn.name, 'Manual sync: ' + items.length + ' linked items refreshed.', null);
    save();
    return items.length;
  }
  function linkedItems(connId) { return db.okrs.filter(function (o) { return o.dataSource && o.dataSource.connectionId === connId; }); }

  // notifications ------------------------------------------------------------
  function myNotifications() {
    var me = currentUser();
    return db.notifications.filter(function (n) { return n.recipientId === me.id; }).sort(function (a, b) { return a.createdOn < b.createdOn ? 1 : -1; });
  }
  function unreadCount() { return myNotifications().filter(function (n) { return !n.read; }).length; }
  function markRead(id, read) { var n = byId(db.notifications, id); if (n) n.read = read !== false; save(); }
  function markAllRead() { myNotifications().forEach(function (n) { n.read = true; }); save(); }
  function pendingForMe() { return db.approvals.filter(can.decide); }
  function myPrefs() { return (db.userPrefs || {})[currentUser().id] || {}; }
  function setMyPrefs(patch) {
    db.userPrefs = db.userPrefs || {};
    db.userPrefs[currentUser().id] = Object.assign({}, myPrefs(), patch);
    audit('Updated', 'dtp_userprofile', currentUser().id, currentUser().displayName, 'Reminder preferences updated.', currentUser().departmentId);
    save();
  }

  // 1:1 meetings ---------------------------------------------------------------
  function myMeetings() {
    var me = currentUser();
    return (db.meetings || []).filter(function (m) { return m.managerId === me.id || m.employeeId === me.id || me.role === 'PlatformAdmin'; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  function meeting(id) { return byId(db.meetings || [], id); }
  /** Goals worth discussing with someone: anything they own that is at risk, off track, stale or due soon, plus individual goals. */
  function suggestedGoals(userId) {
    return db.okrs.filter(function (o) {
      return o.cycleId === activeCycle().id && owns(o, userId) && !o.closedState && o.status !== 'Completed' &&
        (o.status === 'AtRisk' || o.status === 'OffTrack' || isStale(o) || isDueSoon(o) || o.level === 'Personal');
    }).sort(levelOrder);
  }
  function createMeeting(m) {
    var me = currentUser();
    var mt = Object.assign({ id: uid('mt'), durationMin: 30, recurrence: 'Every 2 weeks', status: 'Scheduled', goalIds: [], agenda: [], notes: '', actions: [] }, m);
    db.meetings.push(mt);
    var other = mt.managerId === me.id ? mt.employeeId : mt.managerId;
    audit('Created', 'dtp_meeting', mt.id, '1:1 ' + user(mt.managerId).displayName + ' / ' + user(mt.employeeId).displayName, 'Meeting scheduled for ' + fmtDateTime(mt.date) + ' with ' + mt.goalIds.length + ' goals on the agenda.', user(mt.employeeId).departmentId);
    notify(other, 'Meeting', '1:1 with ' + me.displayName + ' on ' + fmtDate(mt.date), mt.goalIds.length + ' goals are on the agenda. Add your talking points before the meeting.', null);
    save();
    return mt;
  }
  function updateMeeting(id, patch, what) {
    var m = meeting(id);
    Object.assign(m, patch);
    if (what) audit('Updated', 'dtp_meeting', m.id, '1:1 ' + user(m.managerId).displayName + ' / ' + user(m.employeeId).displayName, what, user(m.employeeId).departmentId);
    save();
    return m;
  }

  // labels, templates, cycles, configuration --------------------------------
  function updateConfig(section, patch, what) {
    if (section) db.config[section] = Object.assign(Array.isArray(db.config[section]) ? [] : {}, db.config[section], patch);
    audit('ConfigChanged', 'dtp_configuration', section || 'config', what || section, (what || section) + ' updated.', null);
    save();
  }
  function setConfigValue(key, value, what) {
    db.config[key] = value;
    audit('ConfigChanged', 'dtp_configuration', key, what || key, (what || key) + ' updated.', null);
    save();
  }
  function updateLevel(levelId, patch) {
    var l = byId(db.config.levels, levelId);
    Object.assign(l, patch);
    audit('ConfigChanged', 'dtp_levelconfig', l.id, l.displayName, 'Level settings updated: ' + Object.keys(patch).join(', ') + '.', null);
    save();
  }
  var LABEL_COLOURS = [['#E6F2EC', '#0B5A30'], ['#FBE8E9', '#9A1C22'], ['#E8EEFB', '#2C4A9A'], ['#F3EEFB', '#55399A'], ['#EAF5E1', '#3F6212'], ['#FDF3DC', '#7A5500'], ['#E5F4F6', '#0B5F6B'], ['#F1F1F0', '#444444']];
  function addLabel(name, colourIndex) {
    var c = LABEL_COLOURS[colourIndex % LABEL_COLOURS.length];
    var l = { id: uid('lb'), name: name, bg: c[0], ink: c[1] };
    db.config.labels.push(l);
    audit('ConfigChanged', 'dtp_label', l.id, name, 'Label created.', null);
    save();
    return l;
  }
  function removeLabel(id) {
    var l = label(id);
    db.config.labels = db.config.labels.filter(function (x) { return x.id !== id; });
    db.okrs.forEach(function (o) { o.labels = (o.labels || []).filter(function (x) { return x !== id; }); });
    audit('ConfigChanged', 'dtp_label', id, l.name, 'Label deleted and removed from all goals.', null);
    save();
  }
  function saveTemplate(t) {
    if (t.id) Object.assign(byId(db.config.templates, t.id), t);
    else { t.id = uid('tp'); db.config.templates.push(t); }
    audit('ConfigChanged', 'dtp_goaltemplate', t.id, t.name, 'Goal template saved.', null);
    save();
    return t;
  }
  function removeTemplate(id) {
    var t = byId(db.config.templates, id);
    db.config.templates = db.config.templates.filter(function (x) { return x.id !== id; });
    audit('ConfigChanged', 'dtp_goaltemplate', id, t.name, 'Goal template deleted.', null);
    save();
  }
  function addCycle(name, startDate, endDate) {
    var c = { id: name.replace(/\s+/g, ''), name: name, startDate: startDate, endDate: endDate, isCurrent: false, status: 'Planned' };
    db.cycles.push(c);
    audit('ConfigChanged', 'dtp_cycle', c.id, name, 'Cycle created (' + startDate + ' to ' + endDate + ').', null);
    save();
    return c;
  }
  function renameCycle(id, name) {
    var c = cycle(id); var old = c.name; c.name = name;
    audit('ConfigChanged', 'dtp_cycle', id, name, 'Cycle renamed from ' + old + '.', null);
    save();
  }
  /** Close a cycle: each open item is carried over (copied into the next cycle), dropped or closed as it is. */
  function closeCycle(cycleId, decisions, targetId) {
    var from = cycle(cycleId), to = cycle(targetId);
    var idMap = {}, counts = { carry: 0, drop: 0, close: 0 };
    var items = db.okrs.filter(function (o) { return o.cycleId === cycleId && !o.closedState; }).sort(levelOrder);
    items.forEach(function (o) {
      var dec = decisions[o.id] || 'close';
      counts[dec]++;
      o.finalStatus = o.status;
      if (dec === 'carry') {
        var copy = clone(o);
        copy.id = uid('okr'); idMap[o.id] = copy.id;
        copy.cycleId = to.id; copy.startDate = to.startDate; copy.dueDate = to.endDate;
        copy.parentId = idMap[o.parentId] || null;
        if (copy.measurementType !== 'RolledUp' && copy.measurementType !== 'Tasks' && copy.measurementType !== 'Binary' && !isStay(copy)) copy.baseline = copy.current;
        copy.lastCheckInOn = null; copy.reportedStatus = null; copy.closedState = null; copy.finalStatus = null;
        copy.createdOn = now(); copy.modifiedOn = copy.createdOn; copy.approvalState = 'Approved';
        copy.description = (copy.description ? copy.description + ' ' : '') + '(Carried over from ' + from.name + '.)';
        db.okrs.push(copy);
        tasksFor(o.id).filter(function (t) { return !t.done; }).forEach(function (t) { var nt = clone(t); nt.id = uid('tk'); nt.okrId = copy.id; db.tasks.push(nt); });
        if (copy.measurementType === 'Tasks') syncTaskTotals(copy);
        o.closedState = 'CarriedOver';
      } else {
        o.closedState = dec === 'drop' ? 'Dropped' : 'Closed';
      }
    });
    from.status = 'Closed'; from.isCurrent = false;
    to.status = 'Active'; to.isCurrent = true;
    setPref('cycleId', to.id);
    audit('ConfigChanged', 'dtp_cycle', from.id, from.name, 'Cycle closed: ' + counts.carry + ' carried over to ' + to.name + ', ' + counts.close + ' closed, ' + counts.drop + ' dropped.', null);
    people().forEach(function (u) { if (u.role !== 'PlatformAdmin') notify(u.id, 'Reminder', from.name + ' is closed – ' + to.name + ' is now active', 'Review the goals carried over to ' + to.name + ' and update their targets.', null); });
    save();
    return counts;
  }

  // roles, API, exports ---------------------------------------------------------
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
    var hex = function (n) { var s = ''; for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; };
    var ts = now();
    var cred = { id: uid('api'), name: name, clientId: hex(8) + '-' + hex(4) + '-4' + hex(3) + '-a' + hex(3) + '-' + hex(12), scopes: scopes, createdOn: ts, createdById: currentUser().id, expiresOn: new Date(d(ts).getTime() + 365 * DAY).toISOString(), lastUsedOn: null, status: 'Active' };
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
  function logExport(what, format) { audit('Exported', 'report', what, what, what + ' exported to ' + (format || 'CSV') + '.', null); save(); }

  // ---------------------------------------------------------------- bulk import (CSV saved from Excel)
  var IMPORT_COLUMNS = ['Level', 'Parent code', 'Title', 'Description', 'Owner email', 'Department code', 'Measured as', 'Unit', 'Baseline', 'Target', 'Weight', 'Start date', 'Due date', 'Labels'];
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    text = text.replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
  }
  /** Validate imported rows. Returns [{n, fields, errors}] – nothing is written. */
  function validateImport(rows) {
    var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var col = function (name) { return header.indexOf(name.toLowerCase()); };
    var levelByLabel = {};
    ALL_LEVELS.forEach(function (l) { levelByLabel[l.toLowerCase()] = l; levelByLabel[LEVEL_LABELS[l].toLowerCase()] = l; });
    var typeByLabel = {};
    MEASUREMENT_TYPES.forEach(function (m) { typeByLabel[m.toLowerCase()] = m; typeByLabel[MEASUREMENT_LABELS[m].toLowerCase()] = m; });
    var cyc = currentCycle();
    return rows.slice(1).map(function (r, i) {
      var get = function (name) { var k = col(name); return k >= 0 && r[k] !== undefined ? r[k].trim() : ''; };
      var errors = [];
      var level = levelByLabel[get('Level').toLowerCase()];
      if (!level) errors.push('Unknown level “' + get('Level') + '”.');
      else if (!can.create(level)) errors.push('Your role cannot create ' + LEVEL_LABELS[level] + 's.');
      var parentCode = get('Parent code');
      var parent = parentCode ? db.okrs.filter(function (o) { return o.code === parentCode && o.cycleId === cyc.id; })[0] : null;
      if (level && level !== 'Goal' && (parentCode || level !== 'Personal') && !parent) errors.push('Parent “' + parentCode + '” not found in ' + cyc.name + '.');
      if (parent && level && parentLevelsFor(level).indexOf(parent.level) < 0) errors.push(LEVEL_LABELS[level] + ' cannot sit under a ' + LEVEL_LABELS[parent.level] + '.');
      var title = get('Title');
      if (title.length < 10) errors.push('Title must be at least 10 characters.');
      var owner = people().filter(function (u) { return u.email.toLowerCase() === get('Owner email').toLowerCase(); })[0];
      if (!owner) errors.push('Owner “' + get('Owner email') + '” not found.');
      var dep = db.departments.filter(function (x) { return x.code.toLowerCase() === get('Department code').toLowerCase(); })[0];
      if (!dep) errors.push('Department code “' + get('Department code') + '” not found.');
      var mt = typeByLabel[(get('Measured as') || (level === 'Goal' || level === 'Objective' ? 'RolledUp' : 'Numeric')).toLowerCase()];
      if (!mt) errors.push('Unknown measurement “' + get('Measured as') + '”.');
      else if ((db.config.progressTypes || MEASUREMENT_TYPES).indexOf(mt) < 0) errors.push(MEASUREMENT_LABELS[mt] + ' is switched off by the administrator.');
      var baseline = Number(get('Baseline') || 0), target = Number(get('Target') || (mt === 'Binary' ? 1 : mt === 'RolledUp' ? 100 : NaN));
      if (mt && mt !== 'RolledUp' && mt !== 'Tasks' && isNaN(target)) errors.push('Target is required.');
      var weight = Number(get('Weight') || 10);
      if (isNaN(weight) || weight < 0 || weight > 100) errors.push('Weight must be 0–100.');
      var start = get('Start date') || cyc.startDate, due = get('Due date') || cyc.endDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) errors.push('Dates must be YYYY-MM-DD.');
      else if (due < start) errors.push('Due date is before the start date.');
      var labelIds = get('Labels').split(/[|;]/).map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean).map(function (n) {
        var l = (db.config.labels || []).filter(function (x) { return x.name.toLowerCase() === n; })[0];
        if (!l) errors.push('Label “' + n + '” does not exist.');
        return l ? l.id : null;
      }).filter(Boolean);
      return {
        n: i + 2, errors: errors, parentCode: parentCode,
        fields: { level: level, parentId: parent ? parent.id : null, title: title, description: get('Description'), ownerId: owner && owner.id, departmentId: dep && dep.id, measurementType: mt,
          unit: mt === 'RolledUp' ? '%' : get('Unit'), baseline: mt === 'RolledUp' ? 0 : baseline, target: mt === 'RolledUp' ? 100 : target, weight: weight, startDate: start, dueDate: due,
          labels: labelIds, visibility: level === 'Personal' && perms().privateByDefault ? 'Private' : 'Public', teamId: null },
      };
    });
  }
  function importOkrs(valid, submit) {
    var created = valid.map(function (r) { return createOkr(Object.assign({}, r.fields), submit); });
    audit('Imported', 'dtp_okr', 'import', 'Bulk import', created.length + ' goals imported from a spreadsheet.', null);
    save();
    return created;
  }

  // ---------------------------------------------------------------- AI Assist (canned suggestions; no model is called)
  var KR_SETS = [
    [{ title: 'Reduce repeat corrective work orders from 14% to 7%', measurementType: 'Percentage', baseline: 14, target: 7, unit: '%' },
      { title: 'Complete 95% of planned maintenance within its window', measurementType: 'Percentage', baseline: 82, target: 95, unit: '%' },
      { title: 'Keep average restoration time below 60 minutes', measurementType: 'StayBelow', baseline: 95, target: 60, unit: 'min' }],
    [{ title: 'Cut planned-outage customer minutes by 30%', measurementType: 'Percentage', baseline: 0, target: 30, unit: '%' },
      { title: 'Use live-line techniques on 40 planned jobs', measurementType: 'Numeric', baseline: 0, target: 40, unit: 'jobs' },
      { title: 'Publish the joint outage calendar for all departments', measurementType: 'Binary', baseline: 0, target: 1, unit: '' }],
    [{ title: 'Raise health-index coverage of 132 kV assets from 55% to 90%', measurementType: 'Percentage', baseline: 55, target: 90, unit: '%' },
      { title: 'Back 100% of replacement proposals with a risk score', measurementType: 'Percentage', baseline: 40, target: 100, unit: '%' },
      { title: 'Retire 3 legacy condition spreadsheets', measurementType: 'Numeric', baseline: 0, target: 3, unit: 'spreadsheets' }],
  ];
  function aiSuggest(feature, ctx) {
    ctx = ctx || {};
    var out = [];
    if (feature === 'draftObjective') {
      var topic = (ctx.topic || '').trim();
      out = [
        topic
          ? { title: 'Achieve a measurable improvement in ' + topic.toLowerCase() + ' by year end', body: 'Your idea rewritten as an outcome, with key results that measure it.', fields: { title: 'Achieve a measurable improvement in ' + topic.toLowerCase() + ' by year end', description: 'Define the baseline for ' + topic.toLowerCase() + ', agree a target with the owning department and track it through fortnightly check-ins.' }, krs: KR_SETS[0] }
          : { title: 'Improve first-time-right maintenance on critical substations', body: 'Outcome-focused, time-bound wording with measurable key results.', fields: { title: 'Improve first-time-right maintenance on critical substations', description: 'Reduce repeat visits and unplanned follow-up work so that crews spend more time on planned maintenance.' }, krs: KR_SETS[0] },
        { title: 'Reduce the impact of planned outages on customers', body: 'Focuses on customer impact rather than activity volume.', fields: { title: 'Reduce the impact of planned outages on customers', description: 'Coordinate outage windows across departments and use live-line techniques where possible so that planned work causes fewer customer interruptions.' }, krs: KR_SETS[1] },
        { title: 'Make condition data the basis for every replacement decision', body: 'Links asset data quality to investment decisions.', fields: { title: 'Make condition data the basis for every replacement decision', description: 'Ensure every asset replacement proposal in the next cycle is backed by an up-to-date health index and risk score.' }, krs: KR_SETS[2] },
      ];
    } else if (feature === 'suggestKeyResults') {
      var parent = okr(ctx.okrId);
      var base = parent ? parent.code + ' ' + parent.title : 'this objective';
      out = KR_SETS[0].concat([KR_SETS[1][0]]).map(function (k) { return { title: k.title, body: 'Measures progress on ' + base + '. ' + MEASUREMENT_LABELS[k.measurementType] + '.', fields: k }; });
    } else if (feature === 'summariseCheckIns') {
      var o = okr(ctx.okrId);
      var cis = o ? checkInsFor(o.id) : [];
      if (!o || !cis.length) out = [{ title: 'No check-ins to summarise', body: 'This item has no check-ins yet.' }];
      else {
        var first = cis[0], last = cis[cis.length - 1];
        var delta = Math.round((last.progress - first.progress) * 10) / 10;
        var risky = cis.filter(function (c) { return c.status === 'AtRisk' || c.status === 'OffTrack'; }).length;
        out = [{
          title: 'Summary of ' + cis.length + ' check-ins for ' + o.code,
          body: o.code + ' moved from ' + pct(first.progress) + ' to ' + pct(last.progress) + ' (' + (delta >= 0 ? '+' : '') + delta + ' points) since ' + fmtDate(first.date) + '. ' + risky + ' of ' + cis.length + ' check-ins reported At risk or Off track. Latest update: “' + last.narrative + '” ' +
            (last.status === 'OnTrack' || last.status === 'Completed' ? 'Momentum is positive; keep the current cadence.' : 'Recommend agreeing a recovery plan and confirming resources at the next 1:1 or department review.'),
        }];
      }
    } else if (feature === 'digest') {
      var sc = digestScope();
      var ins = insights(sc.items);
      out = [{ title: 'Weekly digest for ' + sc.label, body: ins.headline, insights: ins }];
    }
    return new Promise(function (resolve) { setTimeout(function () { resolve(out); }, 700); });
  }
  /** Canned description writer used by the "Write with AI" button on the goal form. */
  function aiDescribe(title, level) {
    var t = (title || '').replace(/\.$/, '');
    if (!t) return '';
    var lvl = (LEVEL_LABELS[level] || 'goal').toLowerCase();
    return 'This ' + lvl + ' aims to ' + t.charAt(0).toLowerCase() + t.slice(1) + '. Success is measured through regular check-ins against an agreed baseline and target, with risks and blockers raised early so the owner can get help. It supports the division’s priorities for ' + currentCycle().name + '.';
  }
  /** Very small "chatbot" parser: turns a sentence into a proposed goal. */
  function aiParseGoal(text) {
    var t = text.trim();
    var nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    var pctMatch = /%|percent/i.test(t);
    var below = /\b(below|under|less than|at most|no more than)\b/i.test(t);
    var above = !below && /\b(above|over|at least|more than|no less than)\b/i.test(t);
    var reduce = /reduce|cut|lower|decrease/i.test(t);
    var mt = 'Numeric', baseline = 0, target = nums.length ? nums[nums.length - 1] : 1, unit = pctMatch ? '%' : '';
    if (/^\s*(finish|complete|approve|sign|launch|publish|earn)\b/i.test(t) && nums.length === 0) { mt = 'Binary'; target = 1; }
    else if (above && /keep|stay|maintain/i.test(t)) { mt = 'StayAbove'; baseline = target * 0.98; }
    else if (below && /keep|stay|maintain/i.test(t)) { mt = 'StayBelow'; baseline = target * 1.3; }
    else if (reduce && nums.length >= 2) { baseline = nums[0]; target = nums[1]; }
    else if (reduce && nums.length === 1 && pctMatch) { mt = 'Percentage'; baseline = 0; target = nums[0]; }
    else if (pctMatch) mt = 'Percentage';
    var unitMatch = t.match(/\d+(?:\.\d+)?\s*(km|minutes|min|days|substations|MW|transformers|circuits|jobs|tasks)/i);
    if (unitMatch) unit = unitMatch[1];
    var title = t.replace(/^(please\s+)?(create|add|make|set( up)?)\s+(a|an|me a)?\s*(goal|okr|key result|objective)\s*(to|for)?\s*/i, '');
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return { title: title.replace(/\.$/, ''), measurementType: mt, baseline: Math.round(baseline * 100) / 100, target: target, unit: unit, level: /objective/i.test(t) ? 'Objective' : (currentUser().role === 'Employee' ? 'Personal' : 'KeyResult') };
  }
  function createObjectiveWithKrs(objFields, krs) {
    var obj = createOkr(objFields, true);
    var created = [obj];
    if (can.create('KeyResult')) {
      krs.forEach(function (k, i) {
        created.push(createOkr({ level: 'KeyResult', parentId: obj.id, title: k.title, description: '', ownerId: obj.ownerId, departmentId: obj.departmentId, teamId: null, visibility: 'Public',
          measurementType: k.measurementType, unit: k.unit, baseline: k.baseline, target: k.target, weight: i === 0 ? 40 : 30, startDate: obj.startDate, dueDate: obj.dueDate, labels: obj.labels || [] }, false));
      });
    }
    return created;
  }

  // ---------------------------------------------------------------- CSV and Excel export
  function cellText(v) { return String(v === null || v === undefined ? '' : v); }
  function toCsv(rows, columns) {
    var cell = function (v) {
      var s = cellText(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var lines = [columns.map(function (c) { return cell(c.label); }).join(',')];
    rows.forEach(function (r) { lines.push(columns.map(function (c) { return cell(c.value(r)); }).join(',')); });
    return lines.join('\r\n');
  }
  function downloadBlob(filename, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function downloadCsv(filename, csv) { downloadBlob(filename, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); }

  // Minimal .xlsx writer (stored ZIP + SpreadsheetML), so "Export to Excel" needs no library.
  var CRC_TABLE = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var u16 = function (v) { return [v & 255, (v >>> 8) & 255]; };
    var u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(local), name, data);
      central.push([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)), name);
      offset += local.length + name.length + data.length;
    });
    var cdSize = 0;
    central.forEach(function (c, i) { if (i % 2 === 0) { parts.push(new Uint8Array(c)); cdSize += c.length; } else { parts.push(c); cdSize += c.length; } });
    parts.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0))));
    return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function xml(s) { return cellText(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function downloadXlsx(filename, sheetName, rows, columns) {
    var colRef = function (i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    var rowXml = function (vals, r, style) {
      return '<row r="' + r + '">' + vals.map(function (v, i) {
        var ref = colRef(i) + r;
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + (style ? ' s="1"' : '') + '><v>' + v + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"' + (style ? ' s="1"' : '') + '><is><t xml:space="preserve">' + xml(v) + '</t></is></c>';
      }).join('') + '</row>';
    };
    var body = rowXml(columns.map(function (c) { return c.label; }), 1, true) + rows.map(function (r, i) { return rowXml(columns.map(function (c) { return c.value(r); }), i + 2, false); }).join('');
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
      columns.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 18) + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>' + body + '</sheetData><autoFilter ref="A1:' + colRef(columns.length - 1) + (rows.length + 1) + '"/></worksheet>';
    downloadBlob(filename, zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xml(sheetName.slice(0, 31)) + '" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'' + xml(sheetName.slice(0, 31)) + '\'!$A$1:$' + colRef(columns.length - 1) + '$' + (rows.length + 1) + '</definedName></definedNames></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF007A3D"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
      { name: 'xl/worksheets/sheet1.xml', data: sheet },
    ]));
  }

  // ---------------------------------------------------------------- misc
  function param(name) { return new URLSearchParams(window.location.search).get(name); }

  window.OKR = {
    db: db, asOf: asOf, prefs: prefs, setPref: setPref, save: save, resetDemo: resetDemo, now: now,
    ROLES: ROLES, ROLE_LABELS: ROLE_LABELS, PERSONAS: PERSONAS, LEVELS: LEVELS, ALL_LEVELS: ALL_LEVELS, LEVEL_LABELS: LEVEL_LABELS,
    STATUSES: STATUSES, STATUS: STATUS, MEASUREMENT_TYPES: MEASUREMENT_TYPES, MEASUREMENT_LABELS: MEASUREMENT_LABELS,
    APPROVAL_STATES: APPROVAL_STATES, REQUEST_TYPES: REQUEST_TYPES, REQUIRABLE_FIELDS: REQUIRABLE_FIELDS, PERIODS: PERIODS,
    CLOSED_STATES: CLOSED_STATES, CONNECTION_TYPES: CONNECTION_TYPES, IMPORT_COLUMNS: IMPORT_COLUMNS, LABEL_COLOURS: LABEL_COLOURS,
    user: user, people: people, dept: dept, team: team, okr: okr, label: label, connection: connection, currentUser: currentUser,
    cycle: cycle, activeCycle: activeCycle, currentCycle: currentCycle,
    children: children, childIndex: childIndex, ancestors: ancestors, descendants: descendants, levelConfig: levelConfig,
    parentLevel: parentLevel, parentLevelsFor: parentLevelsFor, childLevel: childLevel, levelOrder: levelOrder, tasksFor: tasksFor,
    managerOf: managerOf, managerChain: managerChain, directReports: directReports, allReports: allReports, isManagerOf: isManagerOf, owns: owns,
    measuredProgress: measuredProgress, expectedProgress: expectedProgress, suggestStatus: suggestStatus, isStay: isStay,
    isOverdue: isOverdue, isStale: isStale, isDueSoon: isDueSoon, flags: flags, weightShare: weightShare, countsInRollup: countsInRollup,
    daysSince: daysSince, previewRollup: previewRollup, recalcAll: recalcAll,
    inPeriod: inPeriod, periodLabel: periodLabel, cycleOkrs: cycleOkrs, myGoals: myGoals, teamGoals: teamGoals, can: can,
    esc: esc, fmtDate: fmtDate, fmtDateTime: fmtDateTime, fmtShort: fmtShort, fmtTime: fmtTime, fmtWeekday: fmtWeekday, fmtRelative: fmtRelative,
    fmtValue: fmtValue, fmtTarget: fmtTarget, fmtNumber: fmtNumber, pct: pct,
    avg: avg, countByStatus: countByStatus, progressByDepartment: progressByDepartment, checkInsPerWeek: checkInsPerWeek, checkInsFor: checkInsFor,
    feed: feed, insights: insights, digestScope: digestScope,
    addCheckIn: addCheckIn, addComment: addComment, createOkr: createOkr, updateOkr: updateOkr, deleteOkr: deleteOkr, requestApproval: requestApproval, decide: decide,
    setTaskDone: setTaskDone, addTask: addTask, syncNow: syncNow, syncConnection: syncConnection, linkedItems: linkedItems,
    myNotifications: myNotifications, unreadCount: unreadCount, markRead: markRead, markAllRead: markAllRead, pendingForMe: pendingForMe,
    myPrefs: myPrefs, setMyPrefs: setMyPrefs,
    myMeetings: myMeetings, meeting: meeting, suggestedGoals: suggestedGoals, createMeeting: createMeeting, updateMeeting: updateMeeting,
    updateConfig: updateConfig, setConfigValue: setConfigValue, updateLevel: updateLevel, addLabel: addLabel, removeLabel: removeLabel,
    saveTemplate: saveTemplate, removeTemplate: removeTemplate, addCycle: addCycle, renameCycle: renameCycle, closeCycle: closeCycle,
    addRoleAssignment: addRoleAssignment, removeRoleAssignment: removeRoleAssignment, createApiCredential: createApiCredential,
    revokeApiCredential: revokeApiCredential, logExport: logExport,
    parseCsv: parseCsv, validateImport: validateImport, importOkrs: importOkrs,
    aiSuggest: aiSuggest, aiDescribe: aiDescribe, aiParseGoal: aiParseGoal, createObjectiveWithKrs: createObjectiveWithKrs,
    toCsv: toCsv, downloadCsv: downloadCsv, downloadXlsx: downloadXlsx, param: param,
  };

  recalcAll(db.okrs);
})();
