(ns metabase.agent-api.execute-query
  "The v2 `execute_query` tool: one decision point — *I have a query, run it*.

   `query` (portable MBQL 5 JSON) or `query_handle` names the query, `validate_only` is the dry run,
   and a handle comes back either way, so a save or a chart reuses the validated query without the
   model re-carrying it. Building a query, running one, and paging through one are all this tool: a
   catalog that splits them makes a model holding a query choose between overlapping doors, and that
   choice is the one it gets wrong.

   The query travels in the agent API's **external dialect**: staged like the product's own query
   format, but self-describing. Field refs are portable name arrays
   (`[\"field\" {} [\"Sample Database\" \"PUBLIC\" \"ORDERS\" \"TOTAL\"]]`), sources are table-name paths
   or card entity_ids, never bare integer ids — so a query the agent reads back from `get_content`
   round-trips into a run without a translation table, and a name that resolves to nothing is an error
   rather than a query silently run against the wrong column. The resolution pipeline behind that is
   Metabot's own ([[metabase.metabot.tools.construct/execute-representations-query]]): validate →
   repair → resolve → gate on the query builder's `canRun`.

   Continuation is `query_handle` + `offset`: the query lives in the store, so nothing but the offset
   travels through the model's context to read the next page.

   Rows come back in the dataset REST shape (`cols` + `rows` as value arrays), and they travel exactly
   once — in the text block. `structuredContent` carries only what a next call consumes: the handle,
   the count, and whether more rows are behind this page."
  (:require
   [metabase.agent-api.handles :as handles]
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.construct :as metabot-construct]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def default-row-limit
  "Rows one call returns when it names no `row_limit`. Small on purpose: an agent that wants an answer
   asks for an aggregation, and an agent that wants rows pages for them."
  100)

(def max-row-limit
  "The most rows one call returns. The backend's userland constraints (2000 unaggregated, 10000
   aggregated) are the ceiling above this one; a response an agent cannot hold is the ceiling below."
  2000)

;;; ──────────────────────────────────────────────────────────────────
;;; Native queries belong to `execute_sql`
;;; ──────────────────────────────────────────────────────────────────

(defn- native-marker?
  "True if `node` is a map carrying a native-SQL marker: a `:native` query body (the universal signal
   across legacy and MBQL 5 native forms), a legacy `:type :native`, or an MBQL 5 `:mbql.stage/native`
   `:lib/type`. Membership tests cover the keyword and json-decoded string forms and never coerce, so
   junk values don't throw. A legitimate serialized MBQL query carries none of these."
  [node]
  (and (map? node)
       (or (contains? node :native)
           (contains? #{:native "native"} (:type node))
           (contains? #{:mbql.stage/native "mbql.stage/native"} (:lib/type node)))))

(defn native-query?
  "True if `query-map` (a decoded, client-reachable query) carries native SQL anywhere in its tree —
   legacy top-level `:type :native`, a legacy nested `:source-query`'s `:native`, or an MBQL 5
   `:mbql.stage/native` stage, including inside joins. A whole-tree scan, because these endpoints are
   MBQL-only by scope: a native marker at any depth means the payload smuggles raw SQL, however it is
   nested."
  [query-map]
  (boolean (some native-marker? (tree-seq coll? seq query-map))))

(defn- check-mbql!
  "Refuse a native query. `execute_query` carries the MBQL scope, not the SQL one, so a handle or a
   payload that smuggles SQL past it would run raw SQL without the native-query scope and behind the
   `execute_sql` kill switch."
  [query-map]
  (when (native-query? query-map)
    (tools/teaching-error
     (tru "This is a native SQL query. Run it with `execute_sql`, which is scoped for raw SQL."))))

;;; ──────────────────────────────────────────────────────────────────
;;; The query a call names
;;; ──────────────────────────────────────────────────────────────────

(defn- resolve-query
  "The serialized MBQL query a call names, from a handle or from the portable payload.

   The payload path runs the resolution pipeline, which is where the teaching happens: an unknown table
   or column comes back naming the recovery (it names no candidates on purpose — its metadata provider
   is un-sandboxed, so a candidate list would tell a sandboxed caller which tables exist). The handle
   path skips the pipeline: that query resolved once already, when the handle was minted."
  [{:keys [query query_handle]}]
  (if query_handle
    ;; Normalized on the way out of the store: a handle's row is JSON, so its markers come back as strings
    ;; (`"mbql/query"`), and MBQL is keywords.
    (or (some-> (handles/read-query api/*current-user-id* query_handle) lib/normalize)
        (tools/teaching-error
         (tru (str "No query handle {0}. A handle expires, and it belongs to the user who minted it — "
                   "send the query itself in `query`.")
              (pr-str query_handle))
         404))
    (do
      ;; Ahead of the pipeline, which would reject raw SQL as a malformed *MBQL* query and send the model
      ;; off to fix a query that was never MBQL in the first place.
      (check-mbql! query)
      (-> (metabot-construct/execute-representations-query query)
          (get-in [:structured-output :query])
          lib/prepare-for-serialization))))

(defn- check-source-permissions!
  "Re-check query permission on the table a handle's first stage reads.

   The handle's query passed the resolution pipeline's permission check when it was minted, and every
   table it touches is checked again by the query processor when it runs. This covers the gap between
   those two: a handle outlives a grant, and `validate_only` never reaches the query processor. It is
   the first-stage source table only — the same check the v1 continuation token ran — and that is
   enough for what `validate_only` discloses, which is whether the handle still names a valid query."
  [query-map]
  (when-let [table-id (get-in query-map [:stages 0 :source-table])]
    (when (int? table-id)
      (api/query-check :model/Table table-id))))

(defn- check-shape!
  "Sanity-check the resolved query, whichever path produced it.

   A handle is client-reachable and its row may have been minted by an older build, so a shape the paging
   arithmetic cannot read has to surface as a refusal the model can act on rather than as a 500. The
   `limit` rule is checked here rather than at execution so that `validate_only` cannot bless a query that
   a later `execute_query` on the same handle would refuse. Deep MBQL validation happens in the query
   processor at execution, as it does for every app query."
  [query-map]
  (let [stages (:stages query-map)]
    (when-not (and (sequential? stages) (seq stages) (every? map? stages))
      (tools/teaching-error
       (tru "This does not name a runnable query: it has no stages.")))
    (let [limit (:limit (last stages))]
      (when (and (some? limit) (not (and (int? limit) (pos? limit))))
        (tools/teaching-error
         (tru "A query''s `limit` must be a positive integer; {0} is not. Omit it to read every row."
              (pr-str limit)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Paging
;;; ──────────────────────────────────────────────────────────────────
;;
;; MBQL pages by `:page {:page n :items m}` — rows (n-1)*m+1 through n*m — so an offset it can express
;; is a multiple of the page size. Rather than silently rounding a stray offset (which would return
;; rows the caller did not ask for and look like an answer), the tool says so; every offset a
;; truncation message names conforms by construction.

(defn- own-limit
  "The `limit:` the caller wrote on the query's last stage, if any. It caps the whole result set —
   `row_limit` pages within it, and never past it."
  [query-map]
  (:limit (last (:stages query-map))))

(defn- page-size
  "How many rows a page actually carries: `row-limit`, unless the query processor would return fewer.

   The instance caps every query's rows (2000 unaggregated, 10000 aggregated by default, and an admin can
   lower either, per database), and it enforces that cap by *trimming the result* — the SQL window stays
   as wide as the `:page` asked for. So a page sized above the cap would fetch rows the response then
   dropped: the next offset would step over them, and the last page would come back short and read as the
   end of the data. Sizing the page to what will survive keeps every row reachable."
  [query-map row-limit]
  (or (some-> (qp.constraints/add-constraints query-map)
              lib/max-rows-limit
              (min row-limit))
      row-limit))

(defn- check-offset! [offset row-limit query-map]
  (when-not (zero? (mod offset row-limit))
    (tools/teaching-error
     (tru (str "offset must be a multiple of the page size ({0}); {1} is not. Continue with the offset the "
               "previous response named.")
          row-limit offset)))
  (when-let [limit (own-limit query-map)]
    (when (<= limit offset)
      (tools/teaching-error
       (tru "This query''s own limit of {0} rows ends before offset {1}. Raise the query''s limit to read further."
            limit offset)))))

(defn- paginated
  "`query-map` windowed to the page `offset` and `row-limit` name. `:page` and `:limit` cannot coexist on
   a stage, so the caller's `limit:` comes off here and is re-applied to the rows — it caps the set, and
   the page reads within it."
  [query-map offset row-limit]
  (let [last-stage (dec (count (:stages query-map)))]
    (-> query-map
        (update-in [:stages last-stage] dissoc :limit)
        (assoc-in [:stages last-stage :page] {:page  (inc (quot offset row-limit))
                                              :items row-limit}))))

;;; ──────────────────────────────────────────────────────────────────
;;; Execution
;;; ──────────────────────────────────────────────────────────────────

(defn- prepare
  "Apply the standard agent-API query preparation: the userland row constraints every app query runs
   under, and the execution info that lands on the `query_execution` audit row."
  [query-map]
  (-> query-map
      (update-in [:middleware :js-int-to-string?] (fnil identity true))
      qp/userland-query-with-default-constraints
      (update :info merge {:executed-by api/*current-user-id*
                           :context     :agent})))

(defn- fail!
  "Refuse with the query processor's own message. A failure here is the model's to fix — a bad cast, a
   timeout, a column the driver rejects — so it reads the database's diagnosis rather than a 500. A
   permission failure keeps its 403, which is what the parity matrix compares against REST."
  [message error-type status]
  (tools/teaching-error (tru "The query failed: {0}" message)
                        (if (qp.error-type/permission-error? error-type) 403 status)))

(defn- run-query!
  "Run `query-map` and return the query processor's result.

   A userland query does not throw on failure: the query processor hands back a result whose `:status`
   is `:failed` and whose `:error` carries the reason. Left unread, that result is indistinguishable
   here from a query that legitimately matched no rows — and \"no rows\" reads as an answer, which is the
   one wrong thing a query tool must never say."
  [query-map]
  (let [result (try
                 (qp/process-query (prepare query-map))
                 (catch clojure.lang.ExceptionInfo e
                   (let [{:keys [status-code type]} (ex-data e)]
                     (fail! (ex-message e) type (or status-code 400)))))]
    (if (= :failed (:status result))
      (fail! (:error result) (:error_type result) 400)
      result)))

(defn- ordered?
  "Whether the query's last stage orders its rows."
  [query-map]
  (boolean (seq (:order-by (last (:stages query-map))))))

(defn- steer
  "The line that ends a truncated page: how to read the next one.

   An unordered query is called out, because paging one is not sound: `offset` compiles to SQL `OFFSET`,
   and a database is free to return the rows of two unordered windows in different orders, so a page
   boundary can repeat one row and skip another. The agent gets told rather than silently handed a result
   that is subtly not the table."
  [query-map offset returned]
  (str (tru (str "Showing {0} rows from offset {1}, and more may follow. Call again with the same "
                 "`query_handle` and `offset: {2}`, or add a filter or an aggregation to narrow the result.")
            returned offset (+ offset returned))
       (when-not (ordered? query-map)
         (str " " (tru (str "This query has no `order-by`, so its row order is not guaranteed: add one "
                            "before paging, or a row can repeat on one page and be missed on the next."))))))

(defn- truncated?
  "Whether rows remain behind this page. A full page means there may be more — the query processor
   counts what it returned, not what it left — except when the caller's own `limit:` ends exactly here."
  [query-map offset row-limit returned]
  (and (= returned row-limit)
       (let [limit (own-limit query-map)]
         (or (nil? limit) (< (+ offset row-limit) limit)))))

(defn- result->response
  [{{:keys [cols rows]} :data} {:keys [query-map handle offset row-limit response-format]}]
  (let [;; The caller's `limit:` came off the stage to make room for `:page`; it still caps the set.
        rows      (if-let [limit (own-limit query-map)]
                    (vec (take (- limit offset) rows))
                    (vec rows))
        returned  (count rows)]
    (cond-> {:query_handle handle
             :cols         (tools/project-all response-format (projections/spec :result-column) cols)
             :rows         rows
             :row_count    returned}
      (truncated? query-map offset row-limit returned)
      (assoc :truncated true :truncation_message (steer query-map offset returned)))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(defn execute-query
  "Validate a query, run it, and hand back a handle for what ran.

   The handle is a by-product, not a prerequisite: direct execution needs no construct step, and an
   unused handle just expires. It is minted for provenance — \"run it, then save *that*\" saves the
   byte-identical query the caller just saw, where re-emitting the MBQL is regeneration and can quietly
   mutate what gets saved. The store is content-addressed, so an iteration loop writes one row per
   distinct query rather than one per attempt."
  [{:keys [query_handle validate_only row_limit offset response_format] :as params}]
  (tools/check-exactly-one! params [:query :query_handle])
  (let [offset    (or offset 0)
        query-map (resolve-query params)]
    (check-mbql! query-map)
    (check-shape! query-map)
    (when query_handle
      (check-source-permissions! query-map))
    ;; A handle already names this query, byte for byte. Re-minting would hash the re-encoded JSON, which
    ;; need not encode identically, and hand back a *different* handle than the one the caller passed —
    ;; while the truncation message tells them to keep using the same one.
    (let [handle    (or query_handle (handles/store-query! api/*current-user-id* query-map))
          row-limit (page-size query-map (or row_limit default-row-limit))]
      (if validate_only
        {:query_handle handle :validated true}
        (do
          (check-offset! offset row-limit query-map)
          (-> (run-query! (paginated query-map offset row-limit))
              (result->response {:query-map       query-map
                                 :handle          handle
                                 :offset          offset
                                 :row-limit       row-limit
                                 :response-format response_format})))))))
