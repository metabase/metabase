(ns metabase.agent-api.execute-query
  "The v2 `execute_query` tool: one decision point — *I have a query, run it*.

   `query` (portable MBQL 5 JSON) or `query_handle` names the query, `validate_only` is the dry run, and a
   handle comes back either way, so a save or a chart reuses the validated query without the model
   re-carrying it. Building a query, running one, and paging through one are all this tool: a catalog that
   splits them makes a model holding a query choose between overlapping doors, and that choice is the one it
   gets wrong.

   The query travels in the agent API's **external dialect**: staged like the product's own query format,
   but self-describing. Field refs are portable name arrays
   (`[\"field\" {} [\"Sample Database\" \"PUBLIC\" \"ORDERS\" \"TOTAL\"]]`), sources are table-name paths or
   card entity_ids, never bare integer ids — so a query the agent reads back from `get_content` round-trips
   into a run without a translation table, and a name that resolves to nothing is an error rather than a
   query silently run against the wrong column. The resolution pipeline behind that is Metabot's own
   ([[metabase.metabot.tools.construct/execute-representations-query]]): validate → repair → resolve → gate
   on the query builder's `canRun`.

   Continuation is `query_handle` + `offset`: the query lives in the store, so nothing but the offset travels
   through the model's context to read the next page.

   Rows come back in the dataset REST shape (`cols` + `rows` as value arrays), and they travel exactly once —
   in the text block. `structuredContent` carries only what a next call consumes: the handle, the count, and
   whether more rows are behind this page."
  (:require
   [metabase.agent-api.handles :as handles]
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.query :as agent-api.query]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.construct :as metabot-construct]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.settings.core :as setting]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def default-row-limit
  "Rows one call returns when it names no `row_limit`. Small on purpose: an agent that wants an answer
   asks for an aggregation, and an agent that wants rows pages for them."
  100)

(def max-row-limit
  "The most rows one call returns. The backend's userland constraints (2000 unaggregated, 10000
   aggregated) are the ceiling above this one; a response an agent cannot hold is the ceiling below."
  2000)

(def ^:private Params
  "The arguments [[execute-query]] contracts on. `POST /v2/execute-query` declares the wire schema, with the
   bounds a client is held to; this is the looser shape the domain function accepts."
  [:map
   [:query           {:optional true} [:maybe :map]]
   [:query_handle    {:optional true} [:maybe :string]]
   [:validate_only   {:optional true} [:maybe :boolean]]
   [:row_limit       {:optional true} [:maybe :int]]
   [:offset          {:optional true} [:maybe :int]]
   [:response_format {:optional true} [:maybe :string]]])

;;; ──────────────────────────────────────────────────────────────────
;;; The query a call names
;;; ──────────────────────────────────────────────────────────────────

(defn- check-mbql!
  "Refuse a native query, in the tool's voice: `execute_query` carries the MBQL scope, not the SQL one, so a
   handle or a payload that smuggles SQL past it would run raw SQL without the native-query scope and behind
   the `execute_sql` kill switch."
  [query-map]
  (when (agent-api.query/native-query? query-map)
    (tools/teaching-error!
     "This is a native SQL query. Run it with `execute_sql`, which is scoped for raw SQL.")))

(defn- resolve-query
  "The serialized MBQL query a call names, from a handle or from the portable payload.

   The payload path runs the resolution pipeline, which is where the teaching happens: an unknown table or
   column comes back naming the recovery (it names no candidates on purpose — its metadata provider is
   un-sandboxed, so a candidate list would tell a sandboxed caller which tables exist). The handle path skips
   the pipeline: that query resolved once already, when the handle was minted."
  [{:keys [query query_handle]}]
  (if query_handle
    ;; Normalized on the way out of the store: a handle's row is JSON, so its markers come back as strings
    ;; (`"mbql/query"`), and MBQL is keywords.
    (or (some-> (handles/read-query api/*current-user-id* query_handle) lib/normalize)
        (tools/teaching-error!
         (str "No query handle " (pr-str query_handle) ". A handle expires, and it belongs to the user who "
              "minted it — send the query itself in `query`.")
         404))
    (do
      ;; Ahead of the pipeline, which would reject raw SQL as a malformed *MBQL* query and send the model
      ;; off to fix a query that was never MBQL in the first place.
      (check-mbql! query)
      (-> (metabot-construct/execute-representations-query query)
          (get-in [:structured-output :query])
          lib/prepare-for-serialization))))

;;; ──────────────────────────────────────────────────────────────────
;;; Paging
;;; ──────────────────────────────────────────────────────────────────
;;
;; MBQL pages by `:page {:page n :items m}` — rows (n-1)*m+1 through n*m — so an offset it can express is a
;; multiple of the page size. Rather than silently rounding a stray offset (which would return rows the caller
;; did not ask for and look like an answer), the tool says so; every offset a truncation message names
;; conforms by construction.

(defn- row-cap
  "The most rows the query processor will actually return for `query-map`: the instance's userland row cap as
   it applies to *this* database, or nil when it has none.

   Both caps (2000 unaggregated, 10000 aggregated by default) are **database-local** settings — an admin can
   lower either for one database — and a database-local value is only visible with that database's settings
   bound. Read site-wide, a lowered per-database cap is invisible: the page is sized above what the query
   processor will return, the query processor trims the result, and `offset` steps straight over the rows it
   dropped, so a short last page reads as the end of the data."
  [query-map]
  (let [mp (lib-be/application-database-metadata-provider (:database query-map))]
    (setting/with-database (lib.metadata/database mp)
      (some-> (qp.constraints/add-constraints query-map) lib/max-rows-limit))))

(defn- page-size
  "How many rows a page actually carries: `row-limit`, unless the query processor would return fewer. Sizing
   the page to what will survive the row cap keeps every row reachable — see [[row-cap]]."
  [query-map row-limit]
  (min (or (row-cap query-map) row-limit) row-limit))

(defn- check-offset!
  [offset row-limit query-map]
  (when-not (zero? (mod offset row-limit))
    (tools/teaching-error!
     (str "offset must be a multiple of the page size (" row-limit "); " offset " is not. Continue with the "
          "offset the previous response named.")))
  (when-let [limit (agent-api.query/own-limit query-map)]
    (when (<= limit offset)
      (tools/teaching-error!
       (str "This query's own limit of " limit " rows ends before offset " offset
            ". Raise the query's limit to read further.")))))

(defn- paginated
  "`query-map` windowed to the page `offset` and `row-limit` name. `:page` and `:limit` cannot coexist on a
   stage, so the caller's `limit:` comes off here and is re-applied to the rows — it caps the set, and the
   page reads within it."
  [query-map offset row-limit]
  (let [last-stage (dec (count (:stages query-map)))]
    (-> query-map
        (update-in [:stages last-stage] dissoc :limit)
        (assoc-in [:stages last-stage :page] {:page  (inc (quot offset row-limit))
                                              :items row-limit}))))

;;; ──────────────────────────────────────────────────────────────────
;;; Execution
;;; ──────────────────────────────────────────────────────────────────

(defn- fail!
  "Refuse with the query processor's own message. A failure here is the model's to fix — a bad cast, a
   timeout, a column the driver rejects — so it reads the database's diagnosis rather than a 500. A
   permission failure keeps its 403, which is what the parity matrix compares against REST."
  [message error-type status]
  (tools/teaching-error! (str "The query failed: " message)
                         (if (qp.error-type/permission-error? error-type) 403 status)))

(defn- run-query!
  "Run `query-map` and return the query processor's result.

   A userland query does not throw on failure: the query processor hands back a result whose `:status` is
   `:failed` and whose `:error` carries the reason. Left unread, that result is indistinguishable here from a
   query that legitimately matched no rows — and \"no rows\" reads as an answer, which is the one wrong thing
   a query tool must never say."
  [query-map]
  (let [result (try
                 (qp/process-query (agent-api.query/prepare query-map))
                 (catch clojure.lang.ExceptionInfo e
                   (let [{:keys [status-code type]} (ex-data e)]
                     (fail! (ex-message e) type (or status-code 400)))))]
    (if (= :failed (:status result))
      (fail! (:error result) (:error_type result) 400)
      result)))

;;; ──────────────────────────────────────────────────────────────────
;;; The response, bounded by rows and by budget
;;; ──────────────────────────────────────────────────────────────────

(defn- ordered?
  "Whether the query's last stage orders its rows."
  [query-map]
  (boolean (seq (:order-by (last (:stages query-map))))))

(defn- unordered-warning
  "Paging an unordered query is not sound: `offset` compiles to SQL `OFFSET`, and a database is free to
   return the rows of two unordered windows in different orders, so a page boundary can repeat one row and
   skip another. Say so rather than hand back a result that is subtly not the table."
  [query-map]
  (when-not (ordered? query-map)
    (str " This query has no `order-by`, so its row order is not guaranteed: add one before paging, or a row "
         "can repeat on one page and be missed on the next.")))

(defn- next-page-message
  [query-map offset returned]
  (str "Showing " returned " rows from offset " offset ", and more may follow. Call again with the same "
       "`query_handle` and `offset: " (+ offset returned) "`, or add a filter or an aggregation to narrow "
       "the result."
       (unordered-warning query-map)))

(defn- budget-message
  [query-map offset kept fetched page-size]
  (str "Showing " kept " of the " fetched " rows this page would have carried — the rest did not fit the "
       "response budget. Call again with `row_limit: " page-size "` and `offset: " (+ offset kept)
       "` to read the result in pages that fit, or add a filter or an aggregation to narrow it."
       (unordered-warning query-map)))

(defn- rows-that-fit
  "How many of `rows` fit the response budget alongside `base`, the rest of the response. At least one, so a
   single pathologically wide row still surfaces rather than being replaced by an empty result."
  [base rows]
  (count (:included (tools/budget-units
                     rows
                     {:token-budget (- tools/token-budget (tools/estimate-tokens base))}))))

(defn- budget-page-size
  "The largest page size that divides `row-limit` and carries no more than `fits` rows.

   A page within the row cap can still overrun the response budget: two hundred wide rows do it long before
   two thousand narrow ones. Cutting to exactly the rows that fit would leave a page size that no longer
   divides the offsets already in the caller's hands, and `offset` has to be a multiple of the page size for
   MBQL's `:page` to express it. Shrinking to a whole fraction of what was asked for keeps every offset the
   tool has handed out valid."
  [row-limit fits]
  (or (last (for [size (range 1 (inc row-limit))
                  :when (and (zero? (mod row-limit size)) (<= size fits))]
              size))
      1))

(defn- truncated?
  "Whether rows remain behind a full page. The query processor counts what it returned, not what it left —
   except when the caller's own `limit:` ends exactly here."
  [query-map offset row-limit returned]
  (and (= returned row-limit)
       (let [limit (agent-api.query/own-limit query-map)]
         (or (nil? limit) (< (+ offset row-limit) limit)))))

(defn- result->response
  [{{:keys [cols rows]} :data} {:keys [query-map handle offset row-limit response-format]}]
  (let [;; The caller's `limit:` came off the stage to make room for `:page`; it still caps the set.
        rows     (if-let [limit (agent-api.query/own-limit query-map)]
                   (vec (take (- limit offset) rows))
                   (vec rows))
        cols     (tools/project-all response-format (projections/spec :result-column) cols)
        fetched  (count rows)
        base     {:query_handle handle :cols cols :row_count fetched}
        fits     (rows-that-fit base rows)
        over?    (< fits fetched)
        fitting  (budget-page-size row-limit fits)
        kept     (if over? (min fits fitting) fetched)]
    (cond-> (assoc base :rows (subvec rows 0 kept) :row_count kept)
      over?
      (assoc :truncated          true
             :truncation_message (budget-message query-map offset kept fetched fitting))

      (and (not over?) (truncated? query-map offset row-limit kept))
      (assoc :truncated          true
             :truncation_message (next-page-message query-map offset kept)))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(defn- check-call!
  "Everything that has to hold before a query runs, and every one of them holds for `validate_only` too.

   A dry run that blesses a call the same handle would later refuse is worse than no dry run at all — and
   when what it blesses is a table the caller cannot query or a column their sandbox hides, the refusal it
   skipped was the only thing standing between the model and an existence oracle for exactly the data the
   permission was meant to hide."
  [query-map {:keys [offset]} row-limit]
  (check-mbql! query-map)
  (agent-api.query/check-shape! query-map)
  (agent-api.query/check-source-permissions! query-map)
  (check-offset! (or offset 0) row-limit query-map))

(mu/defn execute-query :- :map
  "Validate a query, run it, and hand back a handle for what ran.

   The handle is a by-product, not a prerequisite: direct execution needs no construct step, and an unused
   handle just expires. It is minted for provenance — \"run it, then save *that*\" saves the byte-identical
   query the caller just saw, where re-emitting the MBQL is regeneration and can quietly mutate what gets
   saved. The store is content-addressed, so an iteration loop writes one row per distinct query rather than
   one per attempt."
  [{:keys [query_handle validate_only row_limit offset response_format] :as params} :- Params]
  (tools/check-exactly-one! params [:query :query_handle])
  (let [offset    (or offset 0)
        query-map (resolve-query params)
        row-limit (page-size query-map (tools/clamp-limit row_limit default-row-limit max-row-limit))]
    (check-call! query-map params row-limit)
    ;; A handle already names this query, byte for byte. Re-minting would hash the re-encoded JSON, which
    ;; need not encode identically, and hand back a *different* handle than the one the caller passed —
    ;; while the truncation message tells them to keep using the same one.
    (let [handle (or query_handle (handles/store-query! api/*current-user-id* query-map))]
      (if validate_only
        {:query_handle handle :validated true}
        (-> (run-query! (paginated query-map offset row-limit))
            (result->response {:query-map       query-map
                               :handle          handle
                               :offset          offset
                               :row-limit       row-limit
                               :response-format response_format}))))))
