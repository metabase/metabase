# `dashboard_write` MCP v2 Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `dashboard_write` v2 MCP tool that creates and updates dashboards and applies an ordered list of 24 editor operations — cards, text, headings, links, iframes, actions, tabs, and parameters — as one atomic save.

**Architecture:** Functional core / imperative shell. A pure `compile-ops` folds the ops over freshly-read dashboard state into the app's own save payload (using negative ids as temp ids, the convention the frontend editor already uses); a thin tool namespace resolves ids, calls the existing `update-dashboard!` / `create-dashboard!` domain fns for permission inheritance and atomicity, and projects the result.

**Tech Stack:** Clojure, Malli (`metabase.util.malli.schema` as `ms`), Toucan 2, `metabase.lib` for query metadata, `clojure.test` + `metabase.test` (`mt`).

**Spec:** `docs/superpowers/specs/2026-07-21-dashboard-write-tool-design.md`

## Reuse Ledger

This tool is assembly, not invention. Almost everything it needs exists; several pieces are private and need exposing. **Before writing any helper, check this table.** If you find yourself implementing something not listed here, stop and search for it first.

| What you need | What already does it | State |
| --- | --- | --- |
| Save a dashboard + full layout, transactionally, with write-check | `dashboards-rest.api/update-dashboard!` (api.clj:1025) | private → **make public** (Task 1) |
| Create a dashboard with create-check | `POST /` body (api.clj:143-176) | inline → **extract** (Task 1) |
| Validate the compiled payload | `DashUpdates` (api.clj:1116), `UpdatedDashboardCard` (:888), `UpdatedDashboardTab` (:900) | private → **make public** (Task 1) |
| Create/update/delete dashcards by diff | `do-update-dashcards!` (api.clj:874) via `u/row-diff` | free via `update-dashboard!` |
| Parameter-mapping permission checks | `check-parameter-mapping-permissions` (api.clj:768), `check-updated-parameter-mapping-permissions` (:817), `existing-parameter-mappings` (:807) | **free** via `update-dashboard!` — do not reimplement |
| Tab create/update/delete + negative-id remap | `dashboard-tab/do-update-tabs!` (dashboard_tab.clj:105) | free via `update-dashboard!` |
| Tab `:position` from vector order | `update-dashboard!` `map-indexed` (api.clj:1074) | free — `move_tab` is a vector reorder |
| Delete cards on a removed tab | `update-dashboard!` filters by `deleted-tab-ids` (api.clj:1080) | free |
| Grid placement | `dashboards.autoplace/get-position-for-new-dashcard` (autoplace.clj:23) | **public**, use verbatim |
| Default card size per display type | `dashboards.constants/card-size-defaults` via autoplace's `[cards display-type]` arity | **public**, use verbatim |
| Virtual card settings (text, heading) | `dashboard-card/virtual-card-settings` (dashboard_card.clj:80) | **public**; **extend** for link/iframe/action (Task 4) |
| Normalize a JSON-shaped dashcard | `dashboard-card/from-parsed-json` (dashboard_card.clj:59) | **public** |
| Visualizer `columnValuesMapping` remap on clone | `update-colvalmap-setting` (api.clj:465) | private → make public if `duplicate_card` supports visualizer cards |
| Read model for "which dashcards is this parameter wired to" | `dashboard/dashboard->resolved-params` (dashboard.clj:376) | **public**, already used by `get_content` |
| Does this target resolve against this card? | `parameters.params/param-target->field-id` (params.clj:80) | **public** — nil means bogus |
| Filterable columns of a card's query (models/metrics/stages handled) | `params/filterable-columns-for-query` (params.clj:200), `card->filterable-columns-query` (:186) | private → **make public** (Task 7) |
| The `target` clause shape | `xrays…filters/filter-for-card` (filters.clj:74) — `[:dimension ref {:stage-number 0}]` | private → copy the one-liner |
| Field type → parameter type | `xrays…filters/filter-type-info` (filters.clj:92) | private → make public or copy |
| Name subscriptions broken by a parameter removal | `broken-subscription-data` (api.clj:989), `handle-broken-subscriptions` (:1013) | private → **make public + return findings** (Task 8) |
| Concise dashboard response shape | `content.clj` `dashcard-summary` (:253), `dashboard-parameters-summary` (:274) | private → **move to projections** (Task 2) |

**Explicitly NOT reusable** — verified, do not be tempted:

- `update-cards-for-copy` (api.clj:486, public) — for a same-dashboard duplicate, `id->new-card` is empty and the branch at api.clj:512 **silently drops every card-backed dashcard**. Take its remapping checklist (tab id, series, parameter_mappings, columnValuesMapping), not the function.
- `duplicate-tabs` (api.clj:456) — inserts rows directly; wrong layer for a payload compiler.
- `cards-to-copy` / `maybe-duplicate-cards` (api.clj:391, :433) — cross-collection *Card* duplication. `duplicate_card` clones the dashcard and points at the **same** `card_id`. Only relevant if you decide a dashboard-question-backed dashcard should clone its question; this plan decides **no**.
- `chain-filter/filterable-field-ids` (chain_filter.clj:851) — takes field ids, not cards; can't produce a target clause, knows nothing of template tags or multi-stage queries. That's linked filters, a different problem.
- `xrays…populate.clj` — a second, incompatible occupancy-grid packer. `autoplace` is the one kept in sync with the frontend.
- `metabot/tools/autogen_dashboard.clj` — despite the name it creates nothing, just returns an `/auto/dashboard/…` URL.

## Known Duplication (do not fix here)

`src/metabase/agent_api/api.clj:1284-1500` already implements an ordered dashcard-mutation compiler (`add`, `add_heading`, `add_text`, `update_text`, `remove`, `move`) behind the Agent API's `update_dashboard`. Our op set is a strict superset of its six, but it mutates the DB **op-by-op** (`create-dashboard-cards!` / `delete-dashboard-cards!` / `t2/update!`), so a mid-batch failure leaves a partial layout — the opposite of what this ticket asks for. It also has no tabs-CRUD, parameters, series, or `patch_dashcard`.

Decision: **build ours, converge later.** Borrow its *patterns* — per-tab collision grouping, autoplace state threading, per-op error indexing — not its mutation bodies. Do not modify `agent_api`. Note the duplication in the PR description and file a follow-up to migrate `agent_api/update_dashboard` onto the shared compiler, which also fixes its partial-write behavior.

## Global Constraints

- Base branch is `mcp-v2-foundation`. The worktree is already reset onto it.
- Every namespace gets `(set! *warn-on-reflection* true)` after the `ns` form.
- Kondo must pass with **0 errors AND 0 warnings**. Lint with `./bin/mage kondo <files>`, not `clj-kondo` directly.
- Never add `:clj-kondo/ignore`. `.clj-kondo/ratchets.edn` budgets it; fix the underlying warning instead.
- Optional args in a tool's Malli schema **must** be `[:maybe …]` — `registry/register-tool!` hard-fails at load time otherwise (`tools-manifest/assert-optional-fields-nullable!`).
- Tool arg schemas are `[:map {:closed true} …]`.
- Response property names are REST names verbatim, never renamed. camelCase warts in parameters (`isMultiSelect`, `filteringParameters`, `sectionId`) are preserved.
- All caller-facing failures go through `common/throw-teaching-error` (400) or `common/throw-not-found` (404). Never let a raw exception reach the client.
- Test `testing` strings reference `GHY-4147`.
- Docstrings state the contract (args, return, side effects, errors), not implementation. No caller lists, no ticket refs, no history.
- Run tests with `./bin/test-agent :only '[the.namespace]'`, or via `clj-nrepl-eval` if an nREPL is up (`clj-nrepl-eval --discover-ports`).
- Commit after each task. No `Co-Authored-By` / Claude attribution lines. Do not push.

---

## File Structure

| Path | Responsibility | Task |
| --- | --- | --- |
| `src/metabase/dashboards_rest/api.clj` | expose `create-dashboard!` / `update-dashboard!` as public domain fns | 1 |
| `src/metabase/mcp/v2/projections.clj` | gains the shared `:dashboard` projection | 2 |
| `src/metabase/mcp/v2/tools/content.clj` | loses its private `:dashboard` projection | 2 |
| `src/metabase/mcp/v2/dashboard_ops.clj` | **pure** op compiler + per-op validation | 3–6, 8 |
| `src/metabase/parameters/mapping_targets.clj` | `valid-targets` for a card + parameter | 7 |
| `src/metabase/mcp/v2/tools/dashboard.clj` | `deftool`, Malli schema, domain calls, response | 9 |
| `src/metabase/mcp/v2/api.clj` | registration require | 9 |
| `resources/metabot/skills/dashboard-write.md` | agent-facing op grammar guide | 10 |
| `test/metabase/mcp/v2/dashboard_ops_test.clj` | pure, no DB, fast | 3–6, 8 |
| `test/metabase/parameters/mapping_targets_test.clj` | metadata-driven | 7 |
| `test/metabase/mcp/v2/tools/dashboard_test.clj` | through `registry/call-tool` | 9 |

---

## Task 1: Expose the dashboard domain write fns

The tool must call the same code the REST endpoints call, so `api/write-check` / `api/create-check` run and permissions are inherited rather than reimplemented. `update-dashboard!` is currently `defn-`; the create logic is inline in the `POST /` defendpoint body. This mirrors what `origin/mcp-v2-segment-measure-write` did to `metabase.segments.api` and `metabase.measures.api`.

**Files:**
- Modify: `src/metabase/dashboards_rest/api.clj:143-176` (extract `create-dashboard!`), `src/metabase/dashboards_rest/api.clj:1025` (make `update-dashboard!` public)
- Test: `test/metabase/dashboards_rest/api_test.clj` (existing suite is the regression net)

**Interfaces:**
- Produces:
  - `(metabase.dashboards-rest.api/create-dashboard! {:name s :description s :parameters [] :cache_ttl int :collection_id int :collection_position int}) => hydrated dashboard map` — runs `api/create-check`, publishes `:event/dashboard-create`.
  - `(metabase.dashboards-rest.api/update-dashboard! id dash-updates) => hydrated dashboard map` — runs `api/write-check`, transactional, publishes `:event/dashboard-update`. `dash-updates` accepts `:name :description :collection_id :collection_position :width :auto_apply_filters :cache_ttl :archived :parameters :dashcards :tabs`.

- [ ] **Step 1: Extract the create body**

Replace the `POST "/"` defendpoint at `src/metabase/dashboards_rest/api.clj:143-176` with a public fn plus a thin endpoint:

```clojure
(mu/defn create-dashboard! :- :map
  "Create a Dashboard owned by the current user and return it hydrated for an API response.
  Requires create permission on `:collection_id` (nil = root). Publishes `:event/dashboard-create`."
  [{:keys [name description parameters cache_ttl collection_id collection_position]}
   :- [:map
       [:name                ms/NonBlankString]
       [:parameters          {:optional true} [:maybe ::parameters.schema/parameters]]
       [:description         {:optional true} [:maybe :string]]
       [:cache_ttl           {:optional true} [:maybe ms/PositiveInt]]
       [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]]]
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (api/create-check :model/Dashboard {:collection_id collection_id})
  (let [dashboard-data {:name                name
                        :description         description
                        :parameters          (or parameters [])
                        :creator_id          api/*current-user-id*
                        :cache_ttl           cache_ttl
                        :collection_id       collection_id
                        :collection_position collection_position}
        dash           (t2/with-transaction [_conn]
                         ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                         ;; collection to change position, check that and fix up if needed
                         (api/maybe-reconcile-collection-position! dashboard-data)
                         (first (t2/insert-returning-instances! :model/Dashboard dashboard-data)))]
    (events/publish-event! :event/dashboard-create {:object dash :user-id api/*current-user-id*})
    (analytics/track-event! :snowplow/dashboard
                            {:event        :dashboard-created
                             :dashboard-id (u/the-id dash)})
    (-> dash
        hydrate-dashboard-details
        collection.root/hydrate-root-collection
        (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*)))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new Dashboard."
  [_route-params
   _query-params
   dashboard :- [:map
                 [:name                ms/NonBlankString]
                 [:parameters          {:optional true} [:maybe ::parameters.schema/parameters]]
                 [:description         {:optional true} [:maybe :string]]
                 [:cache_ttl           {:optional true} [:maybe ms/PositiveInt]]
                 [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                 [:collection_position {:optional true} [:maybe ms/PositiveInt]]]]
  (create-dashboard! dashboard))
```

Note the pre-existing `#_{:clj-kondo/ignore …}` on the endpoint is retained verbatim — it is already counted in the ratchet budget. Do not add new ones. Ensure `mu` (`metabase.util.malli`) is in the `ns` requires; add it if absent.

- [ ] **Step 2: Make `update-dashboard!` public**

At `src/metabase/dashboards_rest/api.clj:1025`, change `defn-` to `defn` and rewrite the docstring to state the contract:

```clojure
(defn update-dashboard!
  "Update the Dashboard with `id` and return it hydrated for an API response. `dash-updates` may carry
  dashboard attributes plus `:dashcards` and `:tabs`, which fully replace the current layout — entries
  with negative ids are created, missing entries are deleted. Requires write permission on the dashboard;
  runs in one transaction. Publishes `:event/dashboard-update` and may notify owners of broken subscriptions."
  [id {:keys [dashcards tabs parameters] :as dash-updates}]
  ...)
```

Leave the body unchanged.

- [ ] **Step 2b: Make the payload schemas public**

`validate_only` validates the compiled payload with the same schema the REST endpoint uses, so drop the `^:private` from `DashUpdates` (`api.clj:1116`), `UpdatedDashboardCard` (`:888`), and `UpdatedDashboardTab` (`:900`). Give each a docstring; `UpdatedDashboardCard`'s should keep the existing negative-id comment as prose:

```clojure
(def UpdatedDashboardCard
  "Schema for one dashcard in a dashboard update payload. A negative `:id` marks a dashcard to
  create; positive ids name existing rows, and rows absent from the payload are deleted."
  [:map
   [:id                                  int?]
   ...])
```

- [ ] **Step 3: Verify the REST suite still passes**

Run: `./bin/test-agent :only '[metabase.dashboards-rest.api-test]'`
Expected: same pass count as before the change, 0 failures, 0 errors.

- [ ] **Step 4: Lint**

Run: `./bin/mage kondo src/metabase/dashboards_rest/api.clj`
Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/metabase/dashboards_rest/api.clj
git commit -m "GHY-4147: expose dashboard create/update as domain fns"
```

---

## Task 2: Move the dashboard projection into `projections.clj`

`dashboard_write` returns the same concise shape `get_content` does. One definition, two consumers — otherwise the two drift and the `fields` catalog lies.

**Files:**
- Modify: `src/metabase/mcp/v2/projections.clj` (add the `:dashboard` entry)
- Modify: `src/metabase/mcp/v2/tools/content.clj:319-339` (remove the local registration)
- Test: `test/metabase/mcp/v2/tools/content_test.clj` (existing suite is the net)

`get_content` builds its projection row in `content.clj`'s private `fetch-dashboard` (`src/metabase/mcp/v2/tools/content.clj:289-301`) — it selects the dashboard columns, then attaches `:tabs`, `:parameters` (via `dashboard-parameters-summary`), and `:dashcards` (via `dashcard-summary`, sorted by row then col). `dashboard_write` must return the identical shape. So the **row builder moves too**, not just the projection: otherwise the two tools' "concise dashboard" silently diverge.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `:dashboard` registered in `metabase.mcp.v2.projections`, callable as `(projections/project :dashboard row :concise)` — confirm the arg order against `src/metabase/mcp/v2/projections.clj:70` before calling it.
  - `(projections/dashboard-row hydrated-dashboard) => row` — public. Takes a dashboard hydrated with `[:dashcards :series :card] :tabs` and returns the map both `:concise` and `:detailed` project from. Read checks on nested cards happen here, so it must be called as the requesting user.

- [ ] **Step 1: Run the existing content tests to capture the baseline**

Run: `./bin/test-agent :only '[metabase.mcp.v2.tools.content-test]'`
Expected: PASS. Record the assertion count — it must not change.

- [ ] **Step 2: Move the projection**

Cut `dashboard-concise-keys`, `dashboard-detailed-keys`, `dashboard-sample`, and the `register-projection!` call from `src/metabase/mcp/v2/tools/content.clj:319-339` and paste into `src/metabase/mcp/v2/projections.clj` alongside the existing `:collection` / `:table` / `:question` entries. Rename the vars to avoid clashes with the ones already there and drop `^:private` from none of them (they stay private):

```clojure
;;; ----------------------------------------------- dashboard ------------------------------------------------------

(def ^:private dashboard-concise-keys
  [:id :name :description :tabs :parameters :dashcards])

(def ^:private dashboard-detailed-keys
  (into dashboard-concise-keys
        [:entity_id :collection_id :creator_id :archived :created_at :updated_at :width
         :auto_apply_filters :cache_ttl :collection_position]))

(def ^:private dashboard-sample
  (-> (zipmap dashboard-detailed-keys (repeat "x"))
      (assoc :tabs [{:id 1 :name "x"}]
             :parameters [{:id "x" :name "x" :type "x" :dashcard_ids [1]}]
             :dashcards [{:id 1 :kind "x" :card {:id 1 :name "x"} :text "x" :dashboard_tab_id 1
                          :row 0 :col 0 :size_x 1 :size_y 1 :series [{:id 1 :name "x"}]
                          :inline_parameters ["x"]}])))

(register-projection!
 :dashboard
 {:concise  #(compact (select-keys % dashboard-concise-keys))
  :detailed #(compact (select-keys % dashboard-detailed-keys))
  :sample   dashboard-sample})
```

`projections.clj` must have a `compact` helper. If it does not already, add it next to the other private helpers:

```clojure
(defn- compact
  [m]
  (into {} (remove (comp nil? val)) m))
```

If `content.clj`'s own private `compact` becomes unused after the move, leave it — it is used by the other projections in that file. Verify with a grep before deleting anything.

- [ ] **Step 2b: Move the row builder too**

Move `dashcard-kind`, `dashcard-card-ref`, `dashcard-summary`, and `dashboard-parameters-summary` (`src/metabase/mcp/v2/tools/content.clj:236-287`) into `projections.clj` as private fns, and expose the row builder publicly:

```clojure
(defn dashboard-row
  "The projection row for `dash`, a dashboard hydrated with `[:dashcards :series :card] :tabs`.
  Nested cards the current user cannot read collapse to `{:id …}`, so this must be called as the
  requesting user. Both the `:concise` and `:detailed` projections select from this shape."
  [dash]
  (-> (select-keys dash [:id :name :description :entity_id :collection_id :creator_id :archived
                         :created_at :updated_at :width :auto_apply_filters :cache_ttl
                         :collection_position])
      (assoc :tabs       (mapv #(select-keys % [:id :name]) (:tabs dash))
             :parameters (dashboard-parameters-summary dash)
             :dashcards  (mapv dashcard-summary
                               (sort-by (juxt #(or (:row %) 0) #(or (:col %) 0)) (:dashcards dash))))))
```

Then rewrite `content.clj`'s private `fetch-dashboard` to call it, preserving the `::dashboard` key its `include: "layout"` path depends on (`content.clj:303-317`):

```clojure
(defn- fetch-dashboard
  [id-or-eid]
  (let [dash (-> (common/resolve-and-read :model/Dashboard id-or-eid
                                          (fn [id] (api/read-check (t2/select-one :model/Dashboard :id id))))
                 (t2/hydrate [:dashcards :series :card] :tabs))]
    (assoc (projections/dashboard-row dash) ::dashboard dash)))
```

This moves `metabase.dashboards.core` (for `dashboard->resolved-params`) and `metabase.models.interface` into `projections.clj`'s requires; check what `dashboard-parameters-summary` and `dashcard-card-ref` actually reference and bring exactly those.

- [ ] **Step 3: Verify both suites**

Run: `./bin/test-agent :only '[metabase.mcp.v2.tools.content-test]'`

(There is no `metabase.mcp.v2.projections-test` — `projections.clj` is covered through the tools that use it.)
Expected: PASS, same assertion count as Step 1. Specifically the `fields` catalog for `type: "dashboard"` must be unchanged — the catalog is generated from the sample, and the sample moved verbatim.

- [ ] **Step 4: Lint and commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/projections.clj src/metabase/mcp/v2/tools/content.clj
git add src/metabase/mcp/v2/projections.clj src/metabase/mcp/v2/tools/content.clj
git commit -m "GHY-4147: share the dashboard projection between v2 tools"
```

---

## Task 3: Op compiler core — state model, `add_card`, negative ids, autoplace

The heart of the tool. Pure: no DB, no `api/*current-user*`, plain maps in and out. That purity is what makes `validate_only` free and the test suite fast.

**Files:**
- Create: `src/metabase/mcp/v2/dashboard_ops.clj`
- Create: `test/metabase/mcp/v2/dashboard_ops_test.clj`

**Interfaces:**
- Consumes: `metabase.dashboards.autoplace/get-position-for-new-dashcard`, `metabase.mcp.v2.common/throw-teaching-error`.
- Produces:
  - `(dashboard-ops/compile-ops current ops) => {:dashcards [dashcard-map …] :tabs [tab-map …] :parameters [parameter-map …]}`
    where `current` is `{:id int :dashcards [...] :tabs [...] :parameters [...]}` — the hydrated dashboard — and `ops` is a vector of op maps with keyword keys.
  - `(dashboard-ops/op-error! idx message)` — throws a teaching error prefixed with the op index.

- [ ] **Step 1: Write the failing tests**

Create `test/metabase/mcp/v2/dashboard_ops_test.clj`:

```clojure
(ns metabase.mcp.v2.dashboard-ops-test
  "Unit tests for the pure `dashboard_write` op compiler. No DB: `compile-ops` takes a hydrated
   dashboard map and returns the save payload, so every op and every rejection is exercised
   against plain maps."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.dashboard-ops :as dashboard-ops]))

(set! *warn-on-reflection* true)

(def ^:private empty-dash
  {:id 1 :dashcards [] :tabs [] :parameters []})

(defn- dash-with
  [dashcards]
  (assoc empty-dash :dashcards dashcards))

(deftest add-card-autoplaces-test
  (testing "GHY-4147: add_card with no position lands at the top-left of an empty dashboard"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_card" :id -1 :card_id 42}])]
      (is (= 1 (count dashcards)))
      (is (= {:id -1 :card_id 42 :row 0 :col 0}
             (select-keys (first dashcards) [:id :card_id :row :col])))
      (is (pos-int? (:size_x (first dashcards))))
      (is (pos-int? (:size_y (first dashcards)))))))

(deftest add-card-respects-explicit-position-and-size-test
  (testing "GHY-4147: explicit position and size are passed through untouched"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_card" :id -1 :card_id 42
                                 :position {:row 3 :col 4}
                                 :size {:size_x 6 :size_y 5}}])]
      (is (= {:id -1 :card_id 42 :row 3 :col 4 :size_x 6 :size_y 5}
             (select-keys (first dashcards) [:id :card_id :row :col :size_x :size_y]))))))

(deftest existing-dashcards-are-preserved-test
  (testing "GHY-4147: the payload is a full replacement, so untouched dashcards survive verbatim"
    (let [existing {:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :dashboard_tab_id nil}
          {:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [existing])
                               [{:op "add_card" :id -1 :card_id 42}])]
      (is (= #{7 -1} (set (map :id dashcards))))
      (is (= existing (first (filter #(= 7 (:id %)) dashcards)))))))

(deftest autoplace-avoids-existing-cards-test
  (testing "GHY-4147: autoplace does not overlap an occupied slot"
    (let [existing {:id 7 :card_id 9 :row 0 :col 0 :size_x 24 :size_y 4 :dashboard_tab_id nil}
          {:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [existing])
                               [{:op "add_card" :id -1 :card_id 42}])
          added (first (filter #(= -1 (:id %)) dashcards))]
      (is (<= 4 (:row added))))))

(deftest duplicate-temp-id-is-rejected-test
  (testing "GHY-4147: reusing a temp id inside one batch is a teaching error naming the op index"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 1.*-1"
         (dashboard-ops/compile-ops
          empty-dash
          [{:op "add_card" :id -1 :card_id 42}
           {:op "add_card" :id -1 :card_id 43}])))))

(deftest positive-temp-id-is-rejected-test
  (testing "GHY-4147: a new dashcard's id must be negative — positives would silently target a real row"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 0.*negative"
         (dashboard-ops/compile-ops empty-dash [{:op "add_card" :id 5 :card_id 42}])))))

(deftest unknown-op-is-rejected-test
  (testing "GHY-4147: an unrecognized op names the index and the op"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 0.*frobnicate"
         (dashboard-ops/compile-ops empty-dash [{:op "frobnicate"}])))))
```

- [ ] **Step 2: Run to verify they fail**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test]'`
Expected: FAIL — `Could not locate metabase/mcp/v2/dashboard_ops__init.class`.

- [ ] **Step 3: Implement the compiler core**

Create `src/metabase/mcp/v2/dashboard_ops.clj`:

```clojure
(ns metabase.mcp.v2.dashboard-ops
  "The pure core of the `dashboard_write` tool: fold an ordered list of editor operations over a
   hydrated dashboard and return the payload
   [[metabase.dashboards-rest.api/update-dashboard!]] saves — `{:dashcards :tabs :parameters}`.

   No I/O. Everything the ops need about cards, tables, or fields is resolved by the caller and
   passed in, which is what lets `validate_only` reuse this untouched and lets the whole op
   grammar be tested against plain maps.

   New dashcards and tabs carry caller-supplied negative ids, the same temp-id convention the
   frontend editor sends to `PUT /api/dashboard/:id`: `u/row-diff` treats them as creates, and
   `do-update-tabs!` rewrites each dashcard's `dashboard_tab_id` once the real tab rows exist."
  (:require
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.mcp.v2.common :as common]))

(set! *warn-on-reflection* true)

(defn op-error!
  "Throw a teaching error attributing `message` to the op at `idx` (0-based, as sent)."
  [idx message]
  (common/throw-teaching-error (format "op %d (%s" idx message)))

;; No local size table: `autoplace`'s `[cards display-type]` arity already merges
;; `dashboards.constants/default-card-size` with the per-display entry in `card-size-defaults`,
;; which covers :heading (full-width × 1), :text, :link, :iframe, and :action. That table is kept
;; in sync with the frontend grid; a second copy here would drift.

;;; ------------------------------------------------- State --------------------------------------------------------

(defn- init-state
  "Working state for the fold: dashcards/tabs/parameters as vectors in save order, plus the
   caller-supplied `{card-id card}` map. Card metadata rides in state rather than being fetched,
   which is what keeps this namespace pure — it is needed for a new card's default size and,
   later, for parameter wiring."
  [current cards]
  {:dashcards  (vec (:dashcards current))
   :tabs       (vec (:tabs current))
   :parameters (vec (:parameters current))
   ::cards     cards})

(defn- card-display
  "The display type keyword driving a new dashcard's default size; `:table` when the card is
   unknown, which only affects the default and never correctness."
  [state card-id]
  (keyword (or (:display (get (::cards state) card-id)) "table")))

(defn- find-dashcard
  [state id]
  (first (filter #(= id (:id %)) (:dashcards state))))

(defn- update-dashcard
  "Replace the dashcard with `id` by `(f dashcard)`, preserving order."
  [state id f]
  (update state :dashcards (partial mapv #(if (= id (:id %)) (f %) %))))

(defn- check-new-id!
  "A new dashcard or tab id must be negative and unused in this batch."
  [state idx id kind]
  (when-not (and (integer? id) (neg? id))
    (op-error! idx (format "%s): `id` must be a negative integer — negative ids mark rows to create."
                           kind)))
  (when (some #(= id (:id %)) (concat (:dashcards state) (:tabs state)))
    (op-error! idx (format "%s): id %d is already used in this batch — give each new row its own negative id."
                           kind id))))

(defn- resolve-dashcard!
  "The existing dashcard `id` names, or a teaching error."
  [state idx id]
  (or (find-dashcard state id)
      (op-error! idx (format "%s): no dashcard with id %s on this dashboard."
                             "dashcard_id" id))))

;;; ---------------------------------------------- Placement -------------------------------------------------------

(defn- placement
  "The `{:row :col :size_x :size_y}` for a new dashcard of `display-type` (a keyword such as
   `:table`, `:heading`, `:iframe`). Explicit `position`/`size` win; an omitted size comes from
   the display type's default and an omitted position autoplaces against the cards already on
   the target tab."
  [state {:keys [position size]} tab-id display-type]
  (let [siblings   (filterv #(= tab-id (:dashboard_tab_id %)) (:dashcards state))
        ;; The 2-arity resolves the display's default size from `dashboards.constants`.
        autoplaced (autoplace/get-position-for-new-dashcard siblings display-type)
        size_x     (or (:size_x size) (:size_x autoplaced))
        size_y     (or (:size_y size) (:size_y autoplaced))]
    (if position
      {:row (:row position) :col (:col position) :size_x size_x :size_y size_y}
      ;; Re-run placement at the caller's size — the default-size slot may not fit it.
      (let [placed (autoplace/get-position-for-new-dashcard
                    siblings size_x size_y autoplace/default-grid-width)]
        (when-not placed
          (common/throw-teaching-error
           "No free space on this tab for another card — remove or resize something first."))
        {:row (:row placed) :col (:col placed) :size_x size_x :size_y size_y}))))

;;; ------------------------------------------------- Ops ----------------------------------------------------------

(defmulti ^:private apply-op
  "Apply one op to the working state. Dispatches on the op's `:op` string."
  (fn [_state _idx op] (:op op)))

(defmethod apply-op :default
  [_state idx op]
  (op-error! idx (format "%s): unknown op — see the tool description for the supported list."
                         (pr-str (:op op)))))

(defmethod apply-op "add_card"
  [state idx {:keys [id card_id tab series inline_parameters] :as op}]
  (check-new-id! state idx id "add_card")
  (update state :dashcards conj
          (merge {:id                 id
                  :card_id            card_id
                  :dashboard_tab_id   tab
                  :parameter_mappings []}
                 (placement state op tab (card-display state card_id))
                 (when (seq series) {:series (mapv (fn [cid] {:id cid}) series)})
                 (when (seq inline_parameters) {:inline_parameters (vec inline_parameters)}))))

;;; ------------------------------------------------ Entry ---------------------------------------------------------

(defn compile-ops
  "Fold `ops` over `current` (a dashboard hydrated with `[:dashcards :series :card] :tabs`) and
   return `{:dashcards :tabs :parameters}` — the full-replacement payload `update-dashboard!`
   saves. New rows carry the caller's negative ids. `cards` maps every card id the ops may touch
   to its card row; this namespace does no I/O, so the caller resolves that. Throws a teaching
   error naming the op index on any invalid op."
  ([current ops] (compile-ops current ops {}))
  ([current ops cards]
   (-> (reduce-kv (fn [state idx op] (apply-op state idx op))
                  (init-state current cards)
                  (vec ops))
       (select-keys [:dashcards :tabs :parameters]))))
```

Taking the `cards` map from the start avoids changing this signature again in Task 8, and `select-keys` at the end keeps the internal `::cards` key out of the payload.

Note `op-error!`'s format string closes the parenthesis opened by `"op %d ("` — each call site supplies the rest, producing e.g. `op 1 (add_card): id -1 is already used in this batch — …`. Keep that discipline in every op method.

- [ ] **Step 4: Run to verify they pass**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test]'`
Expected: PASS, 7 tests.

- [ ] **Step 5: Lint and commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/dashboard_ops.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git add src/metabase/mcp/v2/dashboard_ops.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git commit -m "GHY-4147: dashboard op compiler core with add_card"
```

---

## Task 4: The remaining add ops

`add_text`, `add_heading`, `add_link`, `add_iframe`, `add_action`, `duplicate_card`. All produce a dashcard; the virtual ones carry no `card_id` and describe themselves through `visualization_settings`.

`metabase.dashboards.models.dashboard-card/virtual-card-settings` (dashboard_card.clj:80) is public and already covers `text` and `heading`, including the `dashcard.background false` that headings get. It does **not** cover `link`, `iframe`, or `action`. **Extend that fn** rather than building settings maps inside the compiler — a virtual card the editor cannot render is worse than no op, and one shared builder is the only way to stay in step with the frontend.

Reference shapes, from the only current writers: `createVirtualCard` (`frontend/src/metabase/common/utils/dashboard.ts:41`), the `add*DashCardToDashboard` actions (`frontend/src/metabase/dashboard/actions/cards-typed.ts:197-245`), the backend's one link-card example (`src/metabase/xrays/api/automagic_dashboards.clj:269`), and the iframe read side (`src/metabase/channel/render/pdf.clj:405`).

**Files:**
- Modify: `src/metabase/dashboards/models/dashboard_card.clj:80` (extend `virtual-card-settings`)
- Modify: `src/metabase/mcp/v2/dashboard_ops.clj`
- Modify: `test/metabase/mcp/v2/dashboard_ops_test.clj`
- Test: `test/metabase/dashboards/models/dashboard_card_test.clj`

**Interfaces:**
- Consumes: `compile-ops` / `op-error!` / `placement` from Task 3; `metabase.dashboards.models.dashboard-card/virtual-card-settings`.
- Produces: no new public fns — six more `apply-op` methods.

- [ ] **Step 1: Write the failing tests**

Append to `test/metabase/mcp/v2/dashboard_ops_test.clj`:

```clojure
(deftest add-text-test
  (testing "GHY-4147: add_text produces a virtual text dashcard with no card_id"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_text" :id -1 :markdown "## Hello"}])
          dc (first dashcards)]
      (is (nil? (:card_id dc)))
      (is (= "text" (get-in dc [:visualization_settings :virtual_card :display])))
      (is (= "## Hello" (get-in dc [:visualization_settings :text]))))))

(deftest add-heading-test
  (testing "GHY-4147: add_heading matches the editor, including the transparent background"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_heading" :id -1 :text "Revenue"}])
          vs (:visualization_settings (first dashcards))]
      (is (= "heading" (get-in vs [:virtual_card :display])))
      (is (= "Revenue" (:text vs)))
      (is (false? (:dashcard.background vs))))))

(deftest add-link-url-test
  (testing "GHY-4147: add_link with an external url"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_link" :id -1 :url "https://example.com"}])
          vs (:visualization_settings (first dashcards))]
      (is (= "link" (get-in vs [:virtual_card :display])))
      (is (= {:url "https://example.com"} (:link vs))))))

(deftest add-link-entity-test
  (testing "GHY-4147: add_link with an entity reference stores the entity, not a url"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_link" :id -1 :entity {:type "dashboard" :id 12}}])
          vs (:visualization_settings (first dashcards))]
      (is (= {:entity {:model "dashboard" :id 12}} (:link vs))))))

(deftest add-link-requires-exactly-one-target-test
  (testing "GHY-4147: add_link with neither url nor entity, or both, is a teaching error"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*exactly one"
                          (dashboard-ops/compile-ops empty-dash [{:op "add_link" :id -1}])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*exactly one"
                          (dashboard-ops/compile-ops
                           empty-dash
                           [{:op "add_link" :id -1 :url "https://example.com"
                             :entity {:type "dashboard" :id 12}}])))))

(deftest add-iframe-test
  (testing "GHY-4147: add_iframe stores the src in visualization settings"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_iframe" :id -1 :src "https://example.com/embed"}])
          vs (:visualization_settings (first dashcards))]
      (is (= "iframe" (get-in vs [:virtual_card :display])))
      (is (= "https://example.com/embed" (:iframe vs))))))

(deftest add-action-test
  (testing "GHY-4147: add_action produces an action dashcard with action_id and no card_id"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_action" :id -1 :action_id 3 :label "Run" :display "button"}])
          dc (first dashcards)]
      (is (= 3 (:action_id dc)))
      (is (nil? (:card_id dc)))
      (is (= "button" (get-in dc [:visualization_settings :actionDisplayType])))
      (is (= "Run" (get-in dc [:visualization_settings "button.label"]))))))

(deftest duplicate-card-test
  (testing "GHY-4147: duplicate_card clones content but takes the new negative id and its own slot"
    (let [existing {:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :dashboard_tab_id nil
                    :visualization_settings {:card.title "Original"}
                    :parameter_mappings [{:parameter_id "p1" :card_id 9 :target ["dimension" ["field" 1 nil]]}]}
          {:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [existing])
                               [{:op "duplicate_card" :id -1 :dashcard_id 7}])
          clone (first (filter #(= -1 (:id %)) dashcards))]
      (is (= 2 (count dashcards)))
      (is (= 9 (:card_id clone)))
      (is (= {:card.title "Original"} (:visualization_settings clone)))
      (is (= (:parameter_mappings existing) (:parameter_mappings clone)))
      (is (not= [(:row existing) (:col existing)] [(:row clone) (:col clone)])))))

(deftest duplicate-card-unknown-dashcard-test
  (testing "GHY-4147: duplicate_card on a missing dashcard names the op index"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*999"
                          (dashboard-ops/compile-ops
                           empty-dash
                           [{:op "duplicate_card" :id -1 :dashcard_id 999}])))))
```

- [ ] **Step 2: Run to verify they fail**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test]'`
Expected: FAIL — the new tests hit `apply-op :default` ("unknown op").

- [ ] **Step 3a: Extend `virtual-card-settings`**

In `src/metabase/dashboards/models/dashboard_card.clj:80`, widen the existing fn to cover the remaining virtual displays. Keep the current `[display text]` arity working — `xrays…populate/add-text-card` calls it — and add an arity taking display-specific extras:

```clojure
(defn virtual-card-settings
  "`visualization_settings` for a virtual dashcard — one with no backing card, such as a text card,
  heading, link, or iframe. `display` is the virtual display type as a string. `extras` carries the
  display-specific settings: `{:text …}` for text and headings, `{:link {:url …}}` or
  `{:link {:entity {:model … :id …}}}` for links, `{:iframe …}` for iframes.
  Mirrors the shape the frontend saves; see `createVirtualCard` in
  frontend/src/metabase/common/utils/dashboard.ts."
  ([display text] (virtual-card-settings display (when text {:text text})))
  ([display extras]
   (cond-> (merge {:virtual_card {:name                   nil
                                  :display                display
                                  :visualization_settings {}
                                  :archived               false}}
                  extras)
     ;; headings render without a card background, matching the frontend default
     (= display "heading") (assoc :dashcard.background false))))
```

The two arities are ambiguous when `extras` is a string vs a map — dispatch on `(map? x)` inside a single 2-arity rather than relying on shape, or give the new one a distinct name (`virtual-card-settings*`) if that reads better. Pick one and make `add-text-card`'s existing call site still pass its test.

Add a test in `test/metabase/dashboards/models/dashboard_card_test.clj` covering each display, asserting the `:virtual_card` envelope and the display-specific key.

- [ ] **Step 3b: Implement the add ops**

Add to `src/metabase/mcp/v2/dashboard_ops.clj` (and add `[metabase.dashboards.models.dashboard-card :as dashboard-card]` to the `ns` requires):

```clojure
(defn- virtual-dashcard
  "A dashcard with no backing card. `display` is the virtual display type and `extras` its
   display-specific settings, both handed to [[dashboard-card/virtual-card-settings]] so this
   compiler and the frontend agree on the shape."
  [state idx op display extras]
  (check-new-id! state idx (:id op) (:op op))
  (update state :dashcards conj
          (merge {:id                     (:id op)
                  :dashboard_tab_id       (:tab op)
                  :parameter_mappings     []
                  :visualization_settings (dashboard-card/virtual-card-settings display extras)}
                 (placement state op (:tab op) (keyword display))
                 (when (seq (:inline_parameters op))
                   {:inline_parameters (vec (:inline_parameters op))}))))

(defmethod apply-op "add_text"
  [state idx {:keys [markdown] :as op}]
  (virtual-dashcard state idx op "text" {:text markdown}))

(defmethod apply-op "add_heading"
  [state idx {:keys [text] :as op}]
  (virtual-dashcard state idx op "heading" {:text text}))

(defmethod apply-op "add_link"
  [state idx {:keys [url entity] :as op}]
  (when (= (some? url) (some? entity))
    (op-error! idx "add_link): pass exactly one of `url` or `entity`."))
  (virtual-dashcard state idx op "link"
                    {:link (if url
                             {:url url}
                             {:entity {:model (:type entity) :id (:id entity)}})}))

(defmethod apply-op "add_iframe"
  [state idx {:keys [src] :as op}]
  (virtual-dashcard state idx op "iframe" {:iframe src}))

(defmethod apply-op "add_action"
  [state idx {:keys [id action_id label display] :as op}]
  (check-new-id! state idx id "add_action")
  (update state :dashcards conj
          (merge {:id                 id
                  :action_id          action_id
                  :dashboard_tab_id   (:tab op)
                  :parameter_mappings []
                  :visualization_settings
                  (cond-> {:actionDisplayType (or display "button")}
                    label (assoc "button.label" label))}
                 (placement state op (:tab op) :action))))

(defmethod apply-op "duplicate_card"
  [state idx {:keys [id dashcard_id tab] :as op}]
  (check-new-id! state idx id "duplicate_card")
  (let [source (resolve-dashcard! state idx dashcard_id)
        tab-id (if (contains? op :tab) tab (:dashboard_tab_id source))]
    (update state :dashcards conj
            (merge (dissoc source :id :row :col :size_x :size_y :dashboard_tab_id
                           :created_at :updated_at :card :entity_id)
                   {:id id :dashboard_tab_id tab-id}
                   (placement state
                              (assoc op :size {:size_x (:size_x source) :size_y (:size_y source)})
                              tab-id
                              (card-display state (:card_id source)))))))
```

Two notes on `duplicate_card`:

- A same-dashboard duplicate points at the **same** `card_id` — it does not clone the underlying question, even when that question is a dashboard question. `update-cards-for-copy` (api.clj:486) is *not* usable here: with an empty `id->new-card` its branch at api.clj:512 silently drops every card-backed dashcard.
- What must be remapped when cloning, per that function's checklist: `dashboard_tab_id` (done above), and — for visualizer cards — `visualization_settings.columnValuesMapping`'s `sourceId`. Handling the visualizer case means making `update-colvalmap-setting` (api.clj:465) public and calling it. If you skip it, a duplicated visualizer card will reference the source dashcard's columns; add a test asserting the current behavior either way so it is a decision rather than an accident.

The action dashcard's `actionDisplayType` / `"button.label"` keys come from the frontend. Confirm against `frontend/src/metabase/dashboard/components/` — grep for `actionDisplayType` — and fix both implementation and test if they differ.

- [ ] **Step 4: Run to verify they pass**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test]'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/dashboard_ops.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git add src/metabase/mcp/v2/dashboard_ops.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git commit -m "GHY-4147: text, heading, link, iframe, action, and duplicate ops"
```

---

## Task 5: The edit ops

`replace_card`, `move`, `resize`, `remove`, `set_series`, `patch_dashcard`.

`replace_card` mirrors the editor (`frontend/src/metabase/dashboard/actions/cards-typed.ts:245-270`): the dashcard id survives, and `series`, `parameter_mappings`, and `visualization_settings` all reset — which is why it lands in `to-update`, not `to-create`, on the backend (see the UXW-4731 comment at `src/metabase/dashboards_rest/api.clj:878-880`).

`patch_dashcard` is a **content** merge only. Layout and identity keys are rejected with an error naming the op that owns them, so an agent never believes a `row` in a patch took effect.

**Files:**
- Modify: `src/metabase/mcp/v2/dashboard_ops.clj`
- Modify: `test/metabase/mcp/v2/dashboard_ops_test.clj`

**Interfaces:**
- Consumes: Task 3's `resolve-dashcard!`, `update-dashcard`, `placement`.
- Produces: six more `apply-op` methods; no new public fns.

- [ ] **Step 1: Write the failing tests**

Append to `test/metabase/mcp/v2/dashboard_ops_test.clj`:

```clojure
(def ^:private a-dashcard
  {:id 7 :card_id 9 :row 2 :col 3 :size_x 4 :size_y 4 :dashboard_tab_id nil
   :visualization_settings {:card.title "Old"}
   :parameter_mappings [{:parameter_id "p1" :card_id 9 :target ["dimension" ["field" 1 nil]]}]
   :series [{:id 11}]})

(deftest replace-card-resets-content-test
  (testing "GHY-4147: replace_card keeps the dashcard id and resets series, mappings, and viz settings"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "replace_card" :dashcard_id 7 :card_id 99}])
          dc (first dashcards)]
      (is (= 7 (:id dc)))
      (is (= 99 (:card_id dc)))
      (is (= [] (:series dc)))
      (is (= [] (:parameter_mappings dc)))
      (is (= {} (:visualization_settings dc)))
      (testing "layout is untouched"
        (is (= [2 3 4 4] [(:row dc) (:col dc) (:size_x dc) (:size_y dc)]))))))

(deftest move-and-resize-test
  (testing "GHY-4147: move relocates, resize resizes, neither disturbs the other"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "move" :dashcard_id 7 :position {:row 0 :col 0}}
                                {:op "resize" :dashcard_id 7 :size {:size_x 8 :size_y 2}}])
          dc (first dashcards)]
      (is (= [0 0 8 2] [(:row dc) (:col dc) (:size_x dc) (:size_y dc)])))))

(deftest remove-test
  (testing "GHY-4147: remove drops the dashcard from the payload, which deletes it on save"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "remove" :dashcard_id 7}])]
      (is (= [] dashcards)))))

(deftest set-series-test
  (testing "GHY-4147: set_series is an ordered full replace"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "set_series" :dashcard_id 7 :card_ids [21 20]}])]
      (is (= [{:id 21} {:id 20}] (:series (first dashcards)))))))

(deftest patch-dashcard-merges-content-test
  (testing "GHY-4147: patch_dashcard merges into visualization_settings rather than replacing them"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "patch_dashcard" :dashcard_id 7
                                 :patch {:visualization_settings {:card.description "New"}}}])
          vs (:visualization_settings (first dashcards))]
      (is (= "Old" (:card.title vs)))
      (is (= "New" (:card.description vs))))))

(deftest patch-dashcard-rejects-layout-keys-test
  (testing "GHY-4147: layout and identity keys in a patch are rejected, naming the op that owns them"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*`row`.*move"
                          (dashboard-ops/compile-ops
                           (dash-with [a-dashcard])
                           [{:op "patch_dashcard" :dashcard_id 7 :patch {:row 0}}])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*`size_x`.*resize"
                          (dashboard-ops/compile-ops
                           (dash-with [a-dashcard])
                           [{:op "patch_dashcard" :dashcard_id 7 :patch {:size_x 4}}])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*`card_id`.*replace_card"
                          (dashboard-ops/compile-ops
                           (dash-with [a-dashcard])
                           [{:op "patch_dashcard" :dashcard_id 7 :patch {:card_id 1}}])))))

(deftest ops-apply-in-order-test
  (testing "GHY-4147: a later op sees the effect of an earlier one — add then move the same new card"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_card" :id -1 :card_id 42}
                                {:op "move" :dashcard_id -1 :position {:row 9 :col 1}}])]
      (is (= [9 1] [(:row (first dashcards)) (:col (first dashcards))])))))
```

- [ ] **Step 2: Run to verify they fail**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test]'`
Expected: FAIL — unknown op.

- [ ] **Step 3: Implement the edit ops**

Add to `src/metabase/mcp/v2/dashboard_ops.clj`:

```clojure
(def ^:private patch-rejected-keys
  "Keys `patch_dashcard` refuses, mapped to the op that owns them. A patch is a content merge;
   silently dropping a layout key would let a caller believe a move took effect."
  {:row              "move"
   :col              "move"
   :dashboard_tab_id "move"
   :size_x           "resize"
   :size_y           "resize"
   :card_id          "replace_card"
   :action_id        "replace_card"
   :series           "set_series"
   :id               nil})

(defmethod apply-op "replace_card"
  [state idx {:keys [dashcard_id card_id]}]
  (resolve-dashcard! state idx dashcard_id)
  (update-dashcard state dashcard_id
                   #(assoc % :card_id card_id
                           :series []
                           :parameter_mappings []
                           :visualization_settings {})))

(defmethod apply-op "move"
  [state idx {:keys [dashcard_id tab position] :as op}]
  (let [dc     (resolve-dashcard! state idx dashcard_id)
        tab-id (if (contains? op :tab) tab (:dashboard_tab_id dc))]
    (when (and (contains? op :tab) (some? tab) (not-any? #(= tab (:id %)) (:tabs state)))
      (op-error! idx (format "move): no tab with id %s on this dashboard." tab)))
    (update-dashcard state dashcard_id
                     (fn [dc]
                       (merge dc
                              {:dashboard_tab_id tab-id}
                              (if position
                                {:row (:row position) :col (:col position)}
                                (select-keys (placement state
                                                        {:size (select-keys dc [:size_x :size_y])}
                                                        tab-id)
                                             [:row :col])))))))

(defmethod apply-op "resize"
  [state idx {:keys [dashcard_id size]}]
  (resolve-dashcard! state idx dashcard_id)
  (update-dashcard state dashcard_id #(merge % (select-keys size [:size_x :size_y]))))

(defmethod apply-op "remove"
  [state idx {:keys [dashcard_id]}]
  (resolve-dashcard! state idx dashcard_id)
  (update state :dashcards (partial filterv #(not= dashcard_id (:id %)))))

(defmethod apply-op "set_series"
  [state idx {:keys [dashcard_id card_ids]}]
  (resolve-dashcard! state idx dashcard_id)
  (update-dashcard state dashcard_id #(assoc % :series (mapv (fn [cid] {:id cid}) card_ids))))

(defmethod apply-op "patch_dashcard"
  [state idx {:keys [dashcard_id patch]}]
  (resolve-dashcard! state idx dashcard_id)
  (doseq [[k owner] patch-rejected-keys]
    (when (contains? patch k)
      (op-error! idx (if owner
                       (format "patch_dashcard): `%s` is not patchable — use the `%s` op."
                               (name k) owner)
                       (format "patch_dashcard): `%s` is not patchable." (name k))))))
  (update-dashcard state dashcard_id
                   (fn [dc]
                     (cond-> (merge dc (dissoc patch :visualization_settings))
                       (contains? patch :visualization_settings)
                       (update :visualization_settings merge (:visualization_settings patch))))))
```

- [ ] **Step 4: Run to verify they pass**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test]'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/dashboard_ops.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git add src/metabase/mcp/v2/dashboard_ops.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git commit -m "GHY-4147: replace, move, resize, remove, set_series, and patch ops"
```

---

## Task 6: The tab ops

`add_tab`, `rename_tab`, `move_tab`, `duplicate_tab`, `remove_tab`.

Two behaviors are inherited rather than implemented: `update-dashboard!` assigns each tab's `:position` from its index in the vector (`src/metabase/dashboards_rest/api.clj:1078`), so `move_tab` is a vector reorder; and it rewrites dashcards' negative `dashboard_tab_id` to the real id after `do-update-tabs!` creates the rows. `remove_tab` must drop the tab's dashcards itself, since the payload is a full replacement.

One inherited constraint the compiler must honor: when a dashboard has tabs, **every** dashcard needs a `dashboard_tab_id` or `update-dashboard!` throws "This dashboard has tab, makes sure every card has a tab" (`api.clj:1150-1152`). Catch that in the compiler with a clearer message.

**Files:**
- Modify: `src/metabase/mcp/v2/dashboard_ops.clj`
- Modify: `test/metabase/mcp/v2/dashboard_ops_test.clj`

**Interfaces:**
- Consumes: Task 3's `check-new-id!`, `op-error!`.
- Produces: five more `apply-op` methods, plus a final `check-tab-coverage!` invoked from `compile-ops` before returning.

- [ ] **Step 1: Write the failing tests**

Append to `test/metabase/mcp/v2/dashboard_ops_test.clj`:

```clojure
(deftest add-tab-and-place-a-card-in-it-test
  (testing "GHY-4147: a card can reference a tab created earlier in the same batch by its negative id"
    (let [{:keys [tabs dashcards]} (dashboard-ops/compile-ops
                                    empty-dash
                                    [{:op "add_tab" :id -1 :name "Q3"}
                                     {:op "add_card" :id -2 :card_id 42 :tab -1}])]
      (is (= [{:id -1 :name "Q3"}] tabs))
      (is (= -1 (:dashboard_tab_id (first dashcards)))))))

(deftest rename-tab-test
  (testing "GHY-4147: rename_tab changes only the name"
    (let [{:keys [tabs]} (dashboard-ops/compile-ops
                          (assoc empty-dash :tabs [{:id 5 :name "Old" :position 0}])
                          [{:op "rename_tab" :tab_id 5 :name "New"}])]
      (is (= "New" (:name (first tabs))))
      (is (= 5 (:id (first tabs)))))))

(deftest move-tab-reorders-test
  (testing "GHY-4147: move_tab reorders the vector; update-dashboard! derives :position from the index"
    (let [{:keys [tabs]} (dashboard-ops/compile-ops
                          (assoc empty-dash :tabs [{:id 5 :name "A"} {:id 6 :name "B"} {:id 7 :name "C"}])
                          [{:op "move_tab" :tab_id 7 :index 0}])]
      (is (= [7 5 6] (mapv :id tabs))))))

(deftest duplicate-tab-clones-cards-test
  (testing "GHY-4147: duplicate_tab clones the tab and every dashcard on it, under new negative ids"
    (let [current {:id 1
                   :tabs [{:id 5 :name "A"}]
                   :parameters []
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4
                                :dashboard_tab_id 5 :visualization_settings {}}]}
          {:keys [tabs dashcards]} (dashboard-ops/compile-ops
                                    current
                                    [{:op "duplicate_tab" :id -1 :tab_id 5}])]
      (is (= [5 -1] (mapv :id tabs)))
      (is (= "A" (:name (second tabs))))
      (is (= 2 (count dashcards)))
      (let [clone (first (filter #(= -1 (:dashboard_tab_id %)) dashcards))]
        (is (neg? (:id clone)))
        (is (= 9 (:card_id clone)))))))

(deftest remove-tab-deletes-its-cards-test
  (testing "GHY-4147: remove_tab drops the tab and every dashcard on it"
    (let [current {:id 1
                   :tabs [{:id 5 :name "A"} {:id 6 :name "B"}]
                   :parameters []
                   :dashcards [{:id 7 :card_id 9 :dashboard_tab_id 5 :row 0 :col 0 :size_x 4 :size_y 4}
                               {:id 8 :card_id 9 :dashboard_tab_id 6 :row 0 :col 0 :size_x 4 :size_y 4}]}
          {:keys [tabs dashcards]} (dashboard-ops/compile-ops current [{:op "remove_tab" :tab_id 5}])]
      (is (= [6] (mapv :id tabs)))
      (is (= [8] (mapv :id dashcards))))))

(deftest tab-coverage-is-enforced-test
  (testing "GHY-4147: with tabs present, a dashcard with no tab is rejected with a clear message"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"every card must belong to a tab"
         (dashboard-ops/compile-ops
          empty-dash
          [{:op "add_tab" :id -1 :name "Q3"}
           {:op "add_card" :id -2 :card_id 42}])))))

(deftest unknown-tab-is-rejected-test
  (testing "GHY-4147: referencing a tab that does not exist names the op index"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*99"
                          (dashboard-ops/compile-ops empty-dash [{:op "rename_tab" :tab_id 99 :name "x"}])))))
```

- [ ] **Step 2: Run to verify they fail**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test]'`
Expected: FAIL.

- [ ] **Step 3: Implement the tab ops**

Add to `src/metabase/mcp/v2/dashboard_ops.clj`:

```clojure
(defn- resolve-tab!
  [state idx id]
  (or (first (filter #(= id (:id %)) (:tabs state)))
      (op-error! idx (format "tab_id): no tab with id %s on this dashboard." id))))

(defn- next-temp-id
  "A negative id not yet used by any dashcard or tab in the working state. Ops that clone a whole
   tab mint ids for the copies rather than making the caller enumerate them."
  [state]
  (dec (reduce min 0 (map :id (concat (:dashcards state) (:tabs state))))))

(defmethod apply-op "add_tab"
  [state idx {:keys [id name]}]
  (check-new-id! state idx id "add_tab")
  (update state :tabs conj {:id id :name name}))

(defmethod apply-op "rename_tab"
  [state idx {:keys [tab_id name]}]
  (resolve-tab! state idx tab_id)
  (update state :tabs (partial mapv #(if (= tab_id (:id %)) (assoc % :name name) %))))

(defmethod apply-op "move_tab"
  [state idx {:keys [tab_id index]}]
  (let [tab   (resolve-tab! state idx tab_id)
        rest* (filterv #(not= tab_id (:id %)) (:tabs state))]
    (when-not (<= 0 index (count rest*))
      (op-error! idx (format "move_tab): index %d is out of range — this dashboard has %d tabs."
                             index (count (:tabs state)))))
    (assoc state :tabs (vec (concat (subvec rest* 0 index) [tab] (subvec rest* index))))))

(defmethod apply-op "duplicate_tab"
  [state idx {:keys [id tab_id]}]
  (check-new-id! state idx id "duplicate_tab")
  (let [source (resolve-tab! state idx tab_id)
        cards  (filterv #(= tab_id (:dashboard_tab_id %)) (:dashcards state))
        state  (update state :tabs conj {:id id :name (:name source)})]
    (reduce (fn [st card]
              (update st :dashcards conj
                      (assoc (dissoc card :created_at :updated_at :card)
                             :id (next-temp-id st)
                             :dashboard_tab_id id)))
            state
            cards)))

(defmethod apply-op "remove_tab"
  [state idx {:keys [tab_id]}]
  (resolve-tab! state idx tab_id)
  (-> state
      (update :tabs (partial filterv #(not= tab_id (:id %))))
      (update :dashcards (partial filterv #(not= tab_id (:dashboard_tab_id %))))))
```

Then add the coverage check and wire it into `compile-ops`, replacing the Task 3 version:

```clojure
(defn- check-tab-coverage!
  "`update-dashboard!` requires every dashcard to name a tab once a dashboard has any, and its own
   error is opaque. Reject it here, naming the offending cards."
  [{:keys [tabs dashcards] :as state}]
  (when (seq tabs)
    (when-let [orphans (not-empty (filterv #(nil? (:dashboard_tab_id %)) dashcards))]
      (common/throw-teaching-error
       (format (str "This dashboard has tabs, so every card must belong to a tab: %s have none. "
                    "Pass `tab` on the add op, or use `move` with `tab` for cards already placed.")
               (pr-str (mapv :id orphans))))))
  state)

(defn compile-ops
  "Fold `ops` over `current` (a dashboard hydrated with `[:dashcards :series :card] :tabs`) and
   return `{:dashcards :tabs :parameters}` — the full-replacement payload `update-dashboard!`
   saves. New rows carry the caller's negative ids. Throws a teaching error naming the op index
   on any invalid op."
  [current ops]
  (-> (reduce-kv (fn [state idx op] (apply-op state idx op))
                 (init-state current)
                 (vec ops))
      check-tab-coverage!))
```

The single-tab case needs no special handling: `update-dashboard!` already back-fills a nil `dashboard_tab_id` when exactly one tab exists (`api.clj:1079-1086`). But `check-tab-coverage!` runs first and would reject it, so exempt that case — change the `when (seq tabs)` guard to `when (< 1 (count tabs))`. Verify against `api.clj:1079-1086` before deciding, and adjust the `tab-coverage-is-enforced-test` fixture to use two tabs if you take the exemption.

- [ ] **Step 4: Run to verify they pass**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test]'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/dashboard_ops.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git add src/metabase/mcp/v2/dashboard_ops.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git commit -m "GHY-4147: dashboard tab ops"
```

---

## Task 7: `metabase.parameters.mapping-targets`

There is no backend equivalent of the frontend's `getParameterMappingOptions` (`frontend/src/metabase/parameters/utils/mapping-options.ts:153`) — but **most of its hard half already exists privately**, and this task is mostly exposure plus a thin layer. Do not build a metadata provider or a filterable-columns walk from scratch.

What exists, all in `src/metabase/parameters/params.clj`:

| Piece | Line | State |
| --- | --- | --- |
| `card->filterable-columns-query` — builds the lib query, wrapping models and metrics as source cards | 186 | private → make public |
| `filterable-columns-for-query` — `[card stage-number] -> [column …]`, calls `lib/ensure-filter-stage` then `lib/filterable-columns` | 200 | private → make public |
| `param-target->field-id` — `[target card] -> field-id or nil`; resolves both `[:dimension [:field …]]` and `[:variable [:template-tag …]]` | 80 | **already public** — this is your target validator; nil means bogus |
| `assert-valid-parameter-mappings` | 46 | already public (schema only, does not check the target against the card) |

Two shapes to copy rather than invent, from `src/metabase/xrays/automagic_dashboards/filters.clj`:

- `filter-for-card` (`:74`, private) — the target clause is `[:dimension field-ref {:stage-number 0}]`. **The `{:stage-number …}` option is required**; omitting it produces a target that looks right and resolves wrong on multi-stage queries.
- `filter-type-info` (`:92`, private) — field effective/semantic type → `{:type "string/=" :sectionId "string"}`. Make public or copy for parameter-type compatibility. It is x-ray-flavored (booleans map to `"string/="` with a TODO), so read it before trusting it.

Do **not** reuse `filters/add-filters` or `add-filter` — they operate on the x-ray `::ads/dashboard` map and its `fk-map` machinery. Superficially similar, wrong world.

It lives in `metabase.parameters` because it is a domain primitive, not an MCP concern, and because everything it builds on is already in that namespace. A future REST endpoint can expose it so the frontend eventually drops its copy.

**Files:**
- Modify: `src/metabase/parameters/params.clj:186,200` (make two fns public)
- Create: `src/metabase/parameters/mapping_targets.clj`
- Create: `test/metabase/parameters/mapping_targets_test.clj`

**Interfaces:**
- Consumes: `params/filterable-columns-for-query`, `params/param-target->field-id`, `lib/all-template-tags-map` (already used at `params.clj:44`).
- Produces:
  - `(mapping-targets/valid-targets card parameter) => [{:target target-clause :column-name string :display-name string} …]`
    where `target-clause` is the MBQL target vector stored in a parameter mapping — `["dimension" ["field" id opts]]` for MBQL cards, `["variable" ["template-tag" tag-name]]` or `["dimension" ["template-tag" tag-name]]` for native ones.
  - `(mapping-targets/target-for-field card parameter field-id) => target-clause | nil` — the target on `card` that resolves to `field-id`, used by explicit `wire_parameter` and by `autowire`.

- [ ] **Step 1: Write the failing tests**

Create `test/metabase/parameters/mapping_targets_test.clj`:

```clojure
(ns metabase.parameters.mapping-targets-test
  "Tests for enumerating the parameter mapping targets a card exposes — the backend counterpart of
   the frontend's getParameterMappingOptions."
  (:require
   [clojure.test :refer :all]
   [metabase.parameters.mapping-targets :as mapping-targets]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest mbql-card-exposes-filterable-columns-test
  (testing "GHY-4147: an MBQL card's targets are its filterable columns, as dimension clauses"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
      (let [targets (mapping-targets/valid-targets card {:id "p1" :type "string/="})]
        (is (seq targets))
        (is (every? #(= :dimension (first (:target %))) targets))
        (is (contains? (set (map :column-name targets)) "NAME"))))))

(deftest dimension-targets-carry-a-stage-number-test
  (testing "GHY-4147: dimension targets carry {:stage-number 0} — without it they resolve wrong on
            multi-stage queries"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
      (let [targets (mapping-targets/valid-targets card {:id "p1" :type "string/="})]
        (is (every? #(= {:stage-number 0} (nth (:target %) 2 nil)) targets))))))

(deftest target-for-field-test
  (testing "GHY-4147: target-for-field finds the target resolving to a specific field"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
      (let [target (mapping-targets/target-for-field card {:id "p1" :type "number/="} (mt/id :venues :price))]
        (is (= :dimension (first target)))
        (testing "and it round-trips through the codebase's own target resolver"
          (is (= (mt/id :venues :price)
                 (metabase.parameters.params/param-target->field-id target card))))))))

(deftest target-for-field-returns-nil-when-absent-test
  (testing "GHY-4147: a field the card does not expose yields nil, so the caller can teach"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
      (is (nil? (mapping-targets/target-for-field card
                                                  {:id "p1" :type "string/="}
                                                  (mt/id :users :name)))))))

(deftest native-card-exposes-template-tags-test
  (testing "GHY-4147: a native card's targets are its template tags, typed by tag kind"
    (mt/with-temp [:model/Card card {:dataset_query
                                     (mt/native-query
                                      {:query "SELECT * FROM VENUES WHERE PRICE = {{price}}"
                                       :template-tags {"price" {:id "t1" :name "price"
                                                                :display-name "Price"
                                                                :type :number}}})}]
      (let [targets (mapping-targets/valid-targets card {:id "p1" :type "number/="})]
        (is (= [[:variable [:template-tag "price"]]] (mapv :target targets)))))))

(deftest native-dimension-tag-test
  (testing "GHY-4147: a native dimension tag is a dimension target, not a variable"
    (mt/with-temp [:model/Card card {:dataset_query
                                     (mt/native-query
                                      {:query "SELECT * FROM VENUES WHERE {{cat}}"
                                       :template-tags {"cat" {:id "t2" :name "cat"
                                                              :display-name "Cat"
                                                              :type :dimension
                                                              :widget-type :string/=
                                                              :dimension [:field (mt/id :venues :name) nil]}}})}]
      (let [targets (mapping-targets/valid-targets card {:id "p1" :type "string/="})]
        (is (= [[:dimension [:template-tag "cat"]]] (mapv :target targets)))))))

(deftest incompatible-parameter-type-yields-no-targets-test
  (testing "GHY-4147: a date parameter finds no target on a card exposing only a number variable"
    (mt/with-temp [:model/Card card {:dataset_query
                                     (mt/native-query
                                      {:query "SELECT * FROM VENUES WHERE PRICE = {{price}}"
                                       :template-tags {"price" {:id "t1" :name "price"
                                                                :display-name "Price"
                                                                :type :number}}})}]
      (is (empty? (mapping-targets/valid-targets card {:id "p1" :type "date/all-options"}))))))
```

- [ ] **Step 2: Run to verify they fail**

Run: `./bin/test-agent :only '[metabase.parameters.mapping-targets-test]'`
Expected: FAIL — namespace not found.

- [ ] **Step 3a: Expose the two private fns**

In `src/metabase/parameters/params.clj`, drop `^:private` from `card->filterable-columns-query` (`:186`) and `filterable-columns-for-query` (`:200`), giving each a contract docstring:

```clojure
(defn filterable-columns-for-query
  "The columns of `card`'s query a filter can target at `stage-number`. Models and metrics are
  wrapped as source cards, and a non-negative `stage-number` gets a filter stage appended first."
  [card stage-number]
  ...)
```

Run `./bin/test-agent :only '[metabase.parameters.params-test]'` to confirm nothing regressed.

- [ ] **Step 3b: Implement `mapping-targets`**

Create `src/metabase/parameters/mapping_targets.clj`. The sketch below shows the intended shape; build it on the exposed fns rather than reconstructing a metadata provider.

```clojure
(ns metabase.parameters.mapping-targets
  "Enumerate the parameter mapping targets a card exposes: which of its columns or template tags a
   dashboard parameter can be wired to.

   The frontend has owned this since dashboards gained parameters (`getParameterMappingOptions`);
   this is the server-side equivalent, which dashboard authoring over the API needs in order to
   validate a requested mapping and to auto-wire a parameter across a dashboard's cards."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- native-query?
  [card]
  (= :native (keyword (:type (:dataset_query card)))))

(defn- tag-compatible?
  "Whether a template tag can serve a parameter of `parameter-type`. Dimension tags carry their own
   `:widget-type`; variable tags are matched on the tag's value type."
  [parameter-type {tag-type :type widget-type :widget-type}]
  (let [base (first (clojure.string/split (name parameter-type) #"/"))]
    (case (keyword tag-type)
      :dimension (or (nil? widget-type)
                     (= (keyword parameter-type) (keyword widget-type))
                     (= base (first (clojure.string/split (name widget-type) #"/"))))
      :number    (= base "number")
      :text      (= base "string")
      :date      (= base "date")
      false)))

(defn- native-targets
  [card parameter]
  (for [[tag-name tag] (get-in card [:dataset_query :native :template-tags])
        :when          (tag-compatible? (:type parameter) tag)]
    {:target       (if (= :dimension (keyword (:type tag)))
                     ["dimension" ["template-tag" (name tag-name)]]
                     ["variable" ["template-tag" (name tag-name)]])
     :column-name  (name tag-name)
     :display-name (or (:display-name tag) (name tag-name))}))

(defn- column-compatible?
  "Whether `column` can back a parameter of `parameter-type`, by effective type family."
  [parameter-type column]
  (let [base (first (clojure.string/split (name parameter-type) #"/"))
        t    (:effective-type column)]
    (case base
      "date"     (isa? t :type/Temporal)
      "number"   (isa? t :type/Number)
      "string"   (isa? t :type/Text)
      "id"       (isa? t :type/Integer)
      "category" true
      true)))

(defn- mbql-targets
  "Filterable columns of `card`'s query as dimension targets. `params/filterable-columns-for-query`
   already handles model/metric source-card wrapping and the filter-stage subtleties; the only work
   here is the type filter and the target clause."
  [card parameter]
  (try
    (for [col   (params/filterable-columns-for-query card -1)
          :when (column-compatible? (:type parameter) col)]
      ;; `{:stage-number 0}` is not decoration — without it the target resolves wrong on
      ;; multi-stage queries. Shape copied from xrays…filters/filter-for-card (filters.clj:74).
      {:target       [:dimension (lib/ref col) {:stage-number 0}]
       :column-name  (:name col)
       :display-name (or (:display-name col) (:name col))})
    (catch Exception e
      ;; An unrunnable card should narrow the wiring options, not fail the whole save.
      (log/warnf e "Could not enumerate mapping targets for card %s" (:id card))
      [])))

(defn valid-targets
  "The mapping targets `card` exposes for `parameter` (a dashboard parameter map with `:id` and
   `:type`), as `[{:target :column-name :display-name} …]`. Empty when the card exposes nothing
   compatible. Never throws — an unrunnable card yields no targets."
  [card parameter]
  (vec (if (native-query? card)
         (native-targets card parameter)
         (mbql-targets card parameter))))

(defn target-for-field
  "The target on `card` that resolves to `field-id` for `parameter`, or nil when the card exposes
   no compatible column for that field."
  [card parameter field-id]
  (->> (valid-targets card parameter)
       ;; `param-target->field-id` is the same resolution the rest of the codebase uses for both
       ;; dimension and template-tag targets — matching on the ref's shape here would drift from it.
       (filter #(= field-id (params/param-target->field-id (:target %) card)))
       first
       :target))
```

Notes for the implementer:

- Add `[clojure.string :as str]` to the requires and use `str/split`, not the fully-qualified form shown above — kondo flags the unaliased version.
- Before writing `column-compatible?` and `tag-compatible?`, check `filters/filter-type-info` (`src/metabase/xrays/automagic_dashboards/filters.clj:92`) and grep `src/metabase/parameters/` for an existing parameter-type predicate. If one exists, use it. If you take `filter-type-info`, read it first — it is x-ray-flavored (booleans map to `"string/="` with a TODO).
- There is no metadata provider to construct here. `filterable-columns-for-query` does that internally. If you find yourself reaching for `lib-be`, you have gone around the fn you just exposed.

- [ ] **Step 4: Run to verify they pass**

Run: `./bin/test-agent :only '[metabase.parameters.mapping-targets-test metabase.parameters.params-test]'`
Expected: PASS, 7 new tests plus the existing params suite. If the `:effective-type` key on Lib columns is named differently in this version, fix `column-compatible?` — do not weaken the test.

- [ ] **Step 5: Commit**

```bash
./bin/mage kondo src/metabase/parameters/mapping_targets.clj src/metabase/parameters/params.clj test/metabase/parameters/mapping_targets_test.clj
git add src/metabase/parameters/mapping_targets.clj src/metabase/parameters/params.clj test/metabase/parameters/mapping_targets_test.clj
git commit -m "GHY-4147: enumerate parameter mapping targets server-side"
```

---

## Task 8: The parameter ops

`add_parameter`, `update_parameter`, `remove_parameter`, `move_parameter`, `wire_parameter`, `unwire_parameter`.

Parameter ids are agent-supplied strings, matching both the schema (`::parameter` requires `:id`, `src/metabase/parameters/schema.cljc:82`) and the frontend, which mints the id client-side.

Mapping targets need card metadata, which the pure compiler cannot fetch. `compile-ops` already takes the `cards` map for this (Task 3) — no signature change here.

`remove_parameter` must name the subscriptions it breaks. That machinery exists but is private and returns nothing useful: `broken-subscription-data` (api.clj:989) computes the findings, and `handle-broken-subscriptions` (api.clj:1013) archives the pulses and emails their owners in a bare `doseq`. Two constraints from the audit:

- It must run **after** the update — `broken-pulses` (api.clj:972) re-reads the dashboard's current `:resolved-params` and compares against the pulses' stored params. You cannot compute it beforehand.
- Routing through `update-dashboard!` already triggers the side effect whenever `:parameters` is passed. You need only the **return value** for reporting.

So the response wording is "archived N subscriptions", not "these would break" — it is destructive and already happened.

**Files:**
- Modify: `src/metabase/dashboards_rest/api.clj:1013` (make `handle-broken-subscriptions` public and return its findings)
- Modify: `src/metabase/mcp/v2/dashboard_ops.clj`
- Modify: `test/metabase/mcp/v2/dashboard_ops_test.clj`

**Interfaces:**
- Consumes: `metabase.parameters.mapping-targets/valid-targets` and `/target-for-field` from Task 7; `compile-ops`'s existing `cards` argument from Task 3.
- Produces: six more `apply-op` methods, and `(dashboards-rest.api/handle-broken-subscriptions dashboard-id original-params) => [{:pulse-id :pulse-name :bad-parameters …} …]` (was nil).

- [ ] **Step 1: Write the failing tests**

Append to `test/metabase/mcp/v2/dashboard_ops_test.clj`. Existing call sites need no change — `compile-ops` has taken `cards` since Task 3, and the 2-arity defaults it to `{}`.

```clojure
(def ^:private a-card
  "Minimal stand-in for a hydrated card; mapping-targets is stubbed in these tests, so only the
   id matters here."
  {:id 9 :name "Revenue" :type "question"})

(deftest add-parameter-test
  (testing "GHY-4147: add_parameter appends a parameter carrying the caller's id, REST names intact"
    (let [{:keys [parameters]} (dashboard-ops/compile-ops
                                empty-dash
                                [{:op "add_parameter" :parameter_id "p_date" :name "Date"
                                  :type "date/all-options" :isMultiSelect false}]
                                {})]
      (is (= [{:id "p_date" :name "Date" :type "date/all-options" :isMultiSelect false}]
             parameters)))))

(deftest add-parameter-rejects-duplicate-id-test
  (testing "GHY-4147: reusing an existing parameter id is a teaching error pointing at update_parameter"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 0.*update_parameter"
         (dashboard-ops/compile-ops
          (assoc empty-dash :parameters [{:id "p1" :name "X" :type "string/="}])
          [{:op "add_parameter" :parameter_id "p1" :name "Y" :type "string/="}]
          {})))))

(deftest update-parameter-merges-test
  (testing "GHY-4147: update_parameter merges into the existing parameter"
    (let [{:keys [parameters]} (dashboard-ops/compile-ops
                                (assoc empty-dash :parameters [{:id "p1" :name "X" :type "string/="}])
                                [{:op "update_parameter" :parameter_id "p1" :name "Y"}]
                                {})]
      (is (= [{:id "p1" :name "Y" :type "string/="}] parameters)))))

(deftest remove-parameter-strips-mappings-test
  (testing "GHY-4147: remove_parameter drops the parameter, its dashcard mappings, its inline
            placements, and any linked-filter reference to it"
    (let [current {:id 1 :tabs []
                   :parameters [{:id "p1" :name "X" :type "string/="}
                                {:id "p2" :name "Y" :type "string/=" :filteringParameters ["p1"]}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4
                                :inline_parameters ["p1" "p2"]
                                :parameter_mappings [{:parameter_id "p1" :card_id 9 :target ["dimension" ["field" 1 nil]]}
                                                     {:parameter_id "p2" :card_id 9 :target ["dimension" ["field" 2 nil]]}]}]}
          {:keys [parameters dashcards]} (dashboard-ops/compile-ops
                                          current [{:op "remove_parameter" :parameter_id "p1"}] {})
          dc (first dashcards)]
      (is (= ["p2"] (mapv :id parameters)))
      (is (= [] (:filteringParameters (first parameters))))
      (is (= ["p2"] (:inline_parameters dc)))
      (is (= ["p2"] (mapv :parameter_id (:parameter_mappings dc)))))))

(deftest move-parameter-reorders-header-test
  (testing "GHY-4147: move_parameter with an index reorders the header"
    (let [{:keys [parameters]} (dashboard-ops/compile-ops
                                (assoc empty-dash :parameters [{:id "a"} {:id "b"} {:id "c"}])
                                [{:op "move_parameter" :parameter_id "c" :index 0}]
                                {})]
      (is (= ["c" "a" "b"] (mapv :id parameters))))))

(deftest move-parameter-onto-a-card-test
  (testing "GHY-4147: move_parameter with a dashcard_id makes it an inline filter on that card"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1"}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4}]}
          {:keys [dashcards]} (dashboard-ops/compile-ops
                               current [{:op "move_parameter" :parameter_id "p1" :dashcard_id 7}] {})]
      (is (= ["p1"] (:inline_parameters (first dashcards)))))))

(deftest wire-parameter-by-field-test
  (testing "GHY-4147: wire_parameter writes a parameter mapping using the card's target for the field"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1" :name "Cat" :type "string/="}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4
                                :parameter_mappings []}]}
          {:keys [dashcards]} (with-redefs [metabase.parameters.mapping-targets/target-for-field
                                            (fn [_card _param field-id]
                                              ["dimension" ["field" field-id nil]])]
                                (dashboard-ops/compile-ops
                                 current
                                 [{:op "wire_parameter" :parameter_id "p1" :dashcard_id 7 :target_field 55}]
                                 {9 a-card}))]
      (is (= [{:parameter_id "p1" :card_id 9 :target ["dimension" ["field" 55 nil]]}]
             (:parameter_mappings (first dashcards)))))))

(deftest wire-parameter-rejects-an-unavailable-field-test
  (testing "GHY-4147: a field the card does not expose is a teaching error naming the op"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1" :name "Cat" :type "string/="}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :parameter_mappings []}]}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"op 0.*wire_parameter"
           (with-redefs [metabase.parameters.mapping-targets/target-for-field (constantly nil)]
             (dashboard-ops/compile-ops
              current
              [{:op "wire_parameter" :parameter_id "p1" :dashcard_id 7 :target_field 55}]
              {9 a-card})))))))

(deftest wire-parameter-unknown-parameter-test
  (testing "GHY-4147: wiring a parameter that does not exist names the op index"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 0.*nope"
         (dashboard-ops/compile-ops
          {:id 1 :tabs [] :parameters []
           :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :parameter_mappings []}]}
          [{:op "wire_parameter" :parameter_id "nope" :dashcard_id 7 :target_field 55}]
          {9 a-card})))))

(deftest autowire-maps-every-compatible-card-test
  (testing "GHY-4147: autowire wires every card that exposes a compatible target, skipping those that don't"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1" :name "Cat" :type "string/="}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :parameter_mappings []}
                               {:id 8 :card_id 10 :row 4 :col 0 :size_x 4 :size_y 4 :parameter_mappings []}]}
          {:keys [dashcards]} (with-redefs [metabase.parameters.mapping-targets/target-for-field
                                            (fn [card _param field-id]
                                              (when (= 9 (:id card)) ["dimension" ["field" field-id nil]]))]
                                (dashboard-ops/compile-ops
                                 current
                                 [{:op "wire_parameter" :parameter_id "p1" :dashcard_id 7
                                   :target_field 55 :autowire true}]
                                 {9 {:id 9} 10 {:id 10}}))]
      (is (= 1 (count (:parameter_mappings (first dashcards)))))
      (is (= [] (:parameter_mappings (second dashcards)))))))

(deftest unwire-parameter-test
  (testing "GHY-4147: unwire_parameter clears one card's mapping, or every card's when dashcard_id is omitted"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1"}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4
                                :parameter_mappings [{:parameter_id "p1" :card_id 9 :target ["dimension" ["field" 1 nil]]}]}
                               {:id 8 :card_id 10 :row 4 :col 0 :size_x 4 :size_y 4
                                :parameter_mappings [{:parameter_id "p1" :card_id 10 :target ["dimension" ["field" 2 nil]]}]}]}]
      (testing "one card"
        (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                                   current [{:op "unwire_parameter" :parameter_id "p1" :dashcard_id 7}] {})]
          (is (= [] (:parameter_mappings (first dashcards))))
          (is (= 1 (count (:parameter_mappings (second dashcards)))))))
      (testing "all cards"
        (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                                   current [{:op "unwire_parameter" :parameter_id "p1"}] {})]
          (is (every? (comp empty? :parameter_mappings) dashcards)))))))
```

- [ ] **Step 2: Run to verify they fail**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test]'`
Expected: FAIL — unknown op.

- [ ] **Step 3: Implement**

Add `[metabase.parameters.mapping-targets :as mapping-targets]` to the requires. `init-state` and `compile-ops` already carry `cards` from Task 3 — do not change them.

```clojure
(defn- resolve-parameter!
  [state idx id]
  (or (first (filter #(= id (:id %)) (:parameters state)))
      (op-error! idx (format "parameter_id): no parameter with id %s on this dashboard." (pr-str id)))))

(defn- card-for-dashcard
  [state dashcard]
  (get (::cards state) (:card_id dashcard)))

(defmethod apply-op "add_parameter"
  [state idx {:keys [parameter_id] :as op}]
  (when (some #(= parameter_id (:id %)) (:parameters state))
    (op-error! idx (format "add_parameter): parameter %s already exists — use `update_parameter`."
                           (pr-str parameter_id))))
  (update state :parameters conj
          (-> (dissoc op :op :parameter_id)
              (assoc :id parameter_id))))

(defmethod apply-op "update_parameter"
  [state idx {:keys [parameter_id] :as op}]
  (resolve-parameter! state idx parameter_id)
  (update state :parameters
          (partial mapv #(if (= parameter_id (:id %))
                           (merge % (dissoc op :op :parameter_id))
                           %))))

(defmethod apply-op "remove_parameter"
  [state idx {:keys [parameter_id]}]
  (resolve-parameter! state idx parameter_id)
  (-> state
      (update :parameters
              (fn [params]
                (->> params
                     (filterv #(not= parameter_id (:id %)))
                     (mapv (fn [p]
                             (cond-> p
                               (contains? p :filteringParameters)
                               (update :filteringParameters
                                       (partial filterv #(not= parameter_id %)))))))))
      (update :dashcards
              (partial mapv
                       (fn [dc]
                         (cond-> dc
                           (contains? dc :inline_parameters)
                           (update :inline_parameters (partial filterv #(not= parameter_id %)))

                           (contains? dc :parameter_mappings)
                           (update :parameter_mappings
                                   (partial filterv #(not= parameter_id (:parameter_id %)))))))))))

(defmethod apply-op "move_parameter"
  [state idx {:keys [parameter_id index dashcard_id] :as op}]
  (let [param (resolve-parameter! state idx parameter_id)]
    (cond
      (contains? op :dashcard_id)
      (do (resolve-dashcard! state idx dashcard_id)
          (update state :dashcards
                  (partial mapv
                           (fn [dc]
                             (if (= dashcard_id (:id dc))
                               (update dc :inline_parameters
                                       (fn [ps] (vec (distinct (conj (vec ps) parameter_id)))))
                               (update dc :inline_parameters
                                       (fn [ps] (when ps (filterv #(not= parameter_id %) ps)))))))))

      (contains? op :index)
      (let [rest* (filterv #(not= parameter_id (:id %)) (:parameters state))]
        (when-not (<= 0 index (count rest*))
          (op-error! idx (format "move_parameter): index %d is out of range — this dashboard has %d parameters."
                                 index (count (:parameters state)))))
        (assoc state :parameters
               (vec (concat (subvec rest* 0 index) [param] (subvec rest* index)))))

      :else
      (op-error! idx "move_parameter): pass `index` to reorder the header, or `dashcard_id` to place it on a card."))))

(defn- wire-one
  "Add or replace `parameter`'s mapping on `dashcard`. Returns the dashcard unchanged when its card
   exposes no target for `field-id`."
  [state idx parameter dashcard field-id explicit?]
  (let [card   (card-for-dashcard state dashcard)
        target (when card (mapping-targets/target-for-field card parameter field-id))]
    (cond
      target
      (update dashcard :parameter_mappings
              (fn [ms]
                (conj (filterv #(not= (:id parameter) (:parameter_id %)) (vec ms))
                      {:parameter_id (:id parameter)
                       :card_id      (:card_id dashcard)
                       :target       target})))

      explicit?
      (op-error! idx (format (str "wire_parameter): dashcard %s does not expose field %s for parameter %s. "
                                  "Read the dashboard with get_content to see each card's columns.")
                             (:id dashcard) field-id (pr-str (:id parameter))))

      :else dashcard)))

(defmethod apply-op "wire_parameter"
  [state idx {:keys [parameter_id dashcard_id target_field target_tag target autowire]}]
  (let [parameter (resolve-parameter! state idx parameter_id)
        dashcard  (resolve-dashcard! state idx dashcard_id)]
    (cond
      target
      (update-dashcard state dashcard_id
                       (fn [dc]
                         (update dc :parameter_mappings
                                 (fn [ms]
                                   (conj (filterv #(not= parameter_id (:parameter_id %)) (vec ms))
                                         {:parameter_id parameter_id :card_id (:card_id dc) :target target})))))

      target_tag
      (update-dashcard state dashcard_id
                       (fn [dc]
                         (update dc :parameter_mappings
                                 (fn [ms]
                                   (conj (filterv #(not= parameter_id (:parameter_id %)) (vec ms))
                                         {:parameter_id parameter_id
                                          :card_id      (:card_id dc)
                                          :target       ["variable" ["template-tag" target_tag]]})))))

      target_field
      (let [state (update state :dashcards
                          (partial mapv #(if (= dashcard_id (:id %))
                                           (wire-one state idx parameter % target_field true)
                                           %)))]
        (if autowire
          (update state :dashcards
                  (partial mapv #(if (= dashcard_id (:id %))
                                   %
                                   (wire-one state idx parameter % target_field false))))
          state))

      :else
      (op-error! idx "wire_parameter): pass one of `target_field`, `target_tag`, or `target`."))))

(defmethod apply-op "unwire_parameter"
  [state idx {:keys [parameter_id dashcard_id] :as op}]
  (resolve-parameter! state idx parameter_id)
  (when (contains? op :dashcard_id)
    (resolve-dashcard! state idx dashcard_id))
  (update state :dashcards
          (partial mapv
                   (fn [dc]
                     (if (or (not (contains? op :dashcard_id)) (= dashcard_id (:id dc)))
                       (update dc :parameter_mappings
                               (fn [ms] (filterv #(not= parameter_id (:parameter_id %)) (vec ms))))
                       dc)))))
```

Then make broken-subscription reporting available. In `src/metabase/dashboards_rest/api.clj:1013`, make `handle-broken-subscriptions` public and have it return what it acted on instead of nil:

```clojure
(defn handle-broken-subscriptions
  "Archive every subscription on `dashboard-id` whose parameters no longer exist on the dashboard,
  notify their creators, and return the archived subscriptions' data. Must run after the update:
  it compares the dashboard's current resolved params against each pulse's stored params."
  [dashboard-id original-dashboard-params]
  (let [broken (broken-subscription-data dashboard-id original-dashboard-params)]
    (doseq [broken-subscription broken]
      ;; … existing body …
      )
    broken))
```

Its one existing caller inside `update-dashboard!` (api.clj:1084) ignores the return value, so this is additive. The tool surfaces the count in its response; wiring that into `dashboard-response` happens in Task 9.

If you hit a delimiter imbalance while pasting these forms, run `clj-paren-repair src/metabase/mcp/v2/dashboard_ops.clj` rather than hand-repairing — it also formats with cljfmt.

- [ ] **Step 4: Run to verify they pass**

Run: `./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test metabase.dashboards-rest.api-test]'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/dashboard_ops.clj src/metabase/dashboards_rest/api.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git add src/metabase/mcp/v2/dashboard_ops.clj src/metabase/dashboards_rest/api.clj test/metabase/mcp/v2/dashboard_ops_test.clj
git commit -m "GHY-4147: dashboard parameter ops and autowire"
```

---

## Task 9: The tool

The imperative shell: Malli arg schema, `dispatch-write`, id resolution behind read checks, card prefetch for wiring, `validate_only`, the domain calls, and the projected response.

**Files:**
- Create: `src/metabase/mcp/v2/tools/dashboard.clj`
- Create: `test/metabase/mcp/v2/tools/dashboard_test.clj`
- Modify: `src/metabase/mcp/v2/api.clj:14-17` (registration require)

**Interfaces:**
- Consumes: `dashboard-ops/compile-ops` (3-arity, Task 8); `dashboards-rest.api/create-dashboard!` and `/update-dashboard!` (Task 1); the `:dashboard` projection (Task 2); `common/dispatch-write`, `common/resolve-and-read`, `common/success-content`, `common/throw-teaching-error`.
- Produces: a registered tool named `"dashboard_write"`.

- [ ] **Step 1: Write the failing tests**

Create `test/metabase/mcp/v2/tools/dashboard_test.clj`. The harness helpers are copied from `definitions_test.clj:36-63` — that duplication is the established pattern in this suite; do not extract them into a shared ns as part of this task.

```clojure
(ns metabase.mcp.v2.tools.dashboard-test
  "Contract tests for the `dashboard_write` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, `drop-nil-args`, Malli validation, and teaching-error conversion are exercised for
   free. The op grammar itself is covered by `metabase.mcp.v2.dashboard-ops-test`; this suite
   pins the tool's contract, permission inheritance, and dry-run behavior on top of it."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tool the assertions below drive.
   [metabase.mcp.v2.tools.dashboard :as tools.dashboard]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(comment tools.dashboard/keep-me)

(defn- call-tool!
  [user scopes tool args]
  (mt/with-current-user (if (keyword? user) (mt/user->id user) user)
    (registry/call-tool scopes nil tool args)))

(defn- tool-result
  [response]
  (when (:isError response)
    (throw (ex-info (str "tool call failed: " (-> response :content first :text))
                    {:response response})))
  (-> response :content first :text json/decode+kw))

(defn- tool-error
  [response]
  (when-not (:isError response)
    (throw (ex-info "expected a tool error, got success" {:response response})))
  (-> response :content first :text))

(defn- wire
  [x]
  (-> x json/encode json/decode+kw))

(deftest create-dashboard-test
  (testing "GHY-4147: method create makes a dashboard and returns it in concise projection form"
    (mt/with-model-cleanup [:model/Dashboard]
      (let [result (tool-result (call-tool! :crowberto nil "dashboard_write"
                                            (wire {:method "create" :name "Sales"})))]
        (is (pos-int? (:id result)))
        (is (= "Sales" (:name result)))
        (testing "concise projection keys only"
          (is (= #{:id :name :description :tabs :parameters :dashcards}
                 (into #{} (keys result)))))))))

(deftest create-requires-name-test
  (testing "GHY-4147: create without a name is a teaching error, not a schema dump"
    (is (re-find #"`name` is required"
                 (tool-error (call-tool! :crowberto nil "dashboard_write" (wire {:method "create"})))))))

(deftest update-requires-id-test
  (testing "GHY-4147: update without an id is a teaching error"
    (is (re-find #"`id` is required"
                 (tool-error (call-tool! :crowberto nil "dashboard_write" (wire {:method "update"})))))))

(deftest create-with-ops-in-one-call-test
  (testing "GHY-4147: create accepts ops, so a dashboard and its cards land in a single call"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Card card {:name "Revenue"}]
        (let [result (tool-result
                      (call-tool! :crowberto nil "dashboard_write"
                                  (wire {:method "create" :name "Sales"
                                         :ops [{:op "add_card" :id -1 :card_id (:id card)}]})))]
          (is (= 1 (count (:dashcards result))))
          (is (= (:id card) (get-in result [:dashcards 0 :card :id])))
          (testing "the dashcard got a real id, not the temp one"
            (is (pos-int? (get-in result [:dashcards 0 :id])))))))))

(deftest ops-are-atomic-test
  (testing "GHY-4147: a batch with a bad op writes nothing — the error names the op index"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}
                   :model/Card      card {}]
      (let [err (tool-error (call-tool! :crowberto nil "dashboard_write"
                                        (wire {:method "update" :id (:id dash)
                                               :ops [{:op "add_card" :id -1 :card_id (:id card)}
                                                     {:op "remove" :dashcard_id 999999}]})))]
        (is (re-find #"op 1" err))
        (is (zero? (t2/count :model/DashboardCard :dashboard_id (:id dash))))))))

(deftest validate-only-writes-nothing-test
  (testing "GHY-4147: validate_only returns the would-be layout without touching the database"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}
                   :model/Card      card {:name "Revenue"}]
      (let [result (tool-result (call-tool! :crowberto nil "dashboard_write"
                                            (wire {:method "update" :id (:id dash)
                                                   :validate_only true
                                                   :ops [{:op "add_card" :id -1 :card_id (:id card)}]})))]
        (is (= 1 (count (:dashcards result))))
        (is (zero? (t2/count :model/DashboardCard :dashboard_id (:id dash))))
        (testing "the dry run's shape matches a real response, so a caller can read it the same way"
          (is (= #{:id :name :description :tabs :parameters :dashcards}
                 (into #{} (keys result)))))))))

(deftest entity-id-is-accepted-test
  (testing "GHY-4147: `id` accepts a 21-character entity_id as well as a numeric id"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (let [result (tool-result (call-tool! :crowberto nil "dashboard_write"
                                            (wire {:method "update" :id (:entity_id dash)
                                                   :description "Updated"})))]
        (is (= (:id dash) (:id result)))
        (is (= "Updated" (:description result)))))))

(deftest archived-round-trip-test
  (testing "GHY-4147: archived true trashes and false restores — the only removal path"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (call-tool! :crowberto nil "dashboard_write" (wire {:method "update" :id (:id dash) :archived true}))
      (is (true? (t2/select-one-fn :archived :model/Dashboard :id (:id dash))))
      (call-tool! :crowberto nil "dashboard_write" (wire {:method "update" :id (:id dash) :archived false}))
      (is (false? (t2/select-one-fn :archived :model/Dashboard :id (:id dash)))))))

(deftest write-permission-is-inherited-test
  (testing "GHY-4147: a user who cannot write the dashboard gets an error and nothing changes"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection coll {}
                     :model/Dashboard  dash {:name "Sales" :collection_id (:id coll)}]
        (is (some? (tool-error (call-tool! :rasta nil "dashboard_write"
                                           (wire {:method "update" :id (:id dash) :name "Hacked"})))))
        (is (= "Sales" (t2/select-one-fn :name :model/Dashboard :id (:id dash))))))))

(deftest update-scope-is-rechecked-test
  (testing "GHY-4147: a token holding only the create scope cannot update"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (is (some? (tool-error (call-tool! :crowberto #{metabot.scope/agent-dashboard-create}
                                         "dashboard_write"
                                         (wire {:method "update" :id (:id dash) :name "New"}))))))))

(deftest unknown-card-is-a-teaching-error-test
  (testing "GHY-4147: add_card referencing a card the user cannot read fails before any write"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (is (re-find #"op 0"
                   (tool-error (call-tool! :crowberto nil "dashboard_write"
                                           (wire {:method "update" :id (:id dash)
                                                  :ops [{:op "add_card" :id -1 :card_id 9999999}]}))))))))
```

- [ ] **Step 2: Run to verify they fail**

Run: `./bin/test-agent :only '[metabase.mcp.v2.tools.dashboard-test]'`
Expected: FAIL — namespace not found.

- [ ] **Step 3: Implement the tool**

Create `src/metabase/mcp/v2/tools/dashboard.clj`:

```clojure
(ns metabase.mcp.v2.tools.dashboard
  "The v2 MCP `dashboard_write` tool: create and update dashboards, and apply an ordered list of
   editor operations as one atomic save.

   A whole dashboard's JSON cannot survive a round trip through model context, so callers send
   *ops*. This namespace reads current state, hands it to the pure compiler in
   [[metabase.mcp.v2.dashboard-ops]], and passes the compiled payload to the same domain fns the
   REST endpoints use ([[metabase.dashboards-rest.api/create-dashboard!]] and
   [[metabase.dashboards-rest.api/update-dashboard!]]) — so write permission enforcement,
   transactionality, and event publishing are inherited, never reimplemented."
  (:require
   [metabase.api.common :as api]
   [metabase.dashboards-rest.api :as dashboards-rest.api]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.dashboard-ops :as dashboard-ops]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.models.interface :as mi]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Reading ------------------------------------------------------

(defn- fetch-dashboard
  "The dashboard behind its read check, hydrated for the compiler."
  [id-or-eid]
  (-> (common/resolve-and-read :model/Dashboard id-or-eid
                               (fn [id] (api/read-check (t2/select-one :model/Dashboard :id id))))
      (t2/hydrate [:dashcards :series :card] :tabs)))

(defn- referenced-card-ids
  "Every card id the compiled payload may need metadata for: those already on the dashboard, plus
   any named by an op."
  [dash ops]
  (into (set (keep :card_id (:dashcards dash)))
        (keep :card_id)
        ops))

(defn- fetch-cards
  "`{card-id card}` for `ids`, behind read checks. A card the caller cannot read is omitted, so
   wiring against it fails with the compiler's teaching error rather than leaking its existence."
  [ids]
  (when (seq ids)
    (into {} (for [card  (t2/select :model/Card :id [:in ids])
                   :when (mi/can-read? card)]
               [(:id card) card]))))

(defn- check-cards-exist!
  "Reject an op naming a card the caller cannot read, before any write happens."
  [ops cards]
  (doseq [[idx op] (map-indexed vector ops)
           :let    [card-id (:card_id op)]
           :when   (and card-id (not (contains? cards card-id)))]
    (dashboard-ops/op-error!
     idx (format "%s): no card with id %s that you can read." (:op op) card-id))))

;;; ------------------------------------------------ Response ------------------------------------------------------

(defn- dashboard-response
  "The saved dashboard in `get_content`-concise form, so a caller needs no follow-up read."
  [dash]
  (-> dash
      (t2/hydrate [:dashcards :series :card] :tabs)
      projections/dashboard-row
      (->> (projections/project :dashboard))
      common/success-content))
```

`projections/dashboard-row` is the public row builder Task 2 extracted, so `dashboard_write` and `get_content` return byte-identical shapes. Confirm the argument order of `projections/project` against `src/metabase/mcp/v2/projections.clj:70` — if it is `(project type row format)` rather than the 2-arity used above, adjust the threading and pass `:concise` explicitly.

For the `validate_only` path there is no saved row to hydrate: `apply-ops!` returns the merge of the current dashboard and the compiled payload, whose dashcards still carry negative ids and no hydrated `:card`. Hydration would fail on those. Give the dry run its own path that builds the row from the compiled payload directly, using the cards already fetched for wiring — and assert in the test that a `validate_only` response has the same keys as a real one.

Continue with the schema and handler:

```clojure
;;; ------------------------------------------------- Schema -------------------------------------------------------

(def ^:private position-schema
  [:map {:closed true :description "Grid slot. Omit to autoplace below the existing cards."}
   [:row [:int {:min 0}]]
   [:col [:int {:min 0}]]])

(def ^:private size-schema
  [:map {:closed true :description "Grid size in cells; the grid is 24 columns wide."}
   [:size_x [:int {:min 1 :max 24}]]
   [:size_y [:int {:min 1}]]])

;; One closed map per op, dispatched on `op`. Every optional key is `[:maybe …]` — the registry
;; rejects a schema whose optional fields aren't nullable, since strict clients can't consume it.
(def ^:private op-schema
  [:multi {:dispatch :op
           :description "One editor operation. See the tool description for the full grammar."}
   ["add_card"
    [:map {:closed true}
     [:op [:= "add_card"]]
     [:id [:int {:max -1 :description "A negative id you choose; later ops reference the new card by it."}]]
     [:card_id [:int {:description "Numeric id of the saved question, model, or metric to place."}]]
     [:tab {:optional true} [:maybe :int]]
     [:position {:optional true} [:maybe position-schema]]
     [:size {:optional true} [:maybe size-schema]]
     [:series {:optional true} [:maybe [:sequential :int]]]
     [:inline_parameters {:optional true} [:maybe [:sequential :string]]]]]
   ;; … one entry per remaining op, same shape …
   ])

(def ^:private dashboard-write-args-schema
  [:map {:closed true}
   [:method
    [:enum {:description (str "\"create\" makes a new dashboard (requires `name`); "
                              "\"update\" edits the one named by `id`.")}
     "create" "update"]]
   [:id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the dashboard to update."}]
             [:string {:description "21-character entity_id of the dashboard to update."}]]]]
   [:name {:optional true} [:maybe [:string {:min 1}]]]
   [:description {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe [:or :int :string]]]
   [:collection_position {:optional true} [:maybe [:int {:min 1}]]]
   [:width {:optional true} [:maybe [:enum "fixed" "full"]]]
   [:auto_apply_filters {:optional true} [:maybe :boolean]]
   [:cache_ttl {:optional true} [:maybe [:int {:min 1}]]]
   [:archived {:optional true}
    [:maybe [:boolean {:description (str "Update only: true moves it to the trash, false restores it. "
                                          "Archiving is the only removal path — there is no hard delete.")}]]]
   [:validate_only {:optional true}
    [:maybe [:boolean {:description "Dry run: returns the layout the ops would produce, writing nothing."}]]]
   [:ops {:optional true} [:maybe [:sequential op-schema]]]])

(def ^:private dashboard-write-entry
  {:tool-name       "dashboard_write"
   :update-scope    metabot.scope/agent-dashboard-update
   :create-required [:name]})

;;; ------------------------------------------------- Handler ------------------------------------------------------

(def ^:private attribute-keys
  [:name :description :collection_id :collection_position :width :auto_apply_filters :cache_ttl :archived])

(defn- apply-ops!
  "Compile `ops` against `dash` and save, or return the would-be layout when `validate_only`."
  [dash ops attrs validate-only?]
  (let [cards   (fetch-cards (referenced-card-ids dash ops))
        _       (check-cards-exist! ops cards)
        payload (dashboard-ops/compile-ops dash ops cards)]
    ;; Validate against the same schema `PUT /api/dashboard/:id` uses, so a dry run rejects
    ;; anything the real save would.
    (when-let [explanation (mr/explain dashboards-rest.api/DashUpdates (merge attrs payload))]
      (common/throw-teaching-error
       (format "The requested ops produce an invalid dashboard: %s"
               (pr-str (me/humanize explanation)))))
    (if validate-only?
      (merge dash payload)
      (dashboards-rest.api/update-dashboard! (:id dash) (merge attrs payload)))))

(registry/deftool dashboard-write
  "Create or update a dashboard, and edit its layout with ordered operations. method: \"create\" requires name;
  method: \"update\" requires id and accepts archived (true trashes, false restores — there is no hard delete).
  ops is an ordered list applied as one atomic save: nothing is written unless every op succeeds, so a failed
  call leaves the dashboard untouched and a retry cannot double-add. Give each new card or tab its own negative
  id (-1, -2, …); later ops in the same call reference it by that id, and the server assigns the real id on save.
  Ops: add_card, add_text, add_heading, add_link, add_iframe, add_action, duplicate_card, replace_card, move,
  resize, remove, set_series, patch_dashcard, add_tab, rename_tab, move_tab, duplicate_tab, remove_tab,
  add_parameter, update_parameter, remove_parameter, move_parameter, wire_parameter, unwire_parameter.
  Omit position to autoplace. patch_dashcard merges content only — use move, resize, replace_card, or set_series
  for layout and identity. Parameter ids are strings you choose. wire_parameter with autowire: true also maps
  every other card that exposes the same field. validate_only: true returns the layout the ops would produce
  without writing. Returns the resulting dashboard, so no follow-up read is needed. Requires write permission
  on the dashboard and read permission on every card referenced."
  {:name         "dashboard_write"
   :scope        metabot.scope/agent-dashboard-create
   :update-scope metabot.scope/agent-dashboard-update
   :args         dashboard-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [dispatched (common/dispatch-write dashboard-write-entry token-scopes args)]
    (case (first dispatched)
      :create
      (let [[_ body] dispatched]
        (when (contains? body :archived)
          (common/throw-teaching-error
           "`archived` applies to method \"update\" only — remove it from this create call."))
        (let [created (dashboards-rest.api/create-dashboard! (select-keys body attribute-keys))
              result  (if (seq (:ops body))
                        (apply-ops! (t2/hydrate created [:dashcards :series :card] :tabs)
                                    (:ops body) {} (:validate_only body))
                        created)]
          (dashboard-response result)))

      :update
      (let [[_ id body] dispatched
            dash        (fetch-dashboard id)
            attrs       (select-keys body attribute-keys)]
        (dashboard-response
         (if (seq (:ops body))
           (apply-ops! dash (:ops body) attrs (:validate_only body))
           (dashboards-rest.api/update-dashboard! (:id dash) attrs)))))))
```

Three things to resolve while implementing, all requiring you to read the code rather than guess:

0. **What `validate_only` cannot check.** Parameter-mapping permission checks (`check-parameter-mapping-permissions`, api.clj:768) run inside `create-dashcards!`/`update-dashcards!`, so a dry run does not exercise them: a caller can get a clean `validate_only` and still hit a 403 on the real save. Say so in the tool description — one sentence, e.g. "validate_only checks the ops and the resulting layout; per-field permission checks run only on the real save." Do not try to replicate those checks in the compiler.

1. `collection_id` accepts `null` / `"root"` per the v2 convention — run it through `common/resolve-collection-id` (`src/metabase/mcp/v2/common.clj:205`) before handing it to the domain fn.
2. The `op-schema` above shows only `add_card`. Write out all 24 entries. Each op's args are listed in the spec's op grammar table (`docs/superpowers/specs/2026-07-21-dashboard-write-tool-design.md`), and the implementation in `dashboard_ops.clj` is the authority on which keys each `apply-op` method reads — cross-check every entry against its method. `:description` strings on the ops and their fields are what the agent actually sees; write them for an agent that has never used this API.

- [ ] **Step 4: Register the tool**

In `src/metabase/mcp/v2/api.clj`, add to the registration requires alongside the existing tool namespaces (`:require` block around line 14-17):

```clojure
   [metabase.mcp.v2.tools.dashboard]
```

Keep the requires alphabetized to match the existing block.

- [ ] **Step 5: Run to verify they pass**

Run: `./bin/test-agent :only '[metabase.mcp.v2.tools.dashboard-test]'`
Expected: PASS, 11 tests.

Then verify the tool appears in the manifest and its schema is consumable:

Run: `./bin/test-agent :only '[metabase.mcp.v2.api-test metabase.mcp.v2.common-test]'`
Expected: PASS. A failure here usually means an optional arg is missing its `[:maybe …]` wrapper — `register-tool!` asserts that at load time.

- [ ] **Step 6: Lint and commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/tools/dashboard.clj src/metabase/mcp/v2/api.clj test/metabase/mcp/v2/tools/dashboard_test.clj
git add src/metabase/mcp/v2/tools/dashboard.clj src/metabase/mcp/v2/api.clj test/metabase/mcp/v2/tools/dashboard_test.clj
git commit -m "GHY-4147: dashboard_write tool"
```

---

## Task 10: Skill, module config, and full verification

**Files:**
- Create: `resources/metabot/skills/dashboard-write.md`
- Modify: `.clj-kondo/config/modules/config.edn` (generated — do not hand-edit)

**Interfaces:**
- Consumes: everything above.
- Produces: a skill discoverable through `load_skill`, and a modules config that matches the source.

- [ ] **Step 1: Write the skill**

Create `resources/metabot/skills/dashboard-write.md`. The frontmatter schema is at `src/metabase/metabot/skills.clj:36-46`; read it and match the key names exactly. `:tools` is what associates the skill with the tool.

```markdown
---
id: dashboard-write
title: Building dashboards
description: How to compose dashboard layouts with dashboard_write's ordered operations.
tools: ["dashboard_write"]
---

Dashboards are edited with ordered **operations**, not by sending a whole dashboard back. One
call applies every op atomically: if any op fails, nothing is written, and the error names the
op's index.

## Give new things negative ids

A card or tab you are creating has no id yet, so you choose one — any negative integer. Later ops
in the same call refer to it by that id, and the server swaps in the real id when it saves.

```json
{"method": "update", "id": 12, "ops": [
  {"op": "add_tab", "id": -1, "name": "Q3"},
  {"op": "add_card", "id": -2, "card_id": 118, "tab": -1},
  {"op": "add_card", "id": -3, "card_id": 119, "tab": -1, "position": {"row": 0, "col": 12}}
]}
```

Omit `position` and the card is placed below what is already there.

## Read before you edit

`get_content(type: "dashboard", id: …)` shows every dashcard's id, which is what `move`, `resize`,
`remove`, `replace_card`, `patch_dashcard`, and `wire_parameter` take. Use
`get_content(… include: "layout")` to see the visualization settings `patch_dashcard` edits.

## Parameters

You choose the parameter's id — any string. Add it, then wire it to each card:

```json
{"method": "update", "id": 12, "ops": [
  {"op": "add_parameter", "parameter_id": "p_date", "name": "Date", "type": "date/all-options"},
  {"op": "wire_parameter", "parameter_id": "p_date", "dashcard_id": 44,
   "target_field": 187, "autowire": true}
]}
```

`autowire: true` also maps every other card exposing that field, skipping the ones that don't.

## Check first when you're unsure

`validate_only: true` returns the layout your ops would produce without writing anything.

## What this tool does not do

Creating the questions themselves is `question_write` — including questions saved inside a
dashboard, via its `dashboard_id`. Public links and embedding are admin settings.
```

Verify the file loads: skills are read from `metabot/skills` on the classpath (`src/metabase/metabot/skills.clj:59`) and validated against the frontmatter schema at load, so a bad key fails the skills test.

Run: `./bin/test-agent :only '[metabase.metabot.skills-test]'`
Expected: PASS.

- [ ] **Step 2: Regenerate the modules config**

The tool namespace adds cross-module requires (`metabase.dashboards-rest.api`, `metabase.parameters.mapping-targets`), which shifts module boundaries.

Run: `./bin/mage fix-modules-config`
Expected: either `unchanged`, or an edit to `.clj-kondo/config/modules/config.edn` that you commit. If it prints `WARNING:` lines — a new module needing a `:team`, or modules needing reordering — resolve those by hand; do not suppress them with `:clj-kondo/ignore`.

Run: `./bin/test-agent :only '[metabase.core.modules-test]'`
Expected: PASS.

- [ ] **Step 3: Full lint sweep**

```bash
./bin/mage kondo \
  src/metabase/mcp/v2/tools/dashboard.clj \
  src/metabase/mcp/v2/dashboard_ops.clj \
  src/metabase/mcp/v2/projections.clj \
  src/metabase/mcp/v2/tools/content.clj \
  src/metabase/mcp/v2/api.clj \
  src/metabase/parameters/mapping_targets.clj \
  src/metabase/dashboards_rest/api.clj \
  test/metabase/mcp/v2/dashboard_ops_test.clj \
  test/metabase/mcp/v2/tools/dashboard_test.clj \
  test/metabase/parameters/mapping_targets_test.clj
```

Expected: 0 errors, 0 warnings. Delegate this to a subagent so the verbose output stays out of the main context; have it report only pass/fail and any findings.

- [ ] **Step 4: Full test sweep**

```bash
./bin/test-agent :only '[metabase.mcp.v2.dashboard-ops-test
                         metabase.mcp.v2.tools.dashboard-test
                         metabase.mcp.v2.tools.content-test
                         metabase.mcp.v2.api-test
                         metabase.parameters.mapping-targets-test
                         metabase.dashboards-rest.api-test
                         metabase.core.modules-test
                         metabase.core.kondo-ratchet-test]'
```

Expected: 0 failures, 0 errors. Paste the actual summary line into the commit discussion — do not claim a pass you have not seen.

- [ ] **Step 5: Commit**

```bash
git add resources/metabot/skills/dashboard-write.md .clj-kondo/config/modules/config.edn
git commit -m "GHY-4147: dashboard_write skill and module config"
```

---

## Deferred

Not in this plan, and not in this PR:

- **A REST endpoint for `mapping-targets`.** The namespace is written to support one so the frontend can eventually drop `getParameterMappingOptions`, but exposing it is separate work.
- **Sections** (client-side editor templates), **embedding and public links** (admin settings), and **dashboard questions** (`question_write` with `dashboard_id`) — explicitly out of the op grammar per the spec.
- **v2 resources/prompts wiring.** `src/metabase/mcp/v2/api.clj:60-63` defers `resources/*` and `prompts/*` to the skills work; the skill added here rides the existing v1 `resources/metabot/skills/` route.
