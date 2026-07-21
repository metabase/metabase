# `question_write` MCP v2 Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single MCP v2 write tool, `question_write`, that creates, updates, and archives/restores saved cards of type `question` and `model`.

**Architecture:** A new `metabase.mcp.v2.tools.question` namespace registers one tool with `registry/deftool`. `common/dispatch-write` splits create vs. update. A shared query-source resolver turns a `query_handle` / inline MBQL 5 / `native:{…}` into a `dataset_query`; the tool then mirrors the REST card create/update permission stack inline (the house pattern for v2 read tools) and calls `queries/create-card!` / `queries/update-card!`. A new `common/resolve-query-handle-for-save!` lets native handles through (the MBQL resolver rejects them).

**Tech Stack:** Clojure, Malli schemas, Toucan 2, `metabase.lib` (MBQL 5), the v2 MCP registry/common plumbing, `clojure.test` + `metabase.test`.

## Global Constraints

- **Base branch:** `mcp-v2-query-handles` (PR #77865). Cut the feature branch from it.
- **Scopes:** reuse existing `metabot.scope/agent-question-create` and `metabot.scope/agent-question-update` verbatim; **add no new scopes, rename none.**
- **No extra scope for native SQL** — native is gated by native-query *data* permission via `query-perms/check-run-permissions-for-query`, matching v1.
- **Optional schema fields must be `[:maybe …]`** — `tools-manifest/assert-optional-fields-nullable!` throws at load time otherwise.
- **Permissions are mirrored inline** by calling check fns directly (`api/create-check`, `api/write-check`, `query-perms/check-run-permissions-for-query`, `collection/check-allowed-to-change-collection`, `lib/check-card-overwrite`). Do **not** call REST handler fns, and do **not** extract Bryan's shared helper in this PR.
- **Teaching errors** use `common/throw-teaching-error` / `common/throw-not-found`; every message is a complete sentence naming the fix.
- **Kondo must pass with 0 errors and 0 warnings.** Lint with `./bin/mage kondo <files>`.
- **Run backend tests** with `clojure-eval` (preferred) or `./bin/test-agent :only '[metabase.mcp.v2.tools.question-test]'`. Never `clj -X:dev:test`.
- After backend changes that could shift module boundaries, run `./bin/mage fix-modules-config` (no-op if nothing drifted).
- **Commits:** no Claude attribution. Do not push unless asked.

---

## Verbatim references (read before starting)

**`metabase.mcp.v2.common` — existing, on the base branch:**

```clojure
(defn resolve-query-handle!
  "Resolve `handle` for `user-id` and re-run the fresh-query guards ..."
  [mcp-session-id user-id handle]
  (let [{:keys [encoded_query prompt]}
        (or (mcp.session/resolve-query-handle mcp-session-id user-id handle)
            (throw-teaching-error "Query handle not found — it may have expired; run the query again."))
        query (decode-stored-query encoded_query)]
    (query-guards/reject-native-query! query)
    (query-guards/validate-serialized-query! query)
    (query-guards/check-token-query-permissions! query)
    {:query query :prompt prompt}))

;; decode-stored-query is PRIVATE. To reuse it from resolve-query-handle-for-save!
;; (same ns), just call it directly.

(defn dispatch-write
  "Shared `method` dispatch for `_write` tools ... Returns [:create args] or [:update id args]."
  [{:keys [tool-name update-scope create-required]} token-scopes {:keys [method id] :as args}]
  ...)

(defn resolve-and-read [model id-or-eid read-check-fn] ...) ; 403/404 collapse to not-found
(defn resolve-id-or-404 [model id-or-eid] ...)
(defn resolve-collection-id
  ([id-or-sentinel] ...) ([id-or-sentinel {:keys [trash-collection-id]}] ...)) ; nil/"root" -> nil
(defn success-content ([text] ...) ([text structured] ...))
(defn throw-teaching-error ([msg] ...) ([msg data] ...))   ; defaults {:status-code 400}
(defn throw-not-found [model id] ...)                      ; {:status-code 404}
(defn check-update-scope! [token-scopes update-scope tool-name] ...)
```

**`metabase.agent-api.query-guards` — existing:**

```clojure
(defn native-query? [query-map] ...)          ; true for legacy :type :native OR mbql.stage/native
(defn reject-native-query! [query-map] ...)   ; throws 400 if native
(defn validate-serialized-query! [query-map] ...) ; requires non-empty :stages of maps; works for native stages too
(defn check-token-query-permissions! [query-map] ...) ; api/query-check on stage-0 integer source-table
```

**`metabase.queries` facade (aliased `queries`) — model layer keys:**

- `create-card!` accepts a card map + creator: `(queries/create-card! card-map {:id user-id})`.
  Card-map keys consumed: `:dataset_query :description :display :name :visualization_settings
  :parameters :parameter_mappings :collection_id :collection_position :cache_ttl :type
  :dashboard_id :document_id`, plus `:result_metadata`, `:dashboard_tab_id`, `:size`.
  `:type` defaults to `:question` when nil. `:dataset_query` is normalized internally.
- `update-card!` takes one map:
  `(queries/update-card! {:card-before-update <card> :card-updates <patch> :actor @api/*current-user* :delete-old-dashcards? false})`.
  Update patch keys (present-set, may be nil to unset): `:collection_id :collection_position
  :description :cache_ttl :archived_directly :dashboard_id :document_id`; (non-nil-set):
  `:dataset_query :display :name :visualization_settings :archived :type :result_metadata …`.

**v1 create/update stacks to mirror (`metabase.agent-api.api`, for reference only — do not call):**

```clojure
;; create:
(query-perms/check-run-permissions-for-query dataset-query)
(api/create-check :model/Card {:collection_id collection_id})
(queries/create-card! {...} {:id api/*current-user-id*})

;; update (card-before-update already write-checked):
(collection/check-allowed-to-change-collection card-before-update card-updates)
(when (api/column-will-change? :dataset_query card-before-update card-updates)
  (query-perms/check-run-permissions-for-query (:dataset_query card-updates))
  (try (lib/check-card-overwrite id (:dataset_query card-updates))
       (catch clojure.lang.ExceptionInfo e
         (let [data (ex-data e)]
           (throw (ex-info (ex-message e) (assoc data :status-code (or (:status-code data) 400))))))))
(queries/update-card! {...})
;; card-updates built with (api/updates-with-archived-directly card-before-update raw-updates)
```

**Namespaces to alias in the tool ns** (from the read-tool convention + the stacks above):

```clojure
(ns metabase.mcp.v2.tools.question
  (:require
   [metabase.api.common :as api]
   [metabase.collections.core :as collection]      ; check-allowed-to-change-collection
   [metabase.lib.core :as lib]                      ; native-query, with-template-tags, check-card-overwrite, can-save?
   [metabase.lib-be.core :as lib-be]                ; application-database-metadata-provider, normalize-query
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.query-permissions.core :as query-perms] ; check-run-permissions-for-query
   [metabase.queries.core :as queries]              ; create-card!, update-card!
   [metabase.util :as u]
   [toucan2.core :as t2]))
```

> Confirm each alias's real namespace at implementation time with a quick grep on the base branch (`git show origin/mcp-v2-query-handles:src/metabase/agent_api/api.clj | grep ':as query-perms'`, etc.) — module facades occasionally differ from the leaf ns.

**Test idiom:**

```clojure
(require '[metabase.mcp.v2.tools.question :as v2.question]) ; registration side effect
(comment v2.question/keep-me)
(registry/call-tool #{"agent:question:create"} session-id "question_write" args)
;; assert on (:isError result), (-> result :content first :text), (:structuredContent result)
;; fixtures: mt/with-temp, mt/with-current-user, mt/with-model-cleanup, mt/with-premium-features
;; scope sets: #{"agent:question:create"}, #{"agent:question:update"}, #{::scope/unrestricted}, denied sets
```

---

## Task 1: Native-permitting handle resolver

**Files:**
- Modify: `src/metabase/mcp/v2/common.clj` (add `resolve-query-handle-for-save!` after `resolve-query-handle!`)
- Test: `test/metabase/mcp/v2/common_test.clj`

**Interfaces:**
- Produces: `common/resolve-query-handle-for-save!` — `[mcp-session-id user-id handle] -> {:query <map> :prompt <string-or-nil>}`. Runs `validate-serialized-query!` + `check-token-query-permissions!`, **skips** `reject-native-query!`. Throws teaching errors for unknown/expired handle, malformed query, missing permissions.

- [ ] **Step 1: Write the failing test**

Add to `test/metabase/mcp/v2/common_test.clj` (reuse the file's existing `thrown`, `mbql-handle!` helpers and `mt/with-model-cleanup`/`mt/with-current-user` idiom):

```clojure
(deftest resolve-query-handle-for-save-allows-native-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [uid (mt/user->id :rasta)
          sid (str (random-uuid))]
      (mt/with-current-user uid
        (testing "a stored NATIVE query resolves on the save path (no native reject)"
          (let [native {:database (mt/id)
                        :stages [{:lib/type :mbql.stage/native :native "SELECT 1"}]}
                h (common/mint-query-handle! sid uid (common/encode-serialized-query native))]
            (is (= native (:query (common/resolve-query-handle-for-save! sid uid h))))))
        (testing "an unknown handle is a teaching error, not a 500"
          (is (= [400 "Query handle not found — it may have expired; run the query again."]
                 (thrown #(common/resolve-query-handle-for-save! sid uid (str (random-uuid)))))))))))
```

- [ ] **Step 2: Run test to verify it fails**

```clojure
;; via clojure-eval
(require 'metabase.mcp.v2.common-test :reload)
(clojure.test/run-test-var #'metabase.mcp.v2.common-test/resolve-query-handle-for-save-allows-native-test)
```
Expected: FAIL — `Unable to resolve: resolve-query-handle-for-save!`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/metabase/mcp/v2/common.clj` immediately after `resolve-query-handle!`:

```clojure
(defn resolve-query-handle-for-save!
  "Like [[resolve-query-handle!]] but for the save/write path: resolves `handle` for `user-id`,
   re-runs the shape and permission guards, and — unlike the MBQL read path — DOES allow a native
   query through. `execute_sql` mints handles specifically so their SQL can be saved; the
   native-reject guard would otherwise make those handles unsaveable. Returns
   `{:query <decoded map> :prompt <string-or-nil>}`, or throws a teaching error."
  [mcp-session-id user-id handle]
  (let [{:keys [encoded_query prompt]}
        (or (mcp.session/resolve-query-handle mcp-session-id user-id handle)
            (throw-teaching-error "Query handle not found — it may have expired; run the query again."))
        query (decode-stored-query encoded_query)]
    (query-guards/validate-serialized-query! query)
    (query-guards/check-token-query-permissions! query)
    {:query query :prompt prompt}))
```

- [ ] **Step 4: Run test to verify it passes**

Re-run the test var from Step 2. Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/common.clj test/metabase/mcp/v2/common_test.clj
git add src/metabase/mcp/v2/common.clj test/metabase/mcp/v2/common_test.clj
git commit -m "Add native-permitting query-handle resolver for MCP saves (GHY-4145)"
```

---

## Task 2: Query-source resolution + exactly-one validation

Build the pure resolver that turns the three sources into a `dataset_query`. No template-tag typing yet (Task 3), no card creation yet (Task 4).

**Files:**
- Create: `src/metabase/mcp/v2/tools/question.clj`
- Test: `test/metabase/mcp/v2/tools/question_test.clj`

**Interfaces:**
- Produces: `resolve-query-source` (private) — `[{:keys [query_handle query native]} session-id] -> dataset-query-map`. Enforces exactly-one-source with a teaching error. `query_handle` → `common/resolve-query-handle-for-save!` (returns `:query`); `query` → `lib-be/normalize-query`; `native` → `lib/native-query` (tags auto-extracted; no caller tags yet).

- [ ] **Step 1: Write the failing test**

Create `test/metabase/mcp/v2/tools/question_test.clj`:

```clojure
(ns metabase.mcp.v2.tools.question-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.tools.question :as v2.question]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(comment v2.question/keep-me)

(deftest resolve-query-source-exactly-one-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "zero sources is a teaching error"
      (is (thrown-with-msg? Exception #"exactly one"
                            (#'v2.question/resolve-query-source {} nil))))
    (testing "two sources is a teaching error"
      (is (thrown-with-msg? Exception #"exactly one"
                            (#'v2.question/resolve-query-source
                             {:query {:database (mt/id) :stages [{}]}
                              :native {:database_id (mt/id) :sql "SELECT 1"}} nil))))
    (testing "native builds a native dataset_query"
      (let [q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id) :sql "SELECT 1"}} nil)]
        (is (=? {:stages [{:lib/type :mbql.stage/native :native "SELECT 1"}]} q))))))
```

- [ ] **Step 2: Run to verify it fails**

```clojure
(require 'metabase.mcp.v2.tools.question-test :reload)
```
Expected: FAIL — namespace `metabase.mcp.v2.tools.question` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/metabase/mcp/v2/tools/question.clj` with the ns form from the references block above, plus:

```clojure
(defn- resolve-query-source
  "Resolve exactly one query source to a `dataset_query` map. `query_handle` re-runs the
   save-path guards (native allowed); `query` is inline MBQL 5; `native` is built from raw SQL."
  [{:keys [query_handle query native]} session-id]
  (let [sources (cond-> []
                  query_handle (conj :query_handle)
                  query        (conj :query)
                  native       (conj :native))]
    (when-not (= 1 (count sources))
      (common/throw-teaching-error
       "Pass exactly one query source: `query_handle` (a handle from an execute tool), `query` (inline MBQL 5), or `native` ({database_id, sql})."))
    (cond
      query_handle
      (:query (common/resolve-query-handle-for-save! session-id api/*current-user-id* query_handle))

      query
      (lib-be/normalize-query query)

      native
      (let [{:keys [database_id sql]} native
            mp (lib-be/application-database-metadata-provider database_id)]
        (lib/native-query mp sql)))))
```

- [ ] **Step 4: Run to verify it passes**

Re-run the test namespace. Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/tools/question.clj test/metabase/mcp/v2/tools/question_test.clj
git add src/metabase/mcp/v2/tools/question.clj test/metabase/mcp/v2/tools/question_test.clj
git commit -m "Add question_write query-source resolver (GHY-4145)"
```

---

## Task 3: Native `template_tags` typing + `{{}}` validation

Extend the `native` branch to apply caller-supplied typed template tags, validated against the `{{tag}}` occurrences present in the SQL.

**Files:**
- Modify: `src/metabase/mcp/v2/tools/question.clj` (`resolve-query-source` native branch + new helpers)
- Test: `test/metabase/mcp/v2/tools/question_test.clj`

**Interfaces:**
- Produces: `apply-template-tags` (private) — `[query native-arg] -> query`. Validates each supplied tag name appears in the SQL (via `lib/native-query`'s auto-extracted tags), maps the tool's tag shape (`{type, ...}` with `type ∈ text|number|date|dimension`) to the lib template-tag map, and applies via `lib/with-template-tags`. Unknown tag name / bad type → teaching error.

- [ ] **Step 1: Write the failing test**

Append to `question_test.clj`:

```clojure
(deftest native-template-tags-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "a supplied tag not present in the SQL is a teaching error"
      (is (thrown-with-msg? Exception #"\{\{missing\}\}"
                            (#'v2.question/resolve-query-source
                             {:native {:database_id (mt/id)
                                       :sql "SELECT 1"
                                       :template_tags {"missing" {:type "number"}}}} nil))))
    (testing "a typed tag present in the SQL is applied"
      (let [q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE total > {{min_total}}"
                         :template_tags {"min_total" {:type "number"}}}} nil)]
        (is (= :number (get-in q [:stages 0 :template-tags "min_total" :type])))))))
```

- [ ] **Step 2: Run to verify it fails**

```clojure
(require 'metabase.mcp.v2.tools.question-test :reload)
(clojure.test/run-test-var #'metabase.mcp.v2.tools.question-test/native-template-tags-test)
```
Expected: FAIL — supplied tags are ignored, no validation.

- [ ] **Step 3: Write minimal implementation**

Add helpers and update the `native` branch:

```clojure
(def ^:private tag-type->kw
  {"text" :text "number" :number "date" :date "dimension" :dimension})

(defn- ->lib-template-tag
  "Map the tool's tag shape onto the lib template-tag map, preserving the auto-extracted tag's
   :id/:name. `dimension` tags carry a field ref and widget type."
  [existing-tag {tag-type :type :keys [display_name dimension widget_type required default]}]
  (let [t (or (tag-type->kw tag-type)
              (common/throw-teaching-error
               (format "Invalid template tag type %s — use \"text\", \"number\", \"date\", or \"dimension\"."
                       (pr-str tag-type))))]
    (cond-> (assoc existing-tag :type t)
      display_name (assoc :display-name display_name)
      (some? required) (assoc :required (boolean required))
      (some? default) (assoc :default default)
      (= t :dimension) (assoc :dimension dimension :widget-type (keyword widget_type)))))

(defn- apply-template-tags
  "Apply caller-supplied `template_tags` to a native `query`. Every supplied tag name must appear
   in the SQL (i.e. among the tags `lib/native-query` auto-extracted); unknown names are a
   teaching error naming the tag."
  [query template_tags]
  (if (empty? template_tags)
    query
    (let [present (set (keys (get-in query [:stages 0 :template-tags])))]
      (doseq [tag-name (keys template_tags)]
        (when-not (contains? present (name tag-name))
          (common/throw-teaching-error
           (format "Template tag %s does not appear in the SQL — add {{%s}} to the query or drop the tag."
                   (str "{{" (name tag-name) "}}") (name tag-name)))))
      (lib/with-template-tags
        query
        (into {}
              (map (fn [[tag-name tag]]
                     (let [nm (name tag-name)]
                       [nm (->lib-template-tag (get-in query [:stages 0 :template-tags nm]) tag)])))
              template_tags)))))
```

Update the `native` branch of `resolve-query-source`:

```clojure
      native
      (let [{:keys [database_id sql template_tags]} native
            mp (lib-be/application-database-metadata-provider database_id)]
        (-> (lib/native-query mp sql)
            (apply-template-tags template_tags)))
```

> If `lib/with-template-tags` rejects the map shape, adjust `->lib-template-tag` to match `metabase.lib.schema.template-tag` (raw-value tags need `:id :name :type`; dimension tags additionally need `:dimension` and `:widget-type`). Verify interactively in the REPL against `(lib/native-query mp "... {{x}} ...")` output.

- [ ] **Step 4: Run to verify it passes**

Re-run `native-template-tags-test`. Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/tools/question.clj test/metabase/mcp/v2/tools/question_test.clj
git add -u && git commit -m "Add native template-tag typing and validation to question_write (GHY-4145)"
```

---

## Task 4: Create path (question) — perms stack, collection, defaults, response

Wire a `create!` that resolves the query, mirrors the REST create pre-checks, and saves a `question` card. Register the tool with `deftool` so it is callable end-to-end (schema + dispatch land here; model/dashboard/update extend it).

**Files:**
- Modify: `src/metabase/mcp/v2/tools/question.clj` (schema, `create!`, `deftool`)
- Modify: `src/metabase/mcp/v2/api.clj` (add the tool ns to `:require`)
- Test: `test/metabase/mcp/v2/tools/question_test.clj`

**Interfaces:**
- Produces: registered tool `"question_write"`; private `create!` — `[args session-id] -> card-response-map`. `card-response` — `[card] -> {:id :name :url :display :collection_id :collection_path :description}`.
- Consumes: `resolve-query-source` (Task 2/3), `common/dispatch-write`, `common/resolve-collection-id`.

- [ ] **Step 1: Write the failing test**

Append to `question_test.clj`:

```clojure
(deftest create-question-happy-path-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [args   {:method "create"
                    :name "Agent Q"
                    :query {:database (mt/id)
                            :stages [{:source-table (mt/id :orders)}]}}
            result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
        (is (not (:isError result)) (-> result :content first :text))
        (let [card-id (:id (:structuredContent result))]
          (is (int? card-id))
          (is (= "Agent Q" (t2/select-one-fn :name :model/Card :id card-id)))
          (is (= :question (t2/select-one-fn :type :model/Card :id card-id))))))))

(deftest create-question-name-required-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [result (registry/call-tool #{"agent:question:create"} nil "question_write"
                                     {:method "create" :query {:database (mt/id) :stages [{}]}})]
      (is (:isError result))
      (is (re-find #"`name` is required" (-> result :content first :text))))))
```

Add `registry` and `t2` to the test ns `:require` (`[metabase.mcp.v2.registry :as registry]`, `[toucan2.core :as t2]`).

- [ ] **Step 2: Run to verify it fails**

```clojure
(require 'metabase.mcp.v2.tools.question-test :reload)
(clojure.test/run-test-var #'metabase.mcp.v2.tools.question-test/create-question-happy-path-test)
```
Expected: FAIL — tool `"question_write"` not registered (`Unknown tool`).

- [ ] **Step 3: Write minimal implementation**

Add the response helper, `create!`, the schema, and the `deftool` to `question.clj`. Add `[metabase.channel.urls :as channel.urls]` and whatever provides `frontend-url`/`collection-path` — grep v1 `agent_api/api.clj` for `frontend-url` and `collection-path` and reuse the same source, or inline a minimal URL from `channel.urls/card-path`.

```clojure
(def ^:private card-display-enum
  [:enum "table" "bar" "line" "pie" "scatter" "area" "row" "combo" "pivot"
   "scalar" "smartscalar" "gauge" "progress" "funnel" "map" "waterfall" "sankey"])

(defn- collection-path [collection-id]
  (when collection-id
    (->> (t2/select-one-fn :location [:model/Collection :location] :id collection-id))))

(defn- card-response [card]
  {:id              (:id card)
   :name            (:name card)
   :display         (name (:display card))
   :collection_id   (:collection_id card)
   :collection_path (collection-path (:collection_id card))
   :description     (:description card)})

(defn- create!
  [{:keys [name description display visualization_settings cache_ttl collection_position
           card_type] :as args}
   session-id]
  (let [dataset-query (resolve-query-source args session-id)
        collection-id (if (contains? args :collection_id)
                        (common/resolve-collection-id (:collection_id args))
                        (queries/user-personal-collection-id api/*current-user-id*))] ; confirm fn name
    (query-perms/check-run-permissions-for-query dataset-query)
    (api/create-check :model/Card {:collection_id collection-id})
    (card-response
     (queries/create-card!
      (u/remove-nils
       {:name                   name
        :type                   (keyword (or card_type "question"))
        :dataset_query          dataset-query
        :display                (keyword (or display "table"))
        :description            description
        :collection_id          collection-id
        :collection_position    collection_position
        :cache_ttl              cache_ttl
        :visualization_settings (or visualization_settings {})})
      {:id api/*current-user-id*}))))

(def ^:private question-write-args-schema
  [:map {:closed true}
   [:method [:enum "create" "update"]]
   [:id {:optional true} [:maybe [:or :int :string]]]
   [:card_type {:optional true} [:maybe [:enum "question" "model"]]]
   [:query_handle {:optional true} [:maybe :string]]
   [:query {:optional true} [:maybe :map]]
   [:native {:optional true}
    [:maybe [:map
             [:database_id [:or :int :string]]
             [:sql [:string {:min 1}]]
             [:template_tags {:optional true} [:maybe :map]]]]]
   [:name {:optional true} [:maybe [:string {:min 1}]]]
   [:description {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe [:or :int :string]]]
   [:collection_position {:optional true} [:maybe :int]]
   [:display {:optional true} [:maybe card-display-enum]]
   [:visualization_settings {:optional true} [:maybe :map]]
   [:cache_ttl {:optional true} [:maybe :int]]
   [:archived {:optional true} [:maybe :boolean]]])

(registry/deftool question-write-tool
  "Create, update, or archive a saved question or model. method: \"create\" | \"update\". On create, pass a name and exactly one query source: query_handle (a handle from an execute tool — MBQL or native SQL), query (inline MBQL 5), or native ({database_id, sql, template_tags?}). Optional: card_type (\"question\" default, or \"model\"), description, collection_id (omit for your personal collection, null/\"root\" for root), display, visualization_settings, cache_ttl. On update, pass id and any fields to change; archived: true trashes, false restores."
  {:name         "question_write"
   :scope        metabot.scope/agent-question-create
   :update-scope metabot.scope/agent-question-update
   :annotations  {:readOnlyHint false :destructiveHint false}
   :args         question-write-args-schema}
  [args {:keys [token-scopes session-id]}]
  (let [[op a b] (common/dispatch-write
                  {:tool-name "question_write"
                   :update-scope metabot.scope/agent-question-update
                   :create-required [:name]}
                  token-scopes args)
        payload (case op
                  :create (create! a session-id)
                  :update (update! a b session-id))] ; update! lands in Task 7; stub to throw until then
    (common/success-content payload payload)))
```

For this task, stub `update!` so the ns compiles:

```clojure
(defn- update! [_id _args _session-id]
  (common/throw-teaching-error "Updating questions is not yet implemented."))
```

Add to `metabase.mcp.v2.api`'s `:require`:

```clojure
   [metabase.mcp.v2.tools.question]
```
and a `(comment ...keep-me)` if the ns lint requires the require be referenced.

> Confirm `queries/user-personal-collection-id` (or the equivalent that v1 `personal-collection-id` wraps) and `u/remove-nils` real names at implementation time; v1 `agent_api/api.clj` shows the personal-collection call it uses.

- [ ] **Step 4: Run to verify it passes**

Re-run both create tests. Expected: PASS. Also confirm the tool now lists:

```clojure
(map :name (registry/list-tools #{"agent:question:create"})) ; includes "question_write"
```

- [ ] **Step 5: Lint + commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/tools/question.clj src/metabase/mcp/v2/api.clj test/metabase/mcp/v2/tools/question_test.clj
git add -u && git commit -m "Add question_write create path for questions (GHY-4145)"
```

---

## Task 5: Model `card_type` — column_metadata → result_metadata

Support `card_type: "model"` and persist `column_metadata` as `result_metadata`.

**Files:**
- Modify: `src/metabase/mcp/v2/tools/question.clj` (schema `column_metadata`, `create!` result_metadata)
- Test: `test/metabase/mcp/v2/tools/question_test.clj`

**Interfaces:**
- Produces: `->result-metadata` (private) — `[column_metadata] -> [{:name :display_name :description :semantic_type :visibility_type}]` (drops nils; passes through to `create-card!` `:result_metadata`).

- [ ] **Step 1: Write the failing test**

```clojure
(deftest create-model-with-column-metadata-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [args   {:method "create"
                    :card_type "model"
                    :name "Agent Model"
                    :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}
                    :column_metadata [{:name "total" :display_name "Total $" :semantic_type "type/Currency"}]}
            result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
        (is (not (:isError result)) (-> result :content first :text))
        (let [card-id (:id (:structuredContent result))]
          (is (= :model (t2/select-one-fn :type :model/Card :id card-id))))))))
```

- [ ] **Step 2: Run to verify it fails**

```clojure
(clojure.test/run-test-var #'metabase.mcp.v2.tools.question-test/create-model-with-column-metadata-test)
```
Expected: FAIL — `column_metadata` not in the closed schema → validation error.

- [ ] **Step 3: Write minimal implementation**

Add to the schema map (before the closing bracket):

```clojure
   [:column_metadata {:optional true}
    [:maybe [:sequential
             [:map
              [:name [:string {:min 1}]]
              [:display_name {:optional true} [:maybe :string]]
              [:description {:optional true} [:maybe :string]]
              [:semantic_type {:optional true} [:maybe :string]]
              [:visibility_type {:optional true} [:maybe :string]]]]]]
```

Add the helper and thread it into `create!`:

```clojure
(defn- ->result-metadata [column_metadata]
  (mapv (fn [{:keys [name display_name description semantic_type visibility_type]}]
          (u/remove-nils
           {:name            name
            :display_name    (or display_name name)
            :description     description
            :semantic_type   (some-> semantic_type keyword)
            :visibility_type (some-> visibility_type keyword)}))
        column_metadata))
```

In `create!`, destructure `column_metadata`, and assoc onto the card map when present:

```clojure
        (cond-> (u/remove-nils {... existing ...})
          (seq column_metadata) (assoc :result_metadata (->result-metadata column_metadata)))
```

> Model-in-dashboard is rejected at the model layer; that interaction is exercised in Task 6.

- [ ] **Step 4: Run to verify it passes**

Re-run the model test. Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/tools/question.clj test/metabase/mcp/v2/tools/question_test.clj
git add -u && git commit -m "Add model card_type and column_metadata to question_write (GHY-4145)"
```

---

## Task 6: Dashboard questions — `dashboard_id`

Support saving a card inside a dashboard (dashboard questions), with the collection inferred from the dashboard and the model-layer constraints (question-type only, no collection_position).

**Files:**
- Modify: `src/metabase/mcp/v2/tools/question.clj` (schema `dashboard_id`, `create!` collection inference + create-check target)
- Test: `test/metabase/mcp/v2/tools/question_test.clj`

**Interfaces:**
- Consumes: `common/resolve-id-or-404 :model/Dashboard`.
- Produces: `create!` handles `dashboard_id` — infers the collection from the dashboard, checks `create-check` against that collection, passes `:dashboard_id` to `create-card!`.

- [ ] **Step 1: Write the failing test**

```clojure
(deftest create-dashboard-question-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard dash {:collection_id nil}]
        (let [args   {:method "create"
                      :name "Dash Q"
                      :dashboard_id (:id dash)
                      :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}}
              result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
          (is (not (:isError result)) (-> result :content first :text))
          (let [card-id (:id (:structuredContent result))]
            (is (= (:id dash) (t2/select-one-fn :dashboard_id :model/Card :id card-id)))))))))
```

- [ ] **Step 2: Run to verify it fails**

```clojure
(clojure.test/run-test-var #'metabase.mcp.v2.tools.question-test/create-dashboard-question-test)
```
Expected: FAIL — `dashboard_id` not in the closed schema.

- [ ] **Step 3: Write minimal implementation**

Add to the schema:

```clojure
   [:dashboard_id {:optional true} [:maybe [:or :int :string]]]
```

In `create!`, resolve `dashboard_id` and let it drive the collection:

```clojure
  (let [dataset-query (resolve-query-source args session-id)
        dashboard-id  (some->> (:dashboard_id args) (common/resolve-id-or-404 :model/Dashboard))
        collection-id (cond
                        dashboard-id (t2/select-one-fn :collection_id :model/Dashboard :id dashboard-id)
                        (contains? args :collection_id) (common/resolve-collection-id (:collection_id args))
                        :else (queries/user-personal-collection-id api/*current-user-id*))]
    (query-perms/check-run-permissions-for-query dataset-query)
    (api/create-check :model/Card {:collection_id collection-id})
    (card-response
     (queries/create-card!
      (cond-> (u/remove-nils {... existing keys ...})
        (seq column_metadata) (assoc :result_metadata (->result-metadata column_metadata))
        dashboard-id          (assoc :dashboard_id dashboard-id))
      {:id api/*current-user-id*})))
```

The model layer enforces question-type-only and no `collection_position` for dashboard-internal cards; surface those as-is (they already carry `:status-code 400`, so `dispatch-tool-call`'s `->mcp-error-content` renders them as teaching errors).

- [ ] **Step 4: Run to verify it passes**

Re-run the dashboard test. Expected: PASS. Add a negative test: a `model` + `dashboard_id` returns `:isError` with the model-layer 400 message.

- [ ] **Step 5: Lint + commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/tools/question.clj test/metabase/mcp/v2/tools/question_test.clj
git add -u && git commit -m "Add dashboard-question support to question_write (GHY-4145)"
```

---

## Task 7: Update path — patch, archive/restore, move + query-swap checks

Replace the `update!` stub with the real update path: read+write-check, allowlist patch, archive/restore, collection-move and query-swap permission checks.

**Files:**
- Modify: `src/metabase/mcp/v2/tools/question.clj` (`update!`, `update-card-response`)
- Test: `test/metabase/mcp/v2/tools/question_test.clj`

**Interfaces:**
- Produces: `update!` — `[id args session-id] -> update-card-response-map`. `update-card-response` — card-response plus `:archived`.
- Consumes: `common/resolve-and-read`, `collection/check-allowed-to-change-collection`, `api/updates-with-archived-directly`, `api/column-will-change?`, `lib/check-card-overwrite`.

- [ ] **Step 1: Write the failing tests**

```clojure
(deftest update-question-rename-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:name "Before"}]
      (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                       {:method "update" :id (:id card) :description "new desc"})]
        (is (not (:isError result)) (-> result :content first :text))
        (is (= "new desc" (t2/select-one-fn :description :model/Card :id (:id card))))))))

(deftest update-archive-restore-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:archived false}]
      (registry/call-tool #{::scope/unrestricted} nil "question_write" {:method "update" :id (:id card) :archived true})
      (is (true? (t2/select-one-fn :archived :model/Card :id (:id card))))
      (registry/call-tool #{::scope/unrestricted} nil "question_write" {:method "update" :id (:id card) :archived false})
      (is (false? (t2/select-one-fn :archived :model/Card :id (:id card)))))))

(deftest update-not-found-collapses-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [result (registry/call-tool #{::scope/unrestricted} nil "question_write"
                                     {:method "update" :id 999999999 :name "x"})]
      (is (:isError result))
      (is (re-find #"not found" (-> result :content first :text))))))

(deftest update-scope-denied-test
  (mt/with-temp [:model/Card card {:name "X"}]
    (let [result (registry/call-tool #{"agent:question:create"} nil "question_write"
                                     {:method "update" :id (:id card) :name "Y"})]
      (is (:isError result))
      (is (re-find #"method: update" (-> result :content first :text))))))
```

Add `[metabase.api.macros.scope :as scope]` to the test `:require` for `::scope/unrestricted`.

- [ ] **Step 2: Run to verify they fail**

```clojure
(require 'metabase.mcp.v2.tools.question-test :reload)
(clojure.test/run-tests 'metabase.mcp.v2.tools.question-test)
```
Expected: the four update tests FAIL (stub throws "not yet implemented"); scope-denied may already pass via `dispatch-write`.

- [ ] **Step 3: Write minimal implementation**

Replace the `update!` stub:

```clojure
(defn- update-card-response [card]
  (assoc (card-response card) :archived (boolean (:archived card))))

(defn- update!
  [id {:keys [name description display visualization_settings cache_ttl collection_position
              card_type archived column_metadata] :as args} session-id]
  (let [card-before (common/resolve-and-read
                     :model/Card id
                     (fn [cid] (api/write-check :model/Card cid)))
        new-query   (when (or (:query_handle args) (:query args) (:native args))
                      (lib-be/normalize-query (resolve-query-source args session-id)))
        raw-updates (cond-> {}
                      (contains? args :name)                    (assoc :name name)
                      (contains? args :description)             (assoc :description description)
                      (contains? args :collection_id)           (assoc :collection_id (common/resolve-collection-id (:collection_id args)))
                      (contains? args :collection_position)     (assoc :collection_position collection_position)
                      (contains? args :display)                 (assoc :display (some-> display keyword))
                      (contains? args :visualization_settings)  (assoc :visualization_settings visualization_settings)
                      (contains? args :cache_ttl)               (assoc :cache_ttl cache_ttl)
                      (contains? args :card_type)               (assoc :type (keyword card_type))
                      (contains? args :archived)                (assoc :archived (boolean archived))
                      (seq column_metadata)                     (assoc :result_metadata (->result-metadata column_metadata))
                      new-query                                 (assoc :dataset_query new-query))
        card-updates (api/updates-with-archived-directly card-before raw-updates)]
    (collection/check-allowed-to-change-collection card-before card-updates)
    (when (api/column-will-change? :dataset_query card-before card-updates)
      (query-perms/check-run-permissions-for-query (:dataset_query card-updates))
      (try
        (lib/check-card-overwrite id (:dataset_query card-updates))
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (throw (ex-info (ex-message e) (assoc data :status-code (or (:status-code data) 400))))))))
    (queries/update-card! {:card-before-update    card-before
                           :card-updates          card-updates
                           :actor                 @api/*current-user*
                           :delete-old-dashcards? false})
    (update-card-response (t2/select-one :model/Card :id id))))
```

> The `resolve-query-source` exactly-one check will reject "two sources"; on update, "zero sources" must be allowed. Guard the `new-query` binding on "at least one source present" (as written), and inside `resolve-query-source` the count-check still fires only when it's *called* — which now only happens when a source exists. Good. If a stricter "at most one on update" message is wanted, pre-check the source count in `update!` before calling.

- [ ] **Step 4: Run to verify they pass**

```clojure
(clojure.test/run-tests 'metabase.mcp.v2.tools.question-test)
```
Expected: all PASS.

- [ ] **Step 5: Lint + commit**

```bash
./bin/mage kondo src/metabase/mcp/v2/tools/question.clj test/metabase/mcp/v2/tools/question_test.clj
git add -u && git commit -m "Add question_write update path (GHY-4145)"
```

---

## Task 8: Wiring, module config, full-suite green

Finalize: registered-scope coverage, module config regen, full namespace test run, kondo clean.

**Files:**
- Modify: `.clj-kondo/config/modules/config.edn` (regenerated)
- Verify: `src/metabase/mcp/v2/api.clj`, whole tool + test ns

**Interfaces:** none new.

- [ ] **Step 1: Add a registered-scopes assertion**

Append to `question_test.clj`:

```clojure
(deftest question-write-scopes-registered-test
  (testing "both create and update scopes flow into the OAuth surface"
    (let [scopes (set (registry/registered-scopes))]
      (is (contains? scopes "agent:question:create"))
      (is (contains? scopes "agent:question:update")))))
```

- [ ] **Step 2: Run the full tool test namespace**

```clojure
(require 'metabase.mcp.v2.tools.question-test :reload)
(clojure.test/run-tests 'metabase.mcp.v2.tools.question-test)
```
Expected: 0 failures, 0 errors. Also re-run `metabase.mcp.v2.common-test` and `metabase.mcp.v2.registry-test` to confirm no regressions.

- [ ] **Step 3: Regenerate module config**

```bash
./bin/mage fix-modules-config
```
Expected: `unchanged`, or a small diff adding the tool ns's cross-module `:uses`. If it prints `WARNING:` lines needing a human decision (new module, reordering), stop and resolve by hand.

- [ ] **Step 4: Lint everything touched**

```bash
./bin/mage kondo \
  src/metabase/mcp/v2/common.clj \
  src/metabase/mcp/v2/tools/question.clj \
  src/metabase/mcp/v2/api.clj \
  test/metabase/mcp/v2/common_test.clj \
  test/metabase/mcp/v2/tools/question_test.clj
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Wire question_write registration and module config (GHY-4145)"
```

---

## Self-review notes

- **Spec coverage:** create/update (T4/T7), card_type question+model (T4/T5), query_handle+inline+native sources (T2), native template_tags (T3), name/description/collection/position/display/viz/cache_ttl (T4), archived (T7), column_metadata (T5), dashboard_id (T6), native-permitting handle resolver (T1), scope wiring (T4/T8), permission mirroring (T4/T7). All §9 items mapped.
- **Deferred verifications flagged inline** (must confirm real fn names during implementation): `queries/user-personal-collection-id`, `u/remove-nils`, `frontend-url`/`collection-path` source, `query-perms` alias, `lib/with-template-tags` map shape. These are named-but-verify, not placeholders — each has a concrete fallback.
- **Out of scope (unchanged from spec):** MCP skill doc, `metric_write`, extracting Bryan's shared pre-check helper.
