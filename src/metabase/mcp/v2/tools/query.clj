(ns metabase.mcp.v2.tools.query
  "The v2 MCP `execute_query` tool: one surface where v1 shipped three (`construct_query` +
   `query` + `execute_query`). A fresh portable MBQL 5 `query` runs the representations
   pipeline (validate → repair → resolve against database metadata, with teaching errors); a
   `query_handle` or `cursor` resolves through the handle store with the fresh-query guards
   re-run. Every call mints a handle — what the agent later saves or visualizes through it is
   byte-identical to what ran — and a truncated MBQL page mints a keyset `next_cursor` so the
   model continues with one opaque string, never a hand-written keyset filter."
  (:require
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.query :as v2.query]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.metabot.tools.construct :as metabot.construct]
   [metabase.query-processor.core :as qp]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private default-row-limit 100)

(def ^:private max-row-limit 2000)

;;; ------------------------------------------------ Query inputs --------------------------------------------------

(defn- query-input
  "Which of the three mutually exclusive query inputs was supplied. Runtime-enforced rather
   than schema `oneOf` — strict MCP clients bar `oneOf` in tool input schemas."
  [{:keys [query query_handle cursor]}]
  (let [provided (cond-> []
                   query        (conj :query)
                   query_handle (conj :query_handle)
                   cursor       (conj :cursor))]
    (when-not (= 1 (count provided))
      (common/throw-teaching-error
       (str "Pass exactly one of query | query_handle | cursor: `query` for a fresh portable "
            "MBQL query, `query_handle` to re-run a stored query, `cursor` to continue a "
            "truncated result.")))
    (first provided)))

(defn- resolve-input
  "Resolve the supplied input to `{:query <serialized MBQL map> :prompt <string-or-nil>}`.

   The fresh path rejects native stages up front, then runs the representations pipeline
   (validate → repair → resolve; permission-checked, teaching errors on unknown names) and
   serializes the resolved query. The handle and cursor paths resolve through the handle store,
   which re-runs the native/shape/permission guards — a stored handle never grants access the
   caller has since lost. A cursor is an ordinary handle whose stored query already embeds the
   next-page keyset boundary, so the two resolve identically."
  [input {:keys [query query_handle cursor prompt]} session-id]
  (case input
    :query
    (do
      (query-guards/reject-native-query! query)
      {:query  (-> (metabot.construct/execute-representations-query query)
                   (get-in [:structured-output :query])
                   lib/prepare-for-serialization)
       :prompt prompt})

    (:query_handle :cursor)
    (let [{stored :query stored-prompt :prompt}
          (common/resolve-query-handle! session-id api/*current-user-id* (or query_handle cursor))]
      ;; Prompts ride handle chains: a cursor page minted without an explicit `prompt` keeps
      ;; the original request for the visualization feedback flow.
      {:query stored :prompt (or prompt stored-prompt)})))

;;; ------------------------------------------------- Execution ----------------------------------------------------

(defn- execute!
  "Run a serialized MBQL query through the QP with the standard agent userland preparation,
   capping this call's rows at `row-limit` (within the backend's 2000/10000 userland
   ceilings). Returns the QP result; surfaces a failed run as a teaching error."
  [serialized-query row-limit]
  (let [result (qp/process-query
                (-> serialized-query
                    (update-in [:middleware :js-int-to-string?] (fnil identity true))
                    qp/userland-query-with-default-constraints
                    (assoc :constraints {:max-results           row-limit
                                         :max-results-bare-rows row-limit})
                    (update :info merge {:executed-by api/*current-user-id*
                                         :context     :agent})))]
    (when-not (= (:status result) :completed)
      (common/throw-teaching-error (str "Query failed: " (or (:error result) "unknown error"))))
    result))

(defn- last-stage
  [serialized-query]
  (peek (vec (:stages serialized-query))))

(defn- aggregated-last-stage?
  [serialized-query]
  (let [stage (last-stage serialized-query)]
    (boolean (or (seq (:aggregation stage))
                 (seq (:breakout stage))))))

(defn- page-cap
  "The number of rows this call could return at most — the binding cap between `row-limit` and
   the query's own last-stage limit."
  [serialized-query row-limit]
  (if-let [limit (:limit (last-stage serialized-query))]
    (min limit row-limit)
    row-limit))

(defn- remaining-rows
  "Rows still owed by the query's own last-stage limit once `returned` of them have been served,
   or nil when the query carries no limit of its own. That limit bounds the whole result set, so
   paging has to spend it down across pages rather than reapply it to each one."
  [serialized-query returned]
  (when-let [limit (:limit (last-stage serialized-query))]
    (- limit returned)))

(defn- cursor-query
  "The query the next-page cursor stores: the page's own query with the budget for everything
   after this page embedded as the last-stage limit — the query's own limit spent down by the
   rows already served, so a `limit 500` query pages to row 500 and stops, or the served page
   size when the query set no limit of its own, so continuing with `cursor` alone serves another
   page of the same size. An aggregated last stage is passed through unchanged — an embedded
   limit there would cut the base set before the keyset order can pin it down, and
   [[metabase.mcp.v2.query/next-page-cursor!]] would rightly refuse to mint."
  [serialized-query page-size remaining]
  (if (aggregated-last-stage? serialized-query)
    serialized-query
    (assoc-in serialized-query [:stages (dec (count (:stages serialized-query))) :limit]
              (or remaining page-size))))

;;; ------------------------------------------------- Response -----------------------------------------------------

(defn- response-cols
  [cols]
  (mapv (fn [{:keys [name base_type effective_type display_name]}]
          (cond-> {:name         name
                   :base_type    (u/qualified-name base_type)
                   :display_name display_name}
            effective_type (assoc :effective_type (u/qualified-name effective_type))))
        cols))

(defn- steering-line
  [returned next-cursor]
  (if next-cursor
    (format "returned %d rows, more available — continue with `cursor`, or narrow the query (filter/aggregate)"
            returned)
    (format "returned %d rows — narrow the query (filter/aggregate) or `export` for the full set"
            returned)))

(defn- mint-handle!
  [session-id serialized-query prompt]
  (common/mint-query-handle! session-id
                             api/*current-user-id*
                             (common/encode-serialized-query serialized-query)
                             prompt))

(defn- validate-only-response
  [session-id serialized-query prompt]
  (let [counts {:query_handle (mint-handle! session-id serialized-query prompt)
                :returned     0
                :truncated    false}]
    (common/success-content
     (str (json/encode counts)
          "\nQuery validated, not executed — execute or save it later by passing this query_handle."))))

(defn- execute-response
  [session-id serialized-query prompt row-limit]
  (let [result      (execute! serialized-query row-limit)
        cols        (get-in result [:data :cols])
        rows        (get-in result [:data :rows])
        returned    (count rows)
        cap         (page-cap serialized-query row-limit)
        remaining   (remaining-rows serialized-query returned)
        ;; a full page has more behind it only when `row-limit` is what capped it: a `limit 3`
        ;; query that returned 3 rows is complete, and paging it would serve rows it excluded.
        truncated?  (and (pos? returned)
                         (= returned cap)
                         (or (nil? remaining) (pos? remaining)))
        handle      (mint-handle! session-id serialized-query prompt)
        next-cursor (when truncated?
                      (v2.query/next-page-cursor! session-id
                                                  api/*current-user-id*
                                                  (cursor-query serialized-query cap remaining)
                                                  (last rows)
                                                  {:result-cols cols :prompt prompt}))
        counts      (cond-> {:query_handle handle
                             :returned     returned
                             :truncated    truncated?}
                      next-cursor (assoc :next_cursor next-cursor))
        payload     (assoc counts
                           :cols (response-cols cols)
                           :rows rows)]
    (common/success-content
     (cond-> (json/encode payload)
       truncated? (str "\n" (steering-line returned next-cursor))))))

;;; -------------------------------------------------- The tool ----------------------------------------------------

(def ^:private execute-query-args-schema
  [:map {:closed true}
   [:query {:optional true}
    [:maybe [:map {:description "A fresh query in the portable MBQL 5 dialect (see the tool description): named refs, not numeric ids, never base64. Exactly one of query | query_handle | cursor."}]]]
   [:query_handle {:optional true}
    [:maybe [:string {:min 1 :description "A query_handle from a previous call — re-validates and re-runs the exact stored query. Exactly one of query | query_handle | cursor."}]]]
   [:cursor {:optional true}
    [:maybe [:string {:min 1 :description "The next_cursor from a previous truncated response — fetches the next page. Pass it alone. Exactly one of query | query_handle | cursor."}]]]
   [:prompt {:optional true}
    [:maybe [:string {:min 1 :max 10000 :description "The user's original request, stored with the minted query_handle so visualize_query can surface it in the feedback flow."}]]]
   [:validate_only {:optional true}
    [:maybe [:boolean {:description "true validates against schema + database metadata and mints a query_handle without executing (default false)."}]]]
   [:row_limit {:optional true}
    [:maybe [:int {:min 1 :max max-row-limit :description "Maximum rows to return in this call (default 100, max 2000)."}]]]])

(registry/deftool execute-query
  "Validate and execute an MBQL query, returning rows plus a query_handle. Pass exactly one of: query (a fresh portable MBQL 5 query), query_handle (re-run a stored query), or cursor (continue a truncated result). Every call returns a query_handle — what you later save or visualize through it is exactly the query that ran. validate_only: true checks the query against schema + database metadata and mints a handle without executing. Results are cols + rows with returned/truncated counts; when a response carries next_cursor, fetch the next page by calling again with cursor alone, otherwise narrow the query (filter/aggregate) or export for the full set.

Query dialect (portable MBQL 5, JSON): discover exact database/schema/table/column NAMES first (search, browse_data) — never invent identifiers, never use numeric ids, never base64. Top level: {\"lib/type\": \"mbql/query\", \"stages\": [...]}. Each stage has \"lib/type\": \"mbql.stage/mbql\" plus either source-table: [\"<db>\", \"<schema-or-null>\", \"<table>\"] or source-card: \"<entity_id>\" on the FIRST stage only; later stages implicitly read the previous stage's output. Every clause is [\"op\", {}, ...args] with a MANDATORY options map at position 1. Field refs are [\"field\", {}, [\"<db>\", \"<schema-or-null>\", \"<table>\", \"<column>\"]] — a 4-segment portable name array — or a bare column-name string for a previous stage's output ([\"field\", {}, \"count\"]). Per-stage clause keys: filters, aggregation, breakout, expressions, fields, joins, order-by, limit. Minimal example (order count by month): {\"lib/type\": \"mbql/query\", \"stages\": [{\"lib/type\": \"mbql.stage/mbql\", \"source-table\": [\"Sample Database\", \"PUBLIC\", \"ORDERS\"], \"aggregation\": [[\"count\", {}]], \"breakout\": [[\"field\", {\"temporal-unit\": \"month\"}, [\"Sample Database\", \"PUBLIC\", \"ORDERS\", \"CREATED_AT\"]]]}]}. The full grammar (operators, joins, expressions, multi-stage queries) is available as an MCP resource. Native SQL is rejected at any depth — use execute_sql for raw SQL."
  {:name        "execute_query"
   :scope       metabot.scope/agent-query-execute
   :annotations {:readOnlyHint true}
   :args        execute-query-args-schema}
  [{:keys [validate_only row_limit] :as args} {:keys [session-id]}]
  (let [input (query-input args)
        {serialized-query :query prompt :prompt} (resolve-input input args session-id)]
    (if (true? validate_only)
      (validate-only-response session-id serialized-query prompt)
      (execute-response session-id serialized-query prompt (or row_limit default-row-limit)))))
