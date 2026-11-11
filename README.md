# OKR Management System – Transmission Power (demo)

A clickable demo of an OKR (Objectives and Key Results) management system, proposed by Ducont for the DEWA Transmission Power Division.

> **Demo environment with fictitious data – not an official DEWA system.**
> Every name, project and figure is made up. There is no backend, no login and no secrets.

## How to open it

The demo is plain HTML, CSS and JavaScript. It needs no build step and no installation.

- **From disk:** double-click `index.html`. It works offline in Edge, Chrome or Firefox.
- **From a web server:** copy the whole folder to any static host (IIS, SharePoint document library, GitHub Pages, Azure Static Web Apps) and open `index.html`.

Keep the folder structure as it is: every page loads `assets/`.

## Pages

| Page | File | What it shows |
|---|---|---|
| Home | `index.html` | KPI tiles, goals at a glance, key results by status, progress by department, items that need attention, recent activity |
| OKR Explorer | `explorer.html` | The full hierarchy as an expandable tree or a flat list. Filter by text, level, department, status, owner and flag, then export to CSV |
| OKR detail | `okr.html?id=…` | Progress with the expected-progress line, details, children with weight shares, check-in history, comments, approvals and activity. Includes a "Request change" form |
| Create / edit | `okr-edit.html` | A form with validation that follows the level rules set in Administration, a live weight-share preview, and AI-assisted wording |
| Check-in | `checkin.html` | A list ordered by urgency. The form (`checkin.html?id=…`) suggests a status and shows a live roll-up preview up to the goal |
| Approvals | `approvals.html` | Requests waiting for you, all pending, decided and your own requests. Approve or reject them with a comment |
| Reports | `reports.html` | An executive summary, a filterable operational table with CSV export, and check-in compliance by department. Print or save as PDF |
| Notifications | `notifications.html` | Per-person notifications. Filter them, and mark them read or unread |
| Administration | `admin.html` | Levels and approvals, reminder policy, role assignments, audit log with CSV export, AI Assist switches, API credentials, and reset of the demo data |
| AI Assist | the button in the top bar | A side panel that drafts objectives, suggests key results and summarises check-ins. The suggestions are pre-written, and no data leaves the browser |

## Things to try

1. Use **View as** in the top bar to switch between the five roles. Each role sees a different set of screens and actions.
   - Executive – Samira Haddad
   - VDO – Noura Rahimi
   - Department Coordinator – Mariam Darwish
   - OKR Champion – Priya Raman
   - Platform Administrator – Elena Marković
2. As the **OKR Champion**, open *Check-in*, update `ACT-06`, and watch the roll-up preview recalculate `INI-03`, `KR1.1.3`, `O1.1` and goal `G1`.
3. As the **VDO**, open *Approvals* and approve or reject the new objective `O3.3`.
4. Use the **Cycle** selector to switch between FY2026 and its quarters (Q1–Q4).
5. Add `?dir=rtl` to any page URL to check the right-to-left layout.

## How progress is calculated

- **Measured items:** progress = (current − baseline) ÷ (target − baseline), capped at 0–100 %. This also works when the target is lower than the baseline. For milestone items, progress = current ÷ target.
- **Rolled-up items:** progress = Σ(child progress × weight) ÷ Σ(weights).
- **Status:**
  1. Completed at 100 %.
  2. Off track once the due date has passed.
  3. Otherwise, the owner's reported status if they set one.
  4. Otherwise, a suggestion from the gap to expected (linear) progress: up to 10 points behind is On track, up to 25 points behind is At risk, and anything more is Off track.
- **Stale:** a measured item with no check-in for longer than the stale period set in Administration (30 days by default).

The demo clock is fixed at **11 Nov 2026**, so the sample data always looks the same.

## Where changes are stored

Changes are saved in the browser's `localStorage` so that they carry across pages. This covers check-ins, comments, approvals, new items and settings. **Reset demo data** in the footer or under *Administration → Demo data* restores the original sample.

## Folder structure

```
index.html  explorer.html  okr.html  okr-edit.html  checkin.html
approvals.html  reports.html  notifications.html  admin.html
assets/
  css/styles.css     all styling (brand colour #007A3D in :root; logical properties for RTL)
  js/data.js         fictitious sample data (window.OKR_SEED)
  js/core.js         data store, roll-up and status rules, permissions, formatting, CSV
  js/ui.js           page shell, components, SVG charts, dialogs, tabs, AI Assist panel
  img/favicon.svg
```

Each page holds its own page-specific script at the bottom of the file.

## Accessibility

- A skip link, landmarks, and labelled form controls.
- Error summaries, with `aria-invalid` on the fields that have errors.
- Native `<dialog>` for modal dialogs.
- Keyboard-operable tabs and tree toggles.
- Status is never shown by colour alone: each status has a shape and a label.
- Every chart has a "Show table" alternative.
- Support for reduced motion and Windows high-contrast (forced colours).

## Licence

MIT. Sample data is fictitious.
