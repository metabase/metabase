# Workload Visualizer — Design Spec

**Date:** 2026-05-12
**Status:** POC / design approved
**Scope:** New admin page under the existing Introspector umbrella, showing a heatmap of scheduled background work so admins can spot stacked-up hours and reschedule. View-only in v1.

## Why this exists

Metabase admins on busy instances regularly want to answer "what is my instance spending time on?" Today there's no central view — `task_history` is queryable but per-task, Quartz schedule state is opaque, and the question "is tomorrow at 2am going to be rough?" requires combing through individual entity settings.

This spec adds a single admin page that aggregates *all* background work — DB sync, transform jobs, subscriptions/alerts, persisted-model refreshes, system cleanup — into a 7-day × 24-hour heatmap. Click any cell to see what's in that hour.

This is the Workload area of the broader Introspector vision. The Content area (broken/stale/unreferenced cards & dashboards & transforms) is being built in parallel and shares the same `/admin/introspector/*` URL prefix.

## What ships in v1

- A new admin page at **`/admin/introspector/workload`**.
- 7-day × 24-hour heatmap grid. Each cell shows the **count of sub-operations** scheduled in that hour. Color scale auto-adjusts to the instance.
- **Forecast** mode (next 7 days, default) and **History** mode (last 7 days), both computed from Quartz cron projection — *no `task_history` dependency*.
- Click a cell → table expansion below the grid listing every job scheduled in that hour, with cron, fire-time, and a Reschedule link that **deep-links to the entity's existing settings page** (no in-place editing in v1).
- Filter chips: job type (sync, transform-job, notification, persisted-refresh, other), database scope.
- Admin-only at the route level. POC: no premium-feature gate.

## Definitions

- **Sub-operation:** the leaf-level unit a Quartz trigger produces when it fires. A DB sync of 1000 tables produces 1000 sub-operations. A transform job with 10 transforms produces 10. A notification produces *N* (see Section "Weight function").
- **Trigger:** a Quartz `org.quartz.Trigger`. Each trigger is bound to a job; one job can have many triggers.
- **Fire:** a single scheduled invocation of a trigger.
- **Bucket / Cell:** one (day, hour) pair in the heatmap grid.

## Architecture

### Data flow

```
Browser                                  Backend                                   In-process state
───────                                  ───────                                   ────────────────
GET /admin/introspector/workload
   │
   ├─► RTK: getWorkloadGridQuery({ from, to, types, db })
   │       GET /api/ee/introspector/workload/grid?…
   │                                     ├─► (workload/grid from to)            ──► Quartz Scheduler
   │                                     │     ├─ enumerate triggers                  .getTriggerKeys()
   │                                     │     ├─ project each cron in [from..to)     CronExpression
   │                                     │     │                                       .getNextValidTimeAfter
   │                                     │     ├─ (weight-for job-type entity-id)
   │                                     │     │     └─► entity-state lookups        report_card, transform, etc.
   │                                     │     └─ sum into hour buckets
   │                                     ◄── { cells: [{day, hour, weight, by_type}…], scale_max }
   │
   │  Grid renders
   │
   └─► (user clicks a cell)
       RTK: getWorkloadSlotQuery({ from, to })
            GET /api/ee/introspector/workload/slot?from=…&to=…
                                                ├─► (workload/jobs-in-window from to)
                                                ◄── [{type, entity_name, cron, fire_at,
                                                     weight, settings_url}…]
       Expansion renders
```

### Module layout

**Backend:** `enterprise/backend/src/metabase_enterprise/introspector/workload/`

| File          | Responsibility                                                                  |
|---------------|---------------------------------------------------------------------------------|
| `quartz.clj`  | Wraps `org.quartz.Scheduler`. `(all-triggers)`, `(project trigger from to)`, `(jobs-in-window from to)`. |
| `weights.clj` | The `weight-for` multimethod. One `defmethod` per job-type.                      |
| `api.clj`     | Two endpoints: `GET /grid` and `GET /slot`.                                      |

**Frontend:** `enterprise/frontend/src/metabase-enterprise/introspector/workload/`

| File                     | Responsibility                                              |
|--------------------------|-------------------------------------------------------------|
| `index.tsx`              | Plugin registration (admin nav + route).                    |
| `routes.tsx`             | Sub-routes for `/admin/introspector/workload`.              |
| `WorkloadPage.tsx`       | Outer shell: range toggle, filter chips, layout.            |
| `WorkloadGrid.tsx`       | 7×24 cell grid + color-scale legend.                        |
| `SlotExpansion.tsx`      | Table of jobs in the focused cell.                          |
| `useWorkloadParams.ts`   | URL ↔ state (range, filters, focused slot).                 |

This sits beside the existing `introspector/content/` (backend) and the flat `introspector/{tabs,components}/*` (frontend) without modifying them.

### URL shape

```
/admin/introspector/workload                                  # default → forecast
/admin/introspector/workload?range=history
/admin/introspector/workload?range=forecast&types=sync,transform-job&db=42
/admin/introspector/workload?range=forecast&slot=2026-05-13T02   # cell focused → expansion shown
```

All state is in the querystring. Refresh-safe, shareable, browser back/forward works.

### Range semantics

- `range=forecast` → server uses `from = now`, `to = now + 7 days`.
- `range=history`  → server uses `from = now - 7 days`, `to = now`.
- The backend accepts arbitrary `from`/`to` (UTC ISO-8601); the FE only ever sends one of the two range presets. Custom ranges can come later for free.

## The weight function (load-bearing)

A `defmulti` in `weights.clj` keyed on `job-type`. Each background-job kind owns its own logic for "how many sub-operations would I produce on a single fire?"

```clojure
(defmulti weight-for
  "Expected number of sub-operations a trigger will produce on one fire.
   Returns >= 1 (a job that fires is at least 1 unit of work)."
  (fn [job-type _entity-id] job-type))

(defmethod weight-for :sync [_ db-id]
  (max 1 (or (t2/count :model/Table :db_id db-id :active true :visibility_type nil) 1)))

(defmethod weight-for :transform-job [_ job-id]
  (max 1 (or (t2/count :model/TransformJobTransformTag :job_id job-id) 1)))

(defmethod weight-for :persisted-refresh [_ db-id]
  (max 1 (or (t2/count :model/PersistedInfo :database_id db-id :state "persisted") 1)))

(defmethod weight-for :notification [_ pulse-id]
  ;; v1 default: count of enabled channels (one delivery per channel).
  ;; Decision deferred — tune after dogfooding.
  (max 1 (or (t2/count :model/PulseChannel :pulse_id pulse-id :enabled true) 1)))

(defmethod weight-for :default [_ _] 1)
```

### Trigger → (job-type, entity-id) parsing

```clojure
(defn parse-trigger
  [^org.quartz.Trigger trigger]
  (let [jk    (.getJobKey trigger)
        group (.getGroup jk)
        data  (.getJobDataMap trigger)]
    (cond
      (= group "metabase-sync")          {:type :sync              :id (some-> data (.get "db-id") long)}
      (= group "transforms.scheduling") {:type :transform-job     :id (some-> data (.get "job-id") long)}
      (= group "notification-send")     {:type :notification      :id (some-> data (.get "notification-id") long)}
      (= group "PersistRefresh")        {:type :persisted-refresh :id (some-> data (.get "db-id") long)}
      :else                              {:type :other             :id nil})))
```

The group strings are placeholders pending implementation-time grep — actual Quartz group conventions live in each domain's scheduling code. This map is the single source of truth for "what kind of work is this trigger doing?" and is the natural extension point for surfacing additional background-job types later (semantic search re-indexing, audit-app aggregation, dependency backfill).

## Projection algorithm

```clojure
(defn project
  "Return a seq of {:fire-at ZonedDateTime :weight long :trigger Trigger} for a trigger's
   fires in the half-open interval [from, to). For cron-style triggers, walks
   CronExpression in a loop. For simple-schedule triggers, uses
   getNextFireTime/getPreviousFireTime as appropriate."
  [^Trigger trigger ^Instant from ^Instant to]
  ;; cron path:
  ;;   (loop [t from, acc []]
  ;;     (let [next (.getNextValidTimeAfter cron t)]
  ;;       (if (or (nil? next) (>= (count acc) 2000) (.isAfter (.toInstant next) to))
  ;;         acc
  ;;         (recur (.toInstant next)
  ;;                (conj acc {:fire-at next, :weight (weight-for type entity-id), :trigger trigger})))))
  )
```

**Sanity cap of 2000 fires per trigger** — a `* * * * * ?` trigger would otherwise enumerate 604,800 fires per week per trigger. The cap is high enough to cover any reasonable cron (a once-per-minute trigger over 7 days is 10,080 — over the cap, but it's also a misconfigured trigger and we'll log a warning). Future work could add a "this trigger is too frequent to enumerate" pill in the slot view.

## API contracts

### `GET /api/ee/introspector/workload/grid`

**Query params:**
- `from` (ISO-8601 UTC, required)
- `to`   (ISO-8601 UTC, required)
- `types` (comma-separated, optional) — restrict to these job types
- `db`    (db-id, optional) — restrict to triggers for this database

**Response:**
```json
{
  "cells": [
    { "day": "2026-05-13", "hour": 2, "weight": 14, "by_type": { "sync": 6, "transform-job": 4, "notification": 3, "other": 1 } },
    ...
  ],
  "scale_max": 14,
  "scheduler_status": "running"
}
```

`scheduler_status` is `"running"` or `"stopped"` — lets the FE surface a banner if the Quartz scheduler isn't active (test env, embedded mode).

### `GET /api/ee/introspector/workload/slot`

**Query params:** same `from`/`to`/`types`/`db`, but `from`/`to` define a single hour.

**Response:**
```json
[
  {
    "type": "sync",
    "entity_id": 42,
    "entity_name": "Snowflake prod",
    "cron": "0 0 2 * * ?",
    "fire_at": "2026-05-13T02:00:00Z",
    "weight": 6,
    "settings_url": "/admin/databases/42"
  },
  ...
]
```

`settings_url` is computed server-side per job-type so the FE just renders an anchor. Future: add `human_schedule` ("daily at 2am UTC") as a separate field.

## Frontend behavior

### Loading / empty / error

- **Grid loading:** 7×24 skeleton cells.
- **Slot loading:** 6 skeleton table rows.
- **Empty cell** (no jobs): expansion shows "Nothing scheduled in this hour."
- **No focused slot:** expansion area shows hint "Click a cell to see the jobs scheduled in that hour."
- **Scheduler stopped:** Mantine `Alert` banner at top: "The Quartz scheduler isn't running on this instance — workload data is unavailable."
- **API error:** Mantine `Alert` with retry; grid stays empty.

### Color scale

6 buckets, auto-scaled per response:

| Bucket | Color     | Range (computed)            |
|--------|-----------|-----------------------------|
| 0      | `#f3f4f6` | empty                       |
| l1     | `#dbeafe` | 1 ≤ v ≤ max/5               |
| l2     | `#93c5fd` | max/5 < v ≤ 2·max/5         |
| l3     | `#3b82f6` | 2·max/5 < v ≤ 3·max/5       |
| l4     | `#1d4ed8` | 3·max/5 < v ≤ 4·max/5       |
| l5     | `#1e3a8a` | 4·max/5 < v ≤ max           |

Auto-scaling means a 10-table instance gets a useful spread and a 10,000-table instance does too — the legend reflects "*this* instance's relative load," not an absolute threshold.

## Edge cases

| Case                                                | Behavior                                                                                       |
|-----------------------------------------------------|------------------------------------------------------------------------------------------------|
| Quartz scheduler not running                        | API returns `scheduler_status: "stopped"`; FE shows banner; grid empty.                        |
| Trigger fires more than 2000 times in window        | Capped at 2000; warning logged. Slot view marks the trigger row as "(rate-limited)".           |
| Trigger has no cron (simple-schedule one-shot)      | Use `getNextFireTime`/`getPreviousFireTime` chain instead of CronExpression projection.        |
| Trigger fires exactly at `to`                       | Excluded — `[from, to)` half-open. Prevents double-count between adjacent requests.            |
| Weight lookup for deleted entity                    | `weight-for` returns 1 (max with fallback). Trigger still appears in slot view as "(orphaned)". |
| User changes range/filter while slot is focused     | Slot URL param stays; if no jobs match the new filters in that slot, expansion shows empty.    |

## Risks

| Risk                                                                     | Mitigation                                                                       |
|--------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| Cron projection cost on huge instances                                   | Per-trigger cap (2000 fires) + overall response cap. Profile with 500+ triggers. |
| Trigger group string mismatch (parse-trigger returns `:other`)           | All `:other` triggers still counted (weight 1) so nothing is invisible. Will be visible in slot view by group name; allows incremental coverage as we identify groups. |
| Weight function divergence from real-world cost                          | Decision-by-defmethod; each can be tuned independently. Notification weight already flagged for post-dogfood revision. |
| Quartz API blocking under load                                           | `getTriggerKeys` + `getTrigger` are in-memory ops on the scheduler context. No DB query. Safe. |
| Half-open interval confusion at the day boundary across DST              | We use UTC throughout. DST is a display-only concern; backend math is timezone-agnostic.       |

## Testing (POC-sized)

- **Unit tests** for `weight-for` (one assertion per defmethod, with mocked counts).
- **Unit test** for `parse-trigger` covering each known group plus `:other`.
- **Integration test** that seeds 3 triggers with different crons and asserts the grid response shape + bucket math.
- **No FE tests** for POC (matches the foundation Introspector's no-test stance).

## What's out of scope for v1

- **`task_history` integration** (real failure / duration data) — possible v2 add; doesn't invalidate v1.
- **In-place rescheduling** — view-only in v1; deep-links to entity settings.
- **Drag-to-reschedule** — far-future enhancement.
- **Sub-hour granularity** — heatmap is hourly; a "zoom in to 5-minute buckets" mode could come later.
- **Historical comparison** ("this week vs last week") — would benefit from a materialized snapshot table; not v1.
- **Premium gating** — POC; gate later if productizing.
- **Telemetry** — single `workload/viewed` event; expand when GA.

## Open follow-ups

- Verify the actual Quartz group strings during implementation (`parse-trigger` placeholders).
- Confirm `:notification` weight choice with PM / via dogfood data.
- Decide whether to surface `:other`-typed triggers explicitly or roll them into the grid count silently.
