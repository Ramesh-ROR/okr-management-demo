# Rebuilding the OKR demo as a Power Apps code app: feasibility

**Purpose:** decide how much of this demo can be built as a Power Apps **code app** (React + TypeScript + Vite on the Power Platform), what needs other Microsoft components, and what to prove first.
**Basis:** Microsoft Learn documentation for code apps, read on 17 Nov 2026 (links at the end). Items the documentation does not cover are marked **verify in a spike**.

## Summary

- **About 80% of the demo can be built in the code app itself, on Dataverse.** That covers all the goal screens, roll-ups, check-ins, approvals, 1:1 meetings, people/org chart, reports, admin settings, import and Excel export.
- **About 15% needs companion components, all inside Microsoft 365 or the Power Platform:**
  - Power Automate cloud flows: reminders, Teams adaptive cards, email, data sync from Power BI, Excel, Planner and To Do.
  - A Copilot Studio agent: AI suggestions, the weekly digest, the Teams chatbot.
- **About 5% is not yet documented:** hosting the code app as a Teams tab. Prove it in a spike before promising "the app inside Teams".
- **Removed from the demo** because code apps can't provide them:
  - the side panel inside a Teams meeting, which needs a full Teams app;
  - a Power BI report embedded in the app, since `PowerBIIntegration` is not supported.

  Reporting stays in the app's own Reports page. Power BI is still used as a *data source* for key-result values, through a flow.

This works as a plan provided the reminders, cards and AI run outside the app, and security is enforced in Dataverse rather than in the browser.

## Target architecture

```
                 ┌─────────────────────────── Microsoft 365 / Power Platform tenant ───────────────────────────┐
 People ──► Code app (React + TS, @microsoft/power-apps)  ──►  Dataverse (goals, check-ins, meetings, config)    │
            • all screens in this demo                         • security roles, business units, teams          │
            • calls Dataverse + connectors as the user         • custom API: roll-up recalculation (C# plug-in) │
            • calls instant flows (Power Apps trigger)         • auditing                                       │
                                                                                                                 │
 Teams / Outlook ◄── Power Automate (scheduled + automated flows) ◄── Dataverse triggers / schedules             │
            • reminder adaptive cards, approvals, digest, email • Power BI query / Excel / Planner / To Do sync   │
                                                                                                                 │
 Teams chat ◄── Copilot Studio agent (AI drafting, digest, chatbot) ── reads/writes Dataverse                    │
 Entra ID ──► Office 365 Users connector (profile, manager, direct reports)                                     │
                 └───────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Feature by feature

Ratings:
- ✅ **Code app + Dataverse.** Built in the app, documented as supported.
- 🔷 **Plus Power Automate.** Runs as a cloud flow next to the app.
- 🔶 **Plus another component.** Copilot Studio.
- ⚠️ **Verify in a spike.** Likely, but not documented for code apps.

| Demo feature | Rating | How in production |
|---|---|---|
| Goal hierarchy (company goal → objective → key result → initiative → action), individual goals, alignment | ✅ | `dtp_okr` table with a self-referencing parent lookup and choice columns for type and status. CRUD through the generated Dataverse services (`create/get/getAll/update/delete`). |
| Tree, list, people and feed views; filters by label and progress range; My goals / My team / All | ✅ | `getAll` with `select`, `filter`, `orderBy`, `top` and paging. Filter, sort and top are delegated. Large trees load level by level. |
| Weighted roll-up and automatic status | ✅ + 🔷 | Preview in the browser, exactly as `core.js` does now. The saved result is recalculated server-side by a **Dataverse custom API / plug-in** (`dtp_RecalculateRollup`), called from the app (Dataverse actions and functions are supported) and from flows. This keeps reports correct when values arrive from flows. |
| Progress types: number, %, AED, milestones, stay above/below, done/not done, task roll-up | ✅ | Choice column plus the same formulas as `measuredProgress()`. The admin list of allowed types lives in a config table. |
| Labels, co-owners | ✅ ⚠️ | N:N relationships (`dtp_okr_label`, `dtp_okr_coowner` to `systemuser`). The docs say lookups are supported and a dedicated lookup guide is "coming soon"; polymorphic lookups are not supported. **Verify N:N associate/disassociate in a spike.** |
| Private / department-only goals | ✅ ⚠️ | Dataverse row security: user-owned records, business units per department, owner teams, and record sharing for co-owners and managers. The code-app docs do not describe security behaviour. **Verify that queries are filtered by the user's security roles.** Never rely on the hidden UI. |
| Templates, duplicate, cycle close (carry over / close / drop) | ✅ | Config tables. For cycle close across thousands of rows, use a custom API or flow rather than many browser calls. |
| Bulk import from Excel | ✅ | Parse the file in the browser (an npm package such as SheetJS, or CSV as in the demo), validate, then create rows. The Excel Online connectors are **not supported** in code apps, so don't read the file through a connector. |
| Export to Excel / CSV, print | ✅ | Client-side, as in the demo (`downloadXlsx`). |
| Check-in form with roll-up preview | ✅ | As in the demo, then a `dtp_checkin` row plus the roll-up custom API. |
| Approvals (role or line-manager routing), change requests | ✅ | `dtp_approval` table. The manager comes from the Office 365 Users connector or `systemuser.parentsystemuserid`. |
| Notifications inbox | ✅ | `dtp_notification` rows written by plug-ins and flows. |
| Check-in reminders in Teams (adaptive cards answered in chat) | 🔷 | A **scheduled cloud flow** reads the reminder policy and each person's preferences, then posts an adaptive card ("post and wait for a response") through the Teams connector and writes the answer to Dataverse. Scheduled flows can't be triggered from a code app (only instant flows with the Power Apps trigger can), but they don't need to be. |
| Approval cards in Teams | 🔷 | A flow triggered when a `dtp_approval` row is created, using the Approvals or Teams connector, which writes the decision back. |
| Reminder email (Outlook) | 🔷 | Same flow, Office 365 Outlook connector. |
| AI: draft objective + key results, suggest key results, summarise check-ins, "Write with AI" | 🔶 | A **Copilot Studio** agent called from the app through the Copilot Studio connector (`ExecuteCopilotAsyncV2`), which is documented for code apps. Alternatively, an AI Builder prompt inside an instant flow called from the app. |
| AI agent weekly digest, drifting and stalled goal alerts | 🔶 🔷 | A scheduled flow computes the insights (the rules in `insights()`), optionally asks Copilot Studio or AI Builder to write the summary, and posts it to Teams. |
| Chatbot in Teams that creates goals | 🔶 | A Copilot Studio agent published to Teams, with an action that writes to Dataverse. Approval rules still apply. |
| Planner / To Do tasks driving progress | 🔷 ⚠️ | Flows on the Planner and To Do connectors keep a `dtp_task` table in sync. Calling Planner directly from the app is likely ("all connectors are supported except Excel") but not documented: **verify**. |
| Automatic key-result values from a Power BI dataset, an Excel file on SharePoint, or a REST API | 🔷 | Scheduled flows:<br>• Power BI: "Run a query against a dataset".<br>• Excel: the Excel Online connector *in the flow*.<br>• REST: HTTP action (premium) or a custom connector.<br>Each writes a check-in by a service account and then calls the roll-up API. |
| People page / org chart, My team | ✅ | Office 365 Users connector: profile and photo are documented. Manager and direct reports are connector operations, so **verify them in a spike**. Cache the results in Dataverse for large organisations. |
| 1:1 meetings, agenda goals, notes, action items | ✅ + 🔷 | Dataverse tables. Outlook/Teams invites via a flow (Office 365 Outlook "create event" with a Teams meeting). Action items to To Do via a flow. |
| Running the whole app as a Teams personal app or tab | ⚠️ | Not documented for code apps. Code apps can be embedded in an iframe on sites in the same tenant if the host origin is added to CSP `frame-ancestors`. **Spike: a Teams website tab or a Teams app manifest pointing at the app's play URL**, including sign-in. Fallback: open from a Teams link or the Power Apps portal. |
| Administration (goal-type names, statuses, progress types, labels, templates, cycles, reminders, permissions grid, notification switches, connections) | ✅ | Config tables in a solution. Permissions shown in the UI must be **mirrored in Dataverse security roles and plug-in validation**. |
| Audit log | ✅ | Dataverse auditing, plus a `dtp_auditevent` table for business events (as in the demo). |
| API credentials screen | ⚠️ | Don't store secrets in Dataverse; the docs warn against keeping sensitive data in the app. Use Entra ID app registrations and Dataverse application users, and show them read-only, or leave this to IT. |
| Right-to-left / Arabic, accessibility | ✅ | React; the demo already uses logical CSS properties. Add localisation (for example `react-intl`). |
| Mobile and offline | ⚠️ | Not documented for code apps (the CLI mentions a mobile app type). Treat mobile as the responsive web app and offline as out of scope until proven. |

## Dataverse tables (proposed)

| Table | Holds | Notes |
|---|---|---|
| `dtp_okr` | Every goal (all types, including individual goals) | parent lookup, type, measured-as, baseline/current/target, weight, progress, status, reported status, visibility, cycle, data source, closed state |
| `dtp_checkin` | Check-ins (manual, Teams card, automatic sync) | channel column (Web / Teams / Power BI…) |
| `dtp_task` | Planner / To Do tasks linked to goals | external id + source |
| `dtp_comment` | Comments, private flag | |
| `dtp_approval` | Approval requests and decisions | proposed change as JSON or columns |
| `dtp_meeting`, `dtp_meetingitem` | 1:1 meetings, talking points, action items | |
| `dtp_label` + N:N | Labels | |
| N:N `dtp_okr_coowner` | Co-owners → `systemuser` | |
| `dtp_cycle` | Cycles (planned / active / closed) | |
| `dtp_levelconfig`, `dtp_template`, `dtp_dataconnection`, `dtp_setting` | Configuration | one `dtp_setting` row per area or key |
| `dtp_notification`, `dtp_userpreference` | Inbox and personal reminder choices | |
| `dtp_auditevent` | Business audit trail | in addition to Dataverse auditing |

The demo's `assets/js/core.js` is the reference implementation. Each mutation in it maps to one Dataverse write plus audit and notification rows:
- `addCheckIn` → create `dtp_checkin`, then call `dtp_RecalculateRollup`.
- `decide` → update `dtp_approval` and `dtp_okr`.
- `closeCycle` → custom API `dtp_CloseCycle`.

## Build steps (current CLI)

1. In the Power Platform admin center, turn on **Power Apps code apps** for the environment (Settings › Product › Features).
2. `npx degit github:microsoft/PowerAppsCodeApps/templates/vite okr-app`, then `npm install -g @microsoft/power-apps-cli`.
3. `pa app init --display-name "OKR Management" --environment-id <id>`
4. Add data:
   - Dataverse tables: `pa app add data-source --connector dataverse --table dtp_okr` (repeat per table).
   - Connectors: `pa connection create --connector shared_office365users`, then `pa app add data-source --connector shared_office365users --connection-id <id>`.
5. Add instant flows: `pa app list-flows`, then `pa app add flow --flow-id <id>` (needs `@microsoft/power-apps` 1.1.1 or later).
6. Add Dataverse custom APIs: `pa app add dataverse-api --api-name dtp_RecalculateRollup`.
7. Move the demo's pages into React screens. Replace the `localStorage` store with the generated services; the business rules in `core.js` carry over almost unchanged.
8. `npm run build`, then `pa app push --solution-id <solution>`. Use connection references and environment variables for Dev → Test → Prod with Power Platform Pipelines.

## Constraints to plan for

- **Licensing:** every user needs Power Apps Premium, pay-as-you-go, an App Pass or auto-claim. HTTP actions in flows and custom connectors are premium too.
- **No Power Platform Git integration** for code apps. Keep the React source in your own Git repo and deploy with `pa app push` (service principal supported for CI/CD).
- **Not supported:**
  - the Power Apps app for Windows
  - SharePoint form integration
  - `PowerBIIntegration`
  - the Excel Online connectors
  - Secure Implicit Connections
  - Dataverse polymorphic lookups, FetchXML, alternate keys
  - schema changes from the app
- **Content Security Policy:** `connect-src` defaults to `'none'`, so calls to outside URLs need an admin CSP change. Prefer connectors.
- **Flows:** only solution-aware **instant** flows with the Power Apps trigger can be called from the app. Reminders, digests and syncs run as scheduled or automated flows on their own.
- **Security:** UI checks (`can.*` in `core.js`) are for the user experience only. Enforce the same rules with Dataverse security roles, business units, teams and plug-in validation.

## Spikes to run first (about 1–2 days each)

1. **Teams hosting:** the code app as a Teams personal app or website tab, with sign-in working.
2. **Row security:** private and department-only goals are filtered by Dataverse when queried from the code app; co-owner sharing works.
3. **Roll-up custom API:** a C# plug-in recalculates ancestors on check-in. Measure performance on about 5,000 goals.
4. **Connectors from the app:** Office 365 Users (manager, direct reports), Planner, Copilot Studio.
5. **Teams adaptive card flow:** post a card, wait for the response, write the check-in. Check throttling for 500+ people per reminder run.

## Sources

- [Code apps overview: status, licensing, limitations](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)
- [Architecture](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/architecture)
- [Connect to data and supported connectors](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-data)
- [Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)
- [Dataverse actions and functions](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function)
- [Call Power Automate flows](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-flows)
- [Copilot Studio connector](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-copilot-studio)
- [Embed in an iframe](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/embed-iframe)
- [Content security policy](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/content-security-policy)
- [ALM](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/alm)
- [Service principal CI/CD](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/use-service-principal)
- [CLI reference](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/reference/cli)
- [Retrieve context (current user)](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/retrieve-context)
- [Migrate to SDK v1.0](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/migrate-to-v1)
