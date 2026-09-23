(ns metabase.metabot.tools.megabot
  "Tools for the experimental, deliberately unguarded `:megabot` profile.

  Seven tools, none carrying `:scope` metadata (so none is scope-filtered or scope-checked at call time):
  - `run_warehouse_query`— a structured query (MBQL 5, numeric ids) against a warehouse, returning
                           ACTUAL ROWS to the LLM. The profile's default way to query a warehouse.
  - `run_warehouse_sql`  — raw SQL against a connected warehouse, returning rows. The only tool here with
                           `:capabilities` (`:permission-write-sql-queries`): a user who may write SQL on
                           no database doesn't get it, so the model never plans around a tool it can't use.
  - `query_app_db`      — READ-ONLY SQL against Metabase's own application database.
  - `describe_app_db`    — the app db's live schema (tables, columns, FKs) plus the curated notes of
                           `metabase.metabot.megabot-context`.
  - `show_result`        — render a query the model already ran inline in the chat, as a table/chart.
  - `save_result`        — save a rendered result as a question in a collection, dashboard, or document,
                           through the same save path as the shared `save_entity` tool.
  - `show_page_link`     — a link card to a page (a `metabase://` link or an in-app path); it never navigates.

  Both warehouse tools run through the query processor under the already-bound
  `metabase.api.common/*current-user-id*`, so the QP's own data/native-permission and sandboxing
  middleware still apply — this profile runs queries as the current user, it does not bypass
  warehouse permissions. `query_app_db` reads the app DB via `metabase.metabot.db`, which runs the
  SQL in a rollback-only transaction; the tool also refuses any statement that is not
  SELECT / WITH / EXPLAIN / SHOW, so a write is both rejected up front and undone if it slips through.
  The row/output caps below are JVM/context safety valves, not access controls.

  `run_warehouse_query` sends the model's query through the validate → repair → resolve pipeline of
  `construct_notebook_query` (`metabase.metabot.tools.construct`), in the numeric-id dialect of the MCP v2
  surface. What runs, and what `show_result` renders, is therefore a query the query builder accepts, so
  the user gets the same drill-through and open-in-the-notebook as with any other Metabot chart. A
  rejected query comes back with the pipeline's error plus a recovery step in this profile's own
  vocabulary (instance snapshot, `query_app_db`), so the model can fix it instead of falling back to SQL.

  Every successful warehouse run registers its query in agent memory under a fresh query id (the raw
  native query for SQL, the resolved MBQL 5 query for a structured one) — the standard
  `:query-id`/`:query` structured-output contract `extract-queries` in the agent loop picks up — so the
  model can link it (`[text](metabase://query/<id>)`) or render it with `show_result`, which emits the
  `generated_entity` card data part the frontend runs and renders. The model only ever sees a row-capped
  preview; the rendered card re-runs the full query."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.lib.util :as lib.util]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.megabot-context :as megabot-context]
   [metabase.metabot.table-utils :as table-utils]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.api-call :as api-call]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.save-entity :as save-entity]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.models.serialization.resolve :as serdes.resolve]
   [metabase.query-processor.core :as qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private clause-list-json-schema
  "A list of clauses, each itself a `[\"<op>\", {opts}, ...args]` array."
  {:type "array" :items {:type "array" :items {}}})

(def ^:private structured-query-json-schema
  "What the LLM is shown for `run_warehouse_query`'s `query`. As with `construct_notebook_query`, this only
  replaces the schema handed to the LLM: an open, property-less `:map` reads as \"no fields\". Validation
  is the representations pipeline's job. The prose carries the clause shape JSON Schema can't express; the
  full dialect is the always-on megabot-query skill."
  {:type        "object"
   :description (str "An MBQL 5 query as a JSON object that names everything by numeric id (see \"Structured "
                     "warehouse queries\"). The first stage names the source: `source-table` (a table id) or "
                     "`source-card` (the id of a model, saved question, or metric); the database is inferred from it. "
                     "Every clause is `[\"<op>\", {<options>}, ...args]`, and a column is `[\"field\", {}, <field id>]` "
                     "(by name on a model or in a later stage). Orders per month: `{\"lib/type\": \"mbql/query\", "
                     "\"stages\": [{\"lib/type\": \"mbql.stage/mbql\", \"source-table\": 3, \"aggregation\": "
                     "[[\"count\", {}]], \"breakout\": [[\"field\", {\"temporal-unit\": \"month\"}, 14]]}]}`.")
   :required    ["lib/type" "stages"]
   :properties  {"lib/type" {:type "string" :const "mbql/query"}
                 "stages"   {:type        "array"
                             :minItems    1
                             :description "The query's stages. The first names the source; each later one reads the previous one's output."
                             :items       {:type       "object"
                                           :properties {"lib/type"     {:type "string" :const "mbql.stage/mbql"}
                                                        "source-table" {:type        "integer"
                                                                        :description "Numeric table id. First stage only."}
                                                        "source-card"  {:type        "integer"
                                                                        :description "Numeric id of a model, saved question, or metric. First stage only."}
                                                        "aggregation"  clause-list-json-schema
                                                        "breakout"     clause-list-json-schema
                                                        "filters"      clause-list-json-schema
                                                        "fields"       clause-list-json-schema
                                                        "order-by"     clause-list-json-schema
                                                        "joins"        {:type "array" :items {:type "object"}}
                                                        "expressions"  {:type "object"}
                                                        "limit"        {:type "integer"}}}}}})

(def ^:private default-row-limit 100)
(def ^:private max-row-limit 5000)
(def ^:private app-db-timeout-seconds 30)

(defn- clamp-limit [row-limit]
  (-> (or row-limit default-row-limit) (max 1) (min max-row-limit)))

(defn- limit-reached-note
  "Footer for a result cut at the row limit `n`. Says nothing about how many rows are *shown*: the
  warehouse table may also drop rows for size, and states that separately."
  [n]
  (str "Row limit reached (" n " rows) — more rows exist. Aggregate/filter in the query, or raise row_limit (max " max-row-limit ")."))

(def ^:private max-cell-chars
  "Per-cell character cap in the markdown table, so one huge value can't crowd out every other row."
  1000)

(defn- format-rows
  "Render `cols` (column-name strings) and `rows` (seq of value vectors) as a compact markdown table
  in the tool's `:output` string — the only channel the LLM sees. Returns `{:text … :rows-shown k}`.

  Only whole rows are emitted: rows are added while the table stays under `max-chars` (less headroom
  for the footer), so a size cut never leaves a half row. The footer always says whether the preview
  is complete — cut for size, cut by the row limit (`more?`: the query returned more rows than were
  kept), or both."
  [cols rows {:keys [more? max-chars] :or {max-chars te/default-max-output-chars}}]
  (let [header (str (str/join " | " cols) "\n" (str/join " | " (repeat (count cols) "---")))
        budget (- max-chars 400)
        lines  (loop [acc [] size (count header) remaining rows]
                 (if-let [[row & more] (seq remaining)]
                   (let [line  (str/join " | " (map #(te/ellipsize % max-cell-chars) row))
                         size' (+ size 1 (count line))]
                     (if (< size' budget)
                       (recur (conj acc line) size' more)
                       acc))
                   acc))
        m      (count rows)
        k      (count lines)
        cut?   (< k m)
        footer (if (or cut? more?)
                 (te/lines (when cut?
                             (str "(showing first " k " of " m " returned rows — output size cap; "
                                  "aggregate or select fewer columns)"))
                           (when more? (limit-reached-note m)))
                 (str "(" m " rows — complete result)"))]
    {:text       (str header (apply str (map #(str "\n" %) lines)) "\n\n" footer)
     :rows-shown k}))

(defn- error-output
  "A tool error `:output` that carries a short recovery hint, so the model can fix the next call rather
  than only seeing the failure. `msg` is the raw error line; `hint` is the concrete next step to try."
  [msg hint]
  {:output (te/lines msg "" (str "To recover: " hint))})

(def ^:private max-error-chars
  "Cap on a query error's length in a tool result. A warehouse error can quote the whole compiled SQL; its opening
  names the problem."
  1500)

(def ^:private max-detail-chars
  "Cap on the schema explanation appended to a structural rejection: the leading paths are the ones to fix first."
  500)

;;; SQL

(def ^:private sql-recovery-hint
  (str "Check the database_id against the databases listed under \"This instance\" in your system prompt, and "
       "confirm the table/column names there or with query_app_db on metabase_table / metabase_field (see "
       "\"Finding warehouse tables and columns\"), before retrying."))

(defn- sql-failure-hint
  "The next step after a SQL run fails with `result`."
  [_query {:keys [error_type]}]
  (if (= :missing-required-permissions error_type)
    (str "You can't run SQL on this database. Answer with run_warehouse_query instead: a structured query doesn't "
         "need SQL permission.")
    sql-recovery-hint))

;;; Structured queries

(defn- legacy-query-problem
  "`[message hint]` when `query` is legacy MBQL or a native query (a `type` / `query` / `native` wrapper and no
  `stages`), which `run_warehouse_query` doesn't take; nil otherwise. Without this the pipeline reports a missing
  `source-table`, which sends the model looking in the wrong place."
  [query]
  (when (and (map? query)
             (not (contains? query :stages))
             (some #(contains? query %) [:type :query :native]))
    (if (or (contains? query :native) (= "native" (some-> (:type query) name)))
      ["Query rejected: this is a native (SQL) query, and run_warehouse_query takes a structured MBQL 5 query."
       (str "Write it as a structured query (see \"Structured warehouse queries\"). SQL goes to run_warehouse_sql, "
            "only when a structured query can't express the question (see \"Querying the warehouse\").")]
      ["Query rejected: this is legacy MBQL (a `type` / `query` wrapper), and run_warehouse_query takes MBQL 5."
       (str "Rewrite it as `{\"lib/type\": \"mbql/query\", \"stages\": [{\"lib/type\": \"mbql.stage/mbql\", "
            "\"source-table\": <table id>, …}]}`: the inner `query` map becomes the first stage, `filter` becomes the "
            "`filters` list, `\"source-table\": \"card__<id>\"` becomes `\"source-card\": <id>`, there's no "
            "`database` key, and every clause gets an options map at position 1: `[\"count\", {}]`, "
            "`[\"field\", {}, <field id>]`.")])))

(defn- card-string-source->source-card
  "Rewrite a legacy `\"source-table\": \"card__<id>\"` on the first stage as `\"source-card\": <id>`. It's a
  common carry-over from legacy MBQL and unambiguous, so it's repaired rather than rejected."
  [query]
  (if-let [card-id (let [source (when (vector? (:stages query)) (get-in query [:stages 0 :source-table]))]
                     (when (string? source)
                       (lib.util/legacy-string-table-id->card-id source)))]
    (update-in query [:stages 0] #(-> % (dissoc :source-table) (assoc :source-card card-id)))
    query))

(defn- structured-query-hint
  "The next step for a query the representations pipeline rejected with `ex-data`, in this profile's vocabulary
  (instance snapshot, query_app_db) rather than the v1 surface's read_resource. Errors whose message already names
  the fix — an unknown stage key, a column name that doesn't exist (with the list of names that do) — get the
  generic step."
  [{:keys [error entity-type]} message]
  (case error
    (:unknown-table :unknown-table-id :ambiguous-table :unknown-database :missing-source-in-first-stage)
    (str "`source-table` takes a numeric table id listed under \"This instance\" (or found with query_app_db on "
         "metabase_table); `source-card` takes the numeric id of a model, saved question, or metric.")

    (:unknown-field :unknown-field-id)
    (str "Use the id of a column on the source table or on a table it links to by foreign key: on a small "
         "instance they're listed as `name #<field id>` under \"This instance\", otherwise find them with "
         "query_app_db on metabase_field (WHERE table_id = <table id>). On a model or in a later stage, reference "
         "the column by name instead.")

    :ambiguous-fk
    "Several foreign keys lead to that table: pick one by adding {\"source-field\": <FK field id on the source table>} to the column's options."

    :no-fk-path
    (str "No foreign key links the source to that column's table. Add an explicit `joins` entry with an `=` "
         "condition, and give every reference to a joined column {\"join-alias\": \"<alias>\"}.")

    (:unknown-card :unknown-card-id)
    "Use a model or metric id listed under \"Metrics and models\", or find a saved question's id with query_app_db on report_card."

    (:unknown-measure :unknown-measure-id :unknown-segment :unknown-segment-id)
    (str "Find measures and segments with query_app_db on the `measure` and `segment` tables (by table_id), and use "
         "one on a stage whose `source-table` is its table.")

    :uri-in-source-table
    (case entity-type
      "metric"                    (str "A metric is an aggregation, not a source: put [\"metric\", {}, <metric id>] in "
                                       "`aggregation`, on the source listed next to the metric under \"Metrics and models\".")
      ("question" "model" "card") "Put the bare numeric id in `source-card`, e.g. `\"source-card\": 7`."
      "Put the bare numeric table id in `source-table`, e.g. `\"source-table\": 3`.")

    :query-not-runnable
    (if (str/includes? (str message) ":conditions")
      ;; the pipeline can't resolve a column name inside a join condition (on a model or in a later stage)
      (str "Reference both sides of a join condition by field id; a column name isn't supported there. On a model, "
           "use the id of the field its column comes from.")
      (str "Common causes: ordering by an aggregation of the same stage by name instead of [\"aggregation\", {}, "
           "<index>], an operator that doesn't exist (the megabot-query-operators skill lists them), or an "
           "aggregation inside `expressions`."))

    :expression-editor-rejection
    (str "Check each argument's type (compare a date column with a date string and a number column with a number) "
         "and each operator's arguments (the megabot-query-operators skill lists them).")

    "Fix what the error names and run the query again."))

(defn- structured-failure-hint
  "The next step after a structured query that passed validation fails to run with `result`. The query processor
  reports these as bare strings, so the hint keys off the message and the query's source."
  [query {:keys [error]}]
  (cond
    ;; the QP's metric-expansion failures (`metabase.query-processor.middleware.metrics`)
    (re-find #"Incompatible metric|Failed to replace metric" (str error))
    (str "A metric only works on its own source: set `source-table` to the table listed next to it under \"Metrics "
         "and models\" (or `source-card` to its model), and filter or group by that source's columns.")

    (some? (get-in query [:stages 0 :source-card]))
    (str "On a model, saved question, or metric (`source-card`) only its own columns exist: reference them by name. "
         "For a column of a related table, add an explicit `joins` entry, with the card's foreign-key column in the "
         "condition as the id of the field it comes from.")

    :else
    (str "The query is well formed but failed to run. Check filter values against the columns' types and the join "
         "conditions, then run it again.")))

(defn- rejected-query-output
  "The tool result for a query the representations pipeline rejected: its message, the schema explanation of a
  structural failure (which the message alone doesn't carry), and the next step."
  [e]
  (let [{:keys [humanized] :as data} (ex-data e)]
    (error-output (str "Query rejected: " (te/ellipsize (ex-message e) max-error-chars)
                       (when humanized
                         (str " Details: " (te/ellipsize (pr-str humanized) max-detail-chars))))
                  (structured-query-hint data (ex-message e)))))

(defn- resolve-structured-query
  "Validate, repair, and resolve the model's `query` — MBQL 5 in the numeric-id dialect, keyword-keyed the way tool
  arguments arrive — into a runnable MBQL 5 query, through the representations pipeline `construct_notebook_query`
  uses. Numeric ids go through the same visibility and permission checks the MCP v2 surface gets. Throws the
  pipeline's `:agent-error?` exceptions when it rejects the query."
  [query]
  (binding [serdes.resolve/*numeric-ids-allowed?* true]
    (get-in (construct/execute-representations-query query) [:structured-output :query])))

(def ^:private app-db-recovery-hint
  (str "Check table and column names with describe_app_db (pass the table names) — only SELECT / WITH / "
       "EXPLAIN / SHOW are allowed. Note that metabase_field describes WAREHOUSE columns, not app-db ones."))

(defn- register-query!
  "Store `query` in agent memory under `query-id` right away, when a memory atom is bound. The agent
  loop also records it from `:structured-output` after the iteration; writing it now closes the gap
  for a `show_result` issued as a parallel tool call in the same LLM turn."
  [query-id query]
  (when shared/*memory-atom*
    (swap! shared/*memory-atom* memory/set-query query-id query)))

(defn- run-warehouse-query*
  "Run `query` (a native query map, or a resolved MBQL 5 query) through the QP as the current user, capping rows,
  register it under a fresh query id, and format the result rows into `:output`. On failure, `failure-hint` (a fn
  of the query and the failed result) gives the recovery step.

  Fetches one row past the limit so \"more rows exist\" is known rather than guessed from
  `count == limit`; the extra row is dropped before formatting. The query registered in memory (and
  re-run by `show_result`) is the original, unconstrained one."
  [query row-limit failure-hint]
  (let [n      (clamp-limit row-limit)
        result (qp/process-query
                (-> query
                    qp/userland-query-with-default-constraints
                    (assoc :constraints {:max-results           (inc n)
                                         :max-results-bare-rows (inc n)}
                           :info        {:executed-by api/*current-user-id*
                                         :context     :agent})))]
    (if (= (:status result) :completed)
      (let [cols     (mapv :name (get-in result [:data :cols]))
            rows     (get-in result [:data :rows])
            more?    (> (count rows) n)
            rows     (cond->> rows more? (take n))
            query-id (u/generate-nano-id)
            {:keys [text rows-shown]} (format-rows cols rows {:more? more?})]
        (register-query! query-id query)
        {:output            (te/truncate-output
                             (te/lines
                              ;; everything before the first blank line is the output's lead, which is kept when old
                              ;; history is compacted (`metabase.metabot.agent.core/output-lead`), so an old run can
                              ;; still be rendered or linked without running it again
                              (str "Query ID: " query-id)
                              (str "Link it as " (te/link "text" "metabase://query/" query-id)
                                   ", or render the full result for the user with show_result.")
                              ""
                              text))
         :structured-output {:query-id   query-id
                             :query      query
                             :database   (:database query)
                             :cols       cols
                             :row-count  (count rows)
                             :rows-shown rows-shown
                             :truncated? (or more? (< rows-shown (count rows)))
                             :more-rows? more?}})
      (error-output (str "Query failed: " (te/ellipsize (or (:error result) "unknown error") max-error-chars))
                    (failure-hint query result)))))

;; `:capabilities` hides this tool from a user who may write SQL on no database (the capability is dropped
;; server-side for them, see `metabase.metabot.capabilities/enforce-permissions`), so the model plans with
;; run_warehouse_query from the start. Per-database SQL permission is in the instance snapshot.
(mu/defn ^{:tool-name    "run_warehouse_sql"
           :capabilities #{:permission-write-sql-queries}}
  run-warehouse-sql-tool
  "Run a raw SQL query against a connected warehouse database and READ THE ACTUAL ROWS it returns. Use it only for
  what a structured query can't express: see \"Querying the warehouse\" in your instructions. `database_id` is the
  numeric Metabase database id listed under \"This instance\"; `sql` runs verbatim against that database. Optional
  `row_limit` caps rows returned (default 100, max 5000). A \"limit reached\" footer means the preview is partial —
  never treat it as a total or a complete top-N. The result comes back with a Query ID you can pass to show_result
  to render the full result for the user."
  [{:keys [database_id sql row_limit]}
   :- [:map {:closed true}
       [:database_id :int]
       [:sql :string]
       [:row_limit {:optional true} :int]]]
  (try
    (run-warehouse-query* {:database database_id :type :native :native {:query sql}} row_limit sql-failure-hint)
    (catch Exception e
      (error-output (str "Query error: " (te/ellipsize (ex-message e) max-error-chars)) sql-recovery-hint))))

(mu/defn ^{:tool-name "run_warehouse_query"}
  run-warehouse-query-tool
  "Run a structured query against a connected warehouse and READ THE ACTUAL ROWS it returns. This is your default
  way to query a warehouse. Unlike other Metabase assistants, you CAN see these results — read them and answer the
  user directly, quoting real values. `query` is an MBQL 5 query that names tables, columns, models, and metrics by
  numeric id: \"Structured warehouse queries\" in your instructions shows how to write one. Optional `row_limit`
  caps the rows you read (default 100, max 5000) without changing the query; a top-N is a stage `limit`. A
  \"limit reached\" footer means the preview is partial — never treat it as a total or a complete top-N. A rejected
  query comes back with what's wrong and how to fix it. The result comes back with a Query ID you can pass to
  show_result, which renders it as a regular question the user can drill into and open in the query builder."
  [{:keys [query row_limit]}
   :- [:map {:closed true}
       [:query (mu/with construct/LLMExternalQuery {:json-schema structured-query-json-schema})]
       [:row_limit {:optional true} :int]]]
  (try
    (if-let [[message hint] (legacy-query-problem query)]
      (error-output message hint)
      (-> (resolve-structured-query (card-string-source->source-card query))
          (run-warehouse-query* row_limit structured-failure-hint)))
    (catch Exception e
      (if (or (:agent-error? (ex-data e))
              ;; `api/read-check` throws a bare 403: the user can't have what they named, nothing broke
              (= 403 (:status-code (ex-data e))))
        (do (log/debugf "run_warehouse_query rejected the query: %s" (ex-message e))
            (rejected-query-output e))
        (error-output (str "Query error: " (te/ellipsize (ex-message e) max-error-chars))
                      (structured-failure-hint query {:error (ex-message e)}))))))

(def ^:private read-only-leading-keywords
  "The only statement kinds `query_app_db` will run — a fast, friendly rejection of obvious writes.
  It is not the last line of defense: `metabase.metabot.db/run-read-only-app-db-sql` runs everything
  in a rollback-only transaction, which catches writes this prefix check can't (a data-modifying CTE
  starting `with`, `explain analyze <dml>`)."
  #{"select" "with" "explain" "show"})

(defn- read-only-sql? [sql]
  (let [first-word (-> sql str/trim (str/split #"\s+" 2) first (or "") u/lower-case-en)]
    (contains? read-only-leading-keywords first-word)))

(defn- encode-rows
  "`rows` as a JSON array, capped by [[te/truncate-output]]. Rows are encoded one at a time and only until the cap is
  passed, so a wide `SELECT *` isn't encoded in full only to be cut."
  [rows]
  (let [{encoded :rows} (reduce (fn [{:keys [size] :as acc} row]
                                  (if (> size te/default-max-output-chars)
                                    (reduced acc)
                                    (let [s (json/encode row)]
                                      (-> acc (update :rows conj s) (assoc :size (+ size 1 (count s)))))))
                                {:rows [] :size 1}
                                rows)]
    (te/truncate-output (str "[" (str/join "," encoded) "]"))))

(mu/defn ^{:tool-name "query_app_db"}
  query-app-db-tool
  "Run a READ-ONLY SQL query against Metabase's own APPLICATION database — its internal metadata
  store (databases, tables, fields, users, cards, collections, settings), NOT a data warehouse. Use
  it to discover the ids and schema you need before querying a warehouse, e.g.
  `SELECT id, name, engine FROM metabase_database`. Only SELECT / WITH / EXPLAIN / SHOW are allowed;
  writes are refused. Optional `row_limit` (default 100, max 5000)."
  [{:keys [sql row_limit]}
   :- [:map {:closed true}
       [:sql :string]
       [:row_limit {:optional true} :int]]]
  (if-not (read-only-sql? sql)
    {:output "Refused: query_app_db is read-only. Only SELECT / WITH / EXPLAIN / SHOW are allowed."}
    (try
      ;; fetch one row past the limit so "more rows exist" is known, not guessed
      (let [n       (clamp-limit row_limit)
            rows    (metabot.db/run-read-only-app-db-sql sql (inc n) app-db-timeout-seconds)
            more?   (> (count rows) n)
            limited (vec (take n rows))]
        {:output            (te/lines (encode-rows limited)
                                      (when more? (limit-reached-note n)))
         :structured-output {:row-count  (count limited)
                             :truncated? more?}})
      (catch Exception e
        (if (mdb/query-canceled-exception? (mdb/db-type) e)
          (error-output (str "AppDB query timed out after " app-db-timeout-seconds "s.")
                        "Narrow it with a WHERE clause or LIMIT, or aggregate (COUNT / GROUP BY) instead of listing rows.")
          (error-output (str "AppDB error: " (ex-message e)) app-db-recovery-hint))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Describe app db
;;; ──────────────────────────────────────────────────────────────────

(defn- table-listing-line
  [table-name {:keys [view?]}]
  (str "- " table-name
       (when view? " (view)")
       (if-let [unmaintained (megabot-context/unmaintained-note table-name)]
         (str " — UNMAINTAINED: " unmaintained)
         (when-let [purpose (:purpose (megabot-context/curated-table table-name))]
           (str " — " purpose)))))

(defn- column-line
  [{column-name :name :keys [type nullable?]} fks notes]
  (str "- " column-name " " type
       (when-not nullable? " NOT NULL")
       (when-let [fk (get fks column-name)] (str " → " fk))
       (when-let [note (get notes column-name)] (str " — " note))))

(defn- similar-table-names
  [schema table-name]
  (->> (keys schema)
       (filter #(or (str/includes? % table-name)
                    (str/includes? table-name %)
                    (table-utils/similar? % table-name)))
       (take 8)))

(defn- describe-table
  [schema table-name]
  (if-let [{:keys [columns fks view?]} (get schema table-name)]
    (let [{:keys [purpose] curated-columns :columns} (megabot-context/curated-table table-name)
          notes (into {} (keep (fn [[column note]] (when note [column note]))) curated-columns)]
      (te/lines
       (str "## " table-name (when view? " (view)") (when purpose (str " — " purpose)))
       (when-let [unmaintained (megabot-context/unmaintained-note table-name)]
         (str "UNMAINTAINED: " unmaintained "."))
       (for [column columns]
         (column-line column fks notes))))
    (let [suggestions (similar-table-names schema table-name)]
      (str "## " table-name "\nNo app-db table or view has this name."
           (when (seq suggestions)
             (str " Did you mean: " (str/join ", " suggestions) "?"))))))

(mu/defn ^{:tool-name "describe_app_db"}
  describe-app-db-tool
  "Describe Metabase's own APPLICATION database schema (the one `query_app_db` reads), straight from its live
  metadata. With no `tables`, lists every app-db table and view, with a one-line purpose for the core ones.
  With `tables` (a list of table names, e.g. [\"report_card\", \"collection\"]), returns each table's full
  columns with types, NOT NULL flags, foreign keys, and curated notes. Use it for any table or column that
  isn't already described in your system prompt."
  [{:keys [tables]}
   :- [:map {:closed true}
       [:tables {:optional true} [:maybe [:sequential :string]]]]]
  (try
    (let [schema (metabot.db/app-db-schema)]
      (if (seq tables)
        (let [table-names (map (comp u/lower-case-en str/trim) tables)]
          {:output            (te/truncate-output
                               (str/join "\n\n" (map #(describe-table schema %) table-names)))
           :structured-output {:tables (vec (filter #(contains? schema %) table-names))}})
        {:output            (te/truncate-output
                             (te/lines (str "App-db tables and views (" (count schema) "). "
                                            "Pass `tables` to see a table's columns.")
                                       (for [[table-name table] schema]
                                         (table-listing-line table-name table))))
         :structured-output {:table-count (count schema)}}))
    (catch Exception e
      (error-output (str "Could not read the app-db schema: " (ex-message e))
                    "Fall back to query_app_db on the dialect's information_schema."))))

;;; ──────────────────────────────────────────────────────────────────
;;; Show result
;;; ──────────────────────────────────────────────────────────────────

(def ^:private display-enum
  (into [:enum] shared/chart-types))

(defn- show-result-output
  [chart-id display]
  (te/lines
   "<result>"
   (str "Rendered the full result for the user as a " display " visualization.")
   "</result>"
   "<instructions>"
   (instructions/chart-created-instructions chart-id)
   "The user can now see the full result. Do not repeat the table in text; state the takeaway."
   "</instructions>"))

(mu/defn ^{:tool-name "show_result"}
  show-result-tool
  "Render a query you already ran inline in the chat, as a table (default) or a chart, so the user
  sees the full result rather than only your summary. `query_id` is the Query ID returned by
  run_warehouse_query / run_warehouse_sql. `display` is a Metabase visualization type (table, bar,
  line, area, pie, row, scatter, scalar, ...); pick a chart when the shape of the data calls for one,
  e.g. `line` for a time series, `bar` for a breakdown. `title` is a short human-friendly heading
  shown above the result; `description` is an optional one-sentence explanation of what it shows."
  [{:keys [query_id display title description]}
   :- [:map {:closed true}
       [:query_id :string]
       [:display {:optional true} display-enum]
       [:title :string]
       [:description {:optional true} :string]]]
  (try
    (let [chart-type (keyword (or display "table"))
          {:keys [chart-id query]} (create-chart-tools/create-chart
                                    {:query-id      query_id
                                     :chart-type    chart-type
                                     :queries-state (shared/current-queries-state)})
          ;; the closed `::metabot.schema/chart` shape `extract-charts` also writes, so chart links
          ;; resolve within this turn as well as from the persisted state on later turns
          ;; `:chart_config` keeps the title/description, so save_result can default to them
          chart      {:chart_id               chart-id
                      :query_id               query_id
                      :queries                [query]
                      :visualization_settings {:chart_type chart-type}
                      :chart_config           (cond-> {:title title}
                                                description (assoc :description description))}]
      (when shared/*memory-atom*
        (swap! shared/*memory-atom* memory/set-chart chart-id chart))
      {:output            (show-result-output chart-id (name chart-type))
       :structured-output {:result-type :chart
                           :chart-id    chart-id
                           :query-id    query_id
                           :query       query
                           :chart-type  chart-type}
       :data-parts        [(streaming/viz-part {:entity-id   chart-id
                                                :query-id    query_id
                                                :query       (links/->legacy-mbql query)
                                                :display     chart-type
                                                :title       title
                                                :description description})]})
    (catch Exception e
      (if (:agent-error? (ex-data e))
        (metabot.tools.u/handle-agent-error e)
        {:output (str "Failed to show result: " (ex-message e))}))))

;;; ──────────────────────────────────────────────────────────────────
;;; Save result
;;; ──────────────────────────────────────────────────────────────────

(defn- destination-label
  "The destination of a save, for the step label: a link to the collection, dashboard, or document. The root
  collection has no numeric id to link, so it is named as plain text."
  [{:keys [type id]} destination-name]
  (if (nil? id)
    destination-name
    (te/link destination-name "metabase://" type "/" id)))

(defn- save-result-output
  "The model-facing summary of a save, in call_api's change-line format: the question it created and, for a dashboard
  or document, the container it added it to."
  [card {:keys [type id]} destination-name]
  (te/lines
   (api-call/entity-change-line {:verb :created :link-type "question" :id (:id card) :name (:name card)})
   (when (#{"dashboard" "document"} type)
     (api-call/entity-change-line {:verb :updated :link-type type :id id :name destination-name}))))

(mu/defn ^{:tool-name "save_result"}
  save-result-tool
  "Save a result you rendered with show_result as a question, by the chart id from its `metabase://chart/<id>`
  link. This is the only way to save a rendered result: don't rebuild one with call_api.

  Save when the user asks to save or keep a result, or when a task they asked for needs saved questions: building a
  dashboard, or adding charts to a document. Don't save a result just because you rendered it.

  `name` and `description` default to the title and description you gave show_result; pass them only to change them.

  `destination` (omit it to save to the user's personal collection):
  - a collection: {\"target_type\": \"collection\", \"collection_id\": <id>}; `null` is the root collection.
  - a dashboard: {\"target_type\": \"dashboard\", \"dashboard_id\": <id>}; the question is placed on the dashboard.
  - a document: {\"target_type\": \"document\", \"document_id\": <id>, \"position\": <n>}; `position` is the 0-based
    index among the document's top-level blocks (omit it to append at the end). Read the blocks with call_api
    `GET /api/document/<id>`.
  Find ids with query_app_db or a call_api GET. If several places match what the user named, ask with ask_user. The
  save fails if the user can't write there.

  To build a new dashboard or document, create it first with call_api (`POST /api/dashboard` or
  `POST /api/document`, with a `name` and `collection_id`), then save each rendered result into it.

  The result gives the link of everything created or changed; share them in your reply."
  [{:keys [chart_id destination description] question-name :name}
   :- [:map {:closed true}
       [:chart_id save-entity/chart-id-schema]
       [:name {:optional true} [:maybe :string]]
       [:description {:optional true} [:maybe :string]]
       [:destination {:optional true} [:maybe save-entity/destination-schema]]]]
  (try
    (let [chart         (or (save-entity/resolve-chart chart_id)
                            (throw (ex-info (str "No rendered result has chart id `" chart_id "`. Render the query "
                                                 "with show_result first, then save the chart id it returns.")
                                            {:agent-error? true :status-code 400})))
          question-name (or (not-empty (some-> question-name str/trim))
                            (:title chart)
                            (throw (ex-info "Pass a `name`: this result has no title."
                                            {:agent-error? true :status-code 400})))
          {:keys [card destination-name] saved-destination :destination}
          (save-entity/save-chart! chart_id
                                   {:name          question-name
                                    :description   (or (not-empty description) (:description chart))
                                    :dataset_query (:dataset_query chart)
                                    :display       (:display chart)
                                    :destination   (or destination {:target_type "collection"})})]
      {:output            (save-result-output card saved-destination destination-name)
       :structured-output {:result-type   :saved-entity
                           :card-id       (:id card)
                           :collection-id (:collection_id card)
                           :destination   saved-destination}
       :data-parts        [(streaming/entity-saved-part
                            {:chart_id    chart_id
                             :card_id     (:id card)
                             :destination saved-destination
                             ;; the settled step label: what happened and where, each link to what it names
                             :title       (tru "Saved {0} to {1}"
                                               (te/link (:name card) "metabase://question/" (:id card))
                                               (destination-label saved-destination destination-name))})]})
    (catch Exception e
      (log/errorf "Error saving result: %s" (ex-message e))
      {:output     (if (:agent-error? (ex-data e))
                     (ex-message e)
                     (str "Failed to save: " (or (ex-message e) "Unknown error")))
       :data-parts [(streaming/tool-title-part (tru "Couldn''t save the result"))]})))

;;; ──────────────────────────────────────────────────────────────────
;;; Show page link
;;; ──────────────────────────────────────────────────────────────────

(def ^:private named-entity-models
  "`metabase://` link types naming a saved item, with the model its name is read from."
  {"question"   :model/Card
   "model"      :model/Card
   "metric"     :model/Card
   "dashboard"  :model/Dashboard
   "collection" :model/Collection
   "document"   :model/Document})

(defn- page-target
  "Resolve `target` to `{:url :link-type :id}`, or nil. `target` is a `metabase://` link, resolved by the same
  `links/resolve-metabase-uri` that resolves the links in the model's text, or an in-app path starting with a single
  `/`, passed through as-is (and with no `:link-type`)."
  [target]
  (let [target (str/trim target)]
    (cond
      (str/starts-with? target "metabase://")
      (when-let [url (links/resolve-metabase-uri target (shared/current-queries-state) (shared/current-charts-state))]
        (let [[link-type id] (str/split (subs target (count "metabase://")) #"/" 2)]
          {:url url :link-type link-type :id id}))

      (and (str/starts-with? target "/") (not (str/starts-with? target "//")))
      {:url target})))

(defn- saved-name
  "The saved name of the item a `metabase://<link-type>/<id>` link names, or nil when it isn't a saved item."
  [link-type id]
  (when-let [model (named-entity-models link-type)]
    (when-let [id (some-> id parse-long)]
      (when (pos? id)
        (:name (metabot.db/entity-summary model id))))))

(defn- page-model
  "The kind of item a page shows, which picks its link card's icon: the link type, except that a query or chart from
  this conversation opens as a question. nil for an in-app path."
  [link-type]
  (case link-type
    ("query" "chart") "question"
    link-type))

(mu/defn ^{:tool-name "show_page_link"}
  show-page-link-tool
  "Show the user a link card to a page in Metabase. Use it when the user asks to go to, open, or be taken to something
  (\"open the Sales dashboard\", \"take me to the orders table\", \"where do I set up email?\"), not to show them data
  you can answer or render with show_result. It doesn't move them: the card appears in the chat, and they open the page
  when they choose.

  `target` is either:
  - a `metabase://` link: `metabase://dashboard/<id>`, `question/<id>`, `model/<id>`, `metric/<id>`,
    `collection/<id>`, `document/<id>`, `transform/<id>`, `table/<id>` (opens the table's rows), or
    `query/<query id>` / `chart/<chart id>` for a query you ran or a result you rendered (opens it in the query
    builder, where the user can edit it).
  - an in-app path starting with `/`, e.g. `/admin/settings/email`, `/admin/people`, `/browse/databases`,
    `/collection/root`, `/auto/dashboard/table/<id>` (an X-ray of a table).
  Find ids with query_app_db or a call_api GET first.

  `title` is the page's name as the user would say it, e.g. \"Sales\" or \"Email settings\". A saved question,
  model, metric, dashboard, collection, or document is labeled with its own name instead."
  [{:keys [target title]} :- [:map {:closed true}
                              [:target :string]
                              [:title :string]]]
  (if-let [{:keys [url link-type id]} (page-target target)]
    (if-let [title (or (not-empty (saved-name link-type id))
                       (not-empty (str/trim title)))]
      {:output            (te/lines
                           "<result>"
                           (str "Showed the user a link to \"" title "\" (" url "). They are still in this chat, and "
                                "open the page when they choose.")
                           "</result>"
                           "<instructions>"
                           (str "Don't say you took them there, and don't describe the page. Point them to the link in "
                                "one short sentence, or go on with the rest of their request.")
                           "</instructions>")
       :structured-output {:result-type :page-link :url url}
       :data-parts        [(streaming/page-link-part {:url url :title title :model (page-model link-type)})]}
      (error-output "Pass a `title`." "Name the page as the user would say it, e.g. \"Email settings\"."))
    (error-output (str "Can't link to `" target "`.")
                  (str "Pass a metabase://<type>/<id> link with an existing id (a query or chart id must come from "
                       "this conversation), or an in-app path starting with a single `/`."))))
