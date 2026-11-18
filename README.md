# OKR Management System – Transmission Power (demo)

A clickable demo of an OKR (Objectives and Key Results) and goal-management system, proposed by Ducont for the DEWA Transmission Power Division. Version 2 adds the goal-management features found in Microsoft 365-native tools such as Teamflect:
- individual goals
- new progress types
- automatic data feeds
- check-ins and approvals in Teams
- 1:1 meetings
- an AI agent
- templates, bulk import and cycle close

> **Demo environment with fictitious data – not an official DEWA system.**
> Every name, project and figure is made up. There is no backend, no login and no secrets.

**Live demo:** https://ramesh-ror.github.io/okr-management-demo/
**Rebuilding it in Power Apps:** see [docs/POWER-APPS-FEASIBILITY.md](docs/POWER-APPS-FEASIBILITY.md).

## How to open it

The demo is plain HTML, CSS and JavaScript. It needs no build step and no installation.
- **From disk:** double-click `index.html`.
- **From a web server:** host the folder on any static server.

Keep the folder structure as it is.

## Pages

| Page | File | What it shows |
|---|---|---|
| Home | `index.html` | KPIs, the AI agent's weekly digest, company goals (or *my goals* for employees), upcoming 1:1s, items needing attention, latest updates |
| Goals & OKRs | `explorer.html` | My goals / My team / All goals; Tree, List, People and Feed views; filters for type, department, status, owner, label, flag and progress range; Excel/CSV export; import |
| Goal detail | `okr.html?id=…` | Progress (including threshold KPIs), automatic data-source card with *Sync now*, Planner/To Do tasks, aligned individual goals, check-ins, private comments, approvals, activity, duplicate, delete |
| Create / edit | `okr-edit.html` | Templates, all goal types including individual goals, co-owners, labels, nine progress types, data source, task list, *Write with AI* |
| Bulk import | `import.html` | Excel template, upload or paste, per-row validation, then import |
| Check-in | `checkin.html` | Your goals, your team's, or everything you can update; the form handles done/not-done, threshold KPIs and auto-synced goals |
| 1:1 meetings | `meetings.html` | Manager/employee meetings with goals on the agenda, talking points, shared notes, action items, *complete and schedule next* |
| People | `people.html` | Org chart (simulated as synced from Entra ID) and each person's goals |
| Approvals | `approvals.html` | Routed by role, or to the line manager |
| Reports | `reports.html` | Executive summary, operational detail (Excel export), check-in compliance |
| Notifications | `notifications.html` | Inbox and personal reminder preferences (frequency, Teams or email) |
| Teams & Outlook | `teams.html` | Clickable mock-ups (actions update the demo data):<br>• check-in cards answered inside Teams chat<br>• approval cards<br>• the AI digest<br>• a chatbot that creates goals<br>• the reminder email<br>• the app as a Teams tab |
| Administration | `admin.html` | Goal-type names and approvals, progress types and status names, labels, templates, cycles, reminders, permissions grid, notification switches, data connections, roles, audit log, AI, API access, demo reset |
| Close a cycle | `cycle-close.html` | Carry over, close or drop each goal; the next cycle becomes active |

## Things to try

Use **View as** in the top bar to switch between the six roles:
- Executive – Samira Haddad
- VDO – Noura Rahimi
- Department Coordinator – Mariam Darwish
- OKR Champion – Priya Raman
- Employee – Khalid Mansoori
- Platform Administrator – Elena Marković

You can also add `?as=Employee` (or any role) to a URL.

1. **Employee → Teams & Outlook:** update two goals inside the Teams check-in card, then type *"Keep my overtime below 20 hours per month"* to the bot.
2. **OKR Champion → `ACT-09`:** tick a Planner task and watch the progress roll up.
3. **Department Coordinator → `KR1.2.4`:** a "stay above 99.95%" KPI fed by an API. Press *Sync now*.
4. **Department Coordinator → 1:1 meetings:** schedule a 1:1 with suggested goals, add a talking point, then complete it.
5. **Employee:** create a *private* individual goal. Switch to OKR Champion (it is hidden), then to Department Coordinator (the manager can see it).
6. **Platform Administrator → Administration › Permissions:** route approvals to line managers, then create a key result as the OKR Champion.
7. **Platform Administrator → Cycles › Close cycle:** carry FY2026 into FY2027. Reset the demo data afterwards.

## How progress is calculated

- **Reach a number, %, or AED:** progress = (current − baseline) ÷ (target − baseline), capped at 0–100%. This also works for decreasing targets.
- **Milestones:** done ÷ total. **Done / not done:** 0% or 100%. **Tasks:** tasks done ÷ all tasks.
- **Stay above / stay below:** 100% while the threshold is met. Otherwise, the share of the way from the starting value to the threshold. Status is On track when met, At risk when at least 80% of the way there, and Off track otherwise.
- **Roll-up:** Σ(child progress × weight) ÷ Σ(weights). Individual goals align without counting unless the owner chooses to count them. Weights can be switched off.
- **Status:**
  1. Completed at 100%.
  2. Off track once overdue.
  3. Otherwise, the owner's reported status if they set one.
  4. Otherwise, a suggestion from the gap to linear expected progress: up to 10 points behind is On track, up to 25 is At risk, more is Off track.

  Automatic status can be switched off.

The demo clock is fixed at **11 Nov 2026**.

## Where changes are stored

Changes are saved in the browser's `localStorage`. **Reset demo data**, in the footer or in Administration, restores the sample.

## Folder structure

```
*.html               one file per page (page-specific script at the bottom)
assets/css/styles.css
assets/js/data.js    fictitious sample data (window.OKR_SEED)
assets/js/core.js    data store, roll-up/status rules, permissions, AI rules, import, Excel export
assets/js/ui.js      page shell, components, SVG charts, dialogs, tabs, AI Assist panel
docs/POWER-APPS-FEASIBILITY.md
```

## Accessibility

- Skip link, landmarks and labelled controls.
- Error summaries and `aria-invalid` on fields with errors.
- Native `<dialog>` for modal dialogs.
- Keyboard-operable tabs and tree.
- Status shown by shape and text, not colour alone.
- Every chart has a "Show table" alternative.
- Supports reduced motion and forced colours.
- Right-to-left layout with `?dir=rtl`.

## Licence

MIT. Sample data is fictitious.
