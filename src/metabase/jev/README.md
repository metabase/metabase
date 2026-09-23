# Jev (TypeSafe System One)

Jev returns typed **judgments** — not text. You hand it a compact *state* plus a fixed set of
*candidates*, and it picks one (or scores it, or gives a probability), each with a calibrated
confidence. It is fast (~0.1–0.4s, ~1k tokens, fractions of a cent) and its confidence is
trustworthy — low when it is likely wrong — which makes it a fit for judgments that ride *inside*
an interaction loop, where a full LLM is too slow and too expensive.

The design discipline: **code owns a closed vocabulary of fully-configured options; the model only
selects.** Guidance lives in the candidate descriptions. This keeps output bounded by construction
(injection defense) and keeps planning-shaped decisions — when to stop, how to group — in code,
where Jev is documented to be weak.

## Layout

```
jev/
  client.clj        the pure client: ask / choice / noul, the jev-token setting, the HTTP call
  diagnostics.clj   request capture (client depends on it)
  api.clj           the /api/jev proxy + route composition — mounts everything under /api/jev
  apps/             everything that USES jev to do something
    tables.clj        semantic-type + data-sensitivity suggestions for a table's fields
    joins.clj         inferred join-edge suggestions between tables
    explorations.clj  ranking x-ray exploration candidates
    filters.clj       plain-English dashboard filters -> parameter values
    search.clj        reranking command-palette search results by intent
    saving.clj        save-time duplicate check + collection suggestion
    classify.clj      the Jev classify step for query transforms (+ its preview endpoint)
    create.clj        "New with Jev" (Cmd/Ctrl+J): question, dashboard or document; tables; then the plan
    usage.clj         collective "what people do on this table" shape model (endpoints)
    viz.clj           rank chart types for a query result (deterministic roles + Jev scoring)
    intent.clj        per-user + per-table intent model (event-bus taps + prediction)
    intent/
      store.clj         the trail + faceted preference counters (swappable backing)
      features.clj      decompose a query into value-free facets (shapes, not values)
```

`client` + `diagnostics` are the reusable primitive. Everything in `apps/` is an application of it,
and is prototype scaffolding — easy to delete.

## The backend client API (`metabase.jev.client`)

```clojure
(require '[metabase.jev.client :as jev])

;; ask: state + questions -> a result map. A failure is DATA, never a throw (branch on :ok).
(jev/ask <state> {<your-id> <question> ...})
;; => {:ok true  :answers {<your-id> <answer>} :usage {...} :model "..."}
;;    {:ok false :status <http-status> :error "..." :body <raw>}
```

- **`state`** — the facts Jev reasons from (a map/string/vector). One state, many questions: describe
  the situation once, then ask several independent things about it in a single call.
- **`questions`** — a map of *your* id → a question. Your ids come back as the answer keys; they are
  not sent to the model.

Question constructors (the three judgment shapes):

```clojure
(jev/choice instructions criteria)   ; pick ONE key from criteria {:k "description" ...}
                                     ;   answer: {:type "choice" :choice k :confidence c :probabilities {k p}}
(jev/noul   instructions)            ; probability the condition holds (0..1; ~0.5 = genuinely uncertain)
(jev/noul   instructions criteria)   ;   answer: {:type "noul" :noul p}
```

Example — one state, two questions:

```clojure
(jev/ask
  {:situation "company offsite, day 2, big presentation tomorrow 9am"}
  {:tonight (jev/choice "Sleep or socialize?"
                        {:sleep     "rest up for tomorrow"
                         :socialize "bond with the team"})
   :urgency (jev/noul   "Is being well-rested critical tomorrow?")})
```

The token comes from a **TypeSafe** connection in the admin AI settings provider list (or
`MB_LLM_TYPESAFE_API_KEY`), falling back to the `jev-token` setting (`MB_JEV_TOKEN`) and the legacy
`JEV_KEY` env var. It stays server-side and is never sent to the browser.

## The HTTP endpoints (for the frontend)

All mounted under `/api/jev` (require auth). The FE cannot call Jev directly without shipping the
token to the browser, so it goes through these.

| Method & path | What it does |
|---|---|
| `POST /api/jev/` | Dumb pass-through: forwards a raw `{state, questions, model?}` body to Jev and returns its answer. For prototyping any judgment without a new backend endpoint. |
| `GET  /api/jev/table/:id/suggestions` | Semantic-type + data-sensitivity suggestions for every field of a table, from sampled values. |
| `POST /api/jev/joins/suggestions` | Inferred join edges among the given source tables. |
| `POST /api/jev/classify/preview` | Run a Jev classify step over the first `limit` (default 20) rows of a query and return them, writing nothing. |
| `POST /api/jev/explorations/rank` | Rank a set of x-ray exploration candidates against a context. |
| `GET  /api/jev/usage/table/:id/shapes` | Collective, value-free "what people typically filter/aggregate/group here" starter chips. |
| `POST /api/jev/filters/dashboard/:id` | Plain-English text → values for the dashboard's parameters (closed candidate sets per parameter). |
| `POST /api/jev/filters/question/slots` | For a question's filterable columns: the few someone most likely filters by (the palette's rows). |
| `POST /api/jev/filters/question` | Plain-English text → filter values for a question's slots, plus any column the text mentions. |
| `POST /api/jev/create/intent` | Question, dashboard or document, plus ranked candidate tables (single-table probability and per-table relevance). |
| `POST /api/jev/create/question` | For one table's columns: ranked filters, summary, grouping, time unit and chart type for a new question. |
| `POST /api/jev/create/dashboard` | For the chosen tables: which existing questions belong on a new dashboard or document (`kind`). Documents get copies — the document API clones embedded cards. |
| `POST /api/jev/search/rerank` | Rerank the caller's search results against the query's intent; pins a confident best match. |
| `POST /api/jev/saving/check` | For a draft question: an existing card that already answers it, and the collection it belongs in. |
| `POST /api/jev/usage/observe` | Feed the usage shape-model an MBQL query the caller ran/built (value-free facets only). |
| `POST /api/jev/viz/suggest` | Rank chart types for a query result (body: its `:cols` metadata). Roles derived deterministically; Jev scores each chart type against the structure. |

## What's implemented so far

- **Table suggestions** (`apps/tables`, FE `JevSuggestions`) — on the admin Table Metadata page,
  runs Jev over a table's fields and offers accept-able semantic-type + data-sensitivity suggestions,
  each tinted by Jev's confidence; accepting persists via `PUT /api/field/:id`.
- **Usage shape-model** (`apps/usage` + `apps/intent`) — a QP tap records the *value-free shape* of
  every query run (e.g. "date-range filter on a temporal field", "count", "group by month") into a
  per-user and per-table model. Never stores literal values (safe under sandboxing/tenancy). Surfaces
  as collective starter chips on the notebook data step (FE `TableUsageChips`), and as transfer-
  learning ("you like temporal filters → on this new table that's `ordered_at`").
- **Join inference** (`apps/joins`) — suggests join edges between tables from column shape.
- **Exploration ranking** (`apps/explorations`) — ranks x-ray next-steps.
- **Visualization suggestions** (`apps/viz`) — when a question returns, ranks the ~12 chart types by
  fit and highlights the good ones in the chart-type sidebar. Column roles (metric/dimension/temporal/
  geo) are derived *deterministically* from the result `:cols`; Jev only scores each chart against the
  compressed structure (score-each, not pick-one, run in parallel). Advisory: it rings/dims the picker,
  never changes the chart. (FE `ChartTypeOption` ring + `use-jev-viz-suggestions`.)
- **Classify transform** (`apps/classify`) — a query transform whose source carries `:jev-classify`
  judges every source row with Jev and writes the answers into the target table as real columns
  (`new-column`, `fill-empty` or `overwrite`). Such a transform dispatches as `:jev`
  (`transforms-base.interface/transform->transform-type`) and reuses the `:query` methods for
  everything but writing the target. Plain `table` targets only, capped at 5,000 rows.

All of it is prototype scaffolding: no caching, no cost limits, uncalibrated confidence shown but not
gated on. When a judgment settles into a real feature, promote it to a typed endpoint that assembles
its own state server-side.

## Where it's wired into the app

Backend:
- `metabase.api-routes.routes` — mounts everything under `/api/jev` (`+auth metabase.jev.api/routes`).
- `metabase.query-processor.middleware.process-userland-query` — a fire-and-forget tap after every
  successful query run calls `metabase.jev.apps.intent/observe-query!` (value-free facets only; via
  `requiring-resolve`, so the QP has no hard dependency on the jev module).

Frontend:
- `metadata/components/TableSection` — renders `<JevSuggestions>` on the admin Table Metadata page.
- `querying/notebook/components/DataStep` — renders `<TableUsageChips>` under the data step.
- `dashboard/containers/AutomaticDashboardApp/SuggestionsSidebar` — renders `<JevExplorations>` in the
  x-ray suggestions sidebar.
- `query_builder/.../ChartTypeSidebar` — fetches viz suggestions on result-load
  (`use-jev-viz-suggestions`) and rings/dims the chart-type picker by fit.
- `dashboard/components/JevDashboardFilterPalette` + `query_builder/.../JevFilterHeaderButton` — the Cmd/Ctrl+F
  plain-English filter palette (`querying/jev-filters`) for dashboards and questions. On a dashboard the same
  phrase also asks `/api/jev/dashboard/:id/focus`, offered as a "Focus cards" row; applying it re-flows the grid
  and shows a `<DashboardFocus>` chip (question, helpful filters, clear).
- `palette/hooks/useCommandPalette` — `useJevRerankedResults` reorders search results, `JevBestMatchBadge`.
- `common/components/SaveQuestionForm` — renders `<JevSaveHints>` (duplicate callout + collection chip).
- `api/jev.ts` (+ `api/jev-*.ts`) — the RTK Query slices all of the above call through.

Connections: [[metabase.jev.client]] keeps a keep-alive connection pool with a short connect timeout and one
retry, so in-loop calls stay at Jev's ~150-250ms instead of paying a fresh TCP/TLS connect each time.

Settings:
- The `typesafe` provider type (`metabase.llm.provider`) — configured like any other AI provider in admin
  settings; its key and base URL are what `metabase.jev.client` calls Jev with.
- `jev-token` (`metabase.jev.client`) — older fallback, settable over the API / `MB_JEV_TOKEN`, then the
  legacy `JEV_KEY` env var.

## A jev-ial note

We are contractually obligated to the bit:

- Getting the classification right is good **jev-dgment**.
- A wrong notification routed to a public channel would be **jev-astating**.
- The intent model gradually learning your habits is **jev-olution**.
- When it correctly declines a bad suggestion, that's **jev-nuine restraint**.
- Shipping without the confidence gate? A little **jev-il-may-care**.
- The whole endeavor: **je ne sais jev**.
