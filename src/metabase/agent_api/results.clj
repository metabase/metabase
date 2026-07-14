(ns metabase.agent-api.results
  "What a query tool does once it holds a query: run it as the app runs one, cut one page out of the result,
   and steer to the rest.

   `execute_query`, `execute_sql`, and `run_saved_question` differ in what a call names — MBQL, SQL, or a card.
   They do not differ in what comes back: the dataset REST shape, and, when rows sit behind the page, a message
   naming the call that reads them. That contract lives here rather than in each tool, because a steer that is
   right on one tool and stale on the other pages a model into rows that are not there.

   Paging lives here for a second reason: *how* a query pages is a property of the query, not of the tool
   holding it. `execute_sql` always holds SQL and `execute_query` always holds MBQL, but a saved question is
   whichever it was saved as, so the tool that runs one would otherwise have to carry both strategies itself —
   a third copy of the arithmetic, drifting from the two it was copied from.

   The response is bounded twice over: by the row cap the instance enforces, and by the token budget a client
   can hold. Both are real, and the second bites first — `response_format: \"detailed\"` returns whole
   query-processor columns, and a few hundred wide rows overrun a response long before the row cap does."
  (:refer-clojure :exclude [run!])
  (:require
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.query :as agent-api.query]
   [metabase.agent-api.tools :as tools]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.settings.core :as setting]))

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
;;; The row cap
;;; ──────────────────────────────────────────────────────────────────

(defn row-cap
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

(defn run!
  "Run `thunk`, one execution of a userland query, and return the query processor's result.

   A userland query does not throw on failure: the query processor hands back a result whose `:status` is
   `:failed` and whose `:error` carries the reason. Left unread, that result is indistinguishable here from a
   query that legitimately matched no rows — and \"no rows\" reads as an answer, which is the one wrong thing
   a query tool must never say.

   Wrap the execution and nothing around it. The checks a query passes on the way to the warehouse — the
   card's read check, the caller's permission on the tables — refuse in their own voice and with their own
   status, and a refusal that came back wearing \"The query failed\" would send the model off to fix a query
   that was never the problem."
  [thunk]
  (let [result (try
                 (thunk)
                 (catch clojure.lang.ExceptionInfo e
                   (let [{:keys [status-code type]} (ex-data e)]
                     (fail! (ex-message e) type (or status-code 400)))))]
    (if (= :failed (:status result))
      (fail! (:error result) (:error_type result) 400)
      result)))

(defn run-query!
  "Run `query-map` under the app's own userland preparation — see [[run!]]."
  [query-map]
  (run! #(qp/process-query (agent-api.query/prepare query-map))))

;;; ──────────────────────────────────────────────────────────────────
;;; Paging
;;; ──────────────────────────────────────────────────────────────────
;;
;; Two strategies, and which one applies is read off the query.
;;
;; MBQL pages by `:page {:page n :items m}` — rows (n-1)*m+1 through n*m — so an offset it can express is a
;; multiple of the page size. Rather than silently rounding a stray offset (which would return rows the caller
;; did not ask for and look like an answer), the pager says so; every offset a truncation message names
;; conforms by construction.
;;
;; Native SQL carries no clause the tool can re-window it with, so a page is read by fetching through the offset
;; and dropping what the caller has already seen. The instance's row cap bounds the fetch, and so bounds how far
;; an `offset` reaches; past it the only way on is `LIMIT`/`OFFSET` in the SQL itself.

(defn- mbql-unordered-warning
  "Paging an unordered query is not sound: `offset` compiles to SQL `OFFSET`, and a database is free to return
   the rows of two unordered windows in different orders, so a page boundary can repeat one row and skip
   another. Say so rather than hand back a result that is subtly not the table."
  [query-map]
  (when-not (seq (:order-by (last (:stages query-map))))
    (str " This query has no `order-by`, so its row order is not guaranteed: add one before paging, or a row "
         "can repeat on one page and be missed on the next.")))

(defn- sql-unordered-warning
  "The same caveat for raw SQL, where paging by re-reading makes it sharper still. The check is on the text and
   is therefore a caveat, not a verdict — it is attached to a steering message, never to a refusal."
  [query-map]
  (when-not (re-find #"(?i)\border\s+by\b" (str (get-in query-map [:stages 0 :native])))
    (str " This SQL has no `ORDER BY`, so its row order is not guaranteed: add one before paging, or a row "
         "can repeat on one page and be missed on the next.")))

(defn- check-mbql-offset!
  [query-map offset row-limit]
  (when-not (zero? (mod offset row-limit))
    (tools/teaching-error!
     (str "offset must be a multiple of the page size (" row-limit "); " offset " is not. Continue with the "
          "offset the previous response named.")))
  (when-let [limit (agent-api.query/own-limit query-map)]
    (when (<= limit offset)
      (tools/teaching-error!
       (str "This query's own limit of " limit " rows ends before offset " offset
            ". Raise the query's limit to read further.")))))

(defn- mbql-pager
  [query-map offset row-limit]
  ;; Sizing the page to what will survive the row cap keeps every row reachable — see [[row-cap]].
  (let [row-limit  (min (or (row-cap query-map) row-limit) row-limit)
        own-limit  (agent-api.query/own-limit query-map)
        last-stage (dec (count (:stages query-map)))]
    (check-mbql-offset! query-map offset row-limit)
    {:offset    offset
     :row-limit row-limit
     :own-limit own-limit
     :warning   (mbql-unordered-warning query-map)
     ;; `:page` and `:limit` cannot coexist on a stage, so the caller's `limit:` comes off here and is
     ;; re-applied to the rows — it caps the set, and the page reads within it.
     :window    (fn [query-map]
                  (-> query-map
                      (update-in [:stages last-stage] dissoc :limit)
                      (assoc-in [:stages last-stage :page] {:page  (inc (quot offset row-limit))
                                                            :items row-limit})))
     :trim      (fn [rows]
                  (if own-limit
                    (vec (take (- own-limit offset) rows))
                    (vec rows)))}))

(defn- native-pager
  [query-map offset row-limit]
  (let [cap       (row-cap query-map)
        available (if cap (- cap offset) row-limit)]
    (when-not (pos? available)
      (tools/teaching-error!
       (str "This instance returns at most " cap " rows for one query, and offset " offset " starts past "
            "that. Page inside the SQL with `LIMIT`/`OFFSET`, or aggregate — a question about that many "
            "rows is not answered by reading them.")))
    (let [row-limit (min row-limit available)
          fetch     (+ offset row-limit)
          warning   (sql-unordered-warning query-map)]
      {:offset         offset
       :row-limit      row-limit
       :warning        warning
       ;; The steer for a full page that ends at the row cap: `offset` cannot reach the rows behind it, so the
       ;; next call is a different query rather than a different offset.
       :capped-message (when (and cap (= fetch cap))
                         (str "Showing " row-limit " rows from offset " offset ", and more may follow — but "
                              "this instance returns at most " cap " rows for one query, so `offset` cannot "
                              "read past it. Add `LIMIT`/`OFFSET` to the SQL to read further, or aggregate to "
                              "answer the question without the rows." warning))
       :window         (fn [query-map]
                         (assoc query-map :constraints {:max-results           fetch
                                                        :max-results-bare-rows fetch}))
       ;; The rows through `offset` were fetched to reach the ones the caller asked for; they are not part of
       ;; the answer.
       :trim           (fn [rows] (vec (drop offset rows)))})))

(defn pager
  "How to cut the page `offset`/`row-limit` names out of `query-map`.

   Returns `:row-limit` — the rows the page actually carries, once the instance's row cap has had its say —
   plus `:window`, the query to run to read the page; `:trim`, the rows of that query's result that belong to
   it; and the caveats the steer to the next page must carry. Refuses an offset the strategy cannot express,
   before anything runs, so a dry run and a run agree on which calls are valid."
  [query-map offset row-limit]
  (if (agent-api.query/native-query? query-map)
    (native-pager query-map offset row-limit)
    (mbql-pager query-map offset row-limit)))

(defn window
  "`query-map` cut down to the page `pager` names."
  [pager query-map]
  ((:window pager) query-map))

;;; ──────────────────────────────────────────────────────────────────
;;; The page, bounded by rows and by budget
;;; ──────────────────────────────────────────────────────────────────

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
   divides the offsets already in the caller's hands, and MBQL's `:page` can only express an offset that is a
   multiple of the page size. Shrinking to a whole fraction of what was asked for keeps every offset the tool
   has handed out valid."
  [row-limit fits]
  (or (last (for [size (range 1 (inc row-limit))
                  :when (and (zero? (mod row-limit size)) (<= size fits))]
              size))
      1))

(defn- next-page-message
  [handle offset returned warning]
  (str "Showing " returned " rows from offset " offset ", and more may follow. Call again with "
       (when handle "the same `query_handle` and ")
       "`offset: " (+ offset returned) "`, or add a filter or an aggregation to narrow the result."
       warning))

(defn- budget-message
  [offset kept fetched page-size warning]
  (str "Showing " kept " of the " fetched " rows this page would have carried — the rest did not fit the "
       "response budget. Call again with `row_limit: " page-size "` and `offset: " (+ offset kept)
       "` to read the result in pages that fit, or add a filter or an aggregation to narrow it."
       warning))

(defn page-response
  "Shape the query-processor `result` of a windowed query into the page a query tool returns: the columns
   projected to the caller's `response_format`, the rows the page carries, and the steer to the rest.

   `pager` is the one [[window]] cut the query to. `:handle`, when the tool mints one, names the query that
   ran, so a next page, a save, or a chart is addressed by it rather than by re-sending the query."
  [{:keys [offset row-limit trim own-limit warning capped-message]} {{:keys [cols rows]} :data}
   {:keys [handle response-format]}]
  (let [rows    (trim rows)
        cols    (tools/project-all response-format (projections/spec :result-column) cols)
        fetched (count rows)
        base    (cond-> {:cols cols :row_count fetched}
                  handle (assoc :query_handle handle))
        fits    (rows-that-fit base rows)
        over?   (< fits fetched)
        fitting (budget-page-size row-limit fits)
        kept    (if over? (min fits fitting) fetched)
        ;; The query processor counts what it returned, not what it left — except when the query's own limit
        ;; ends exactly here.
        more?   (and (= kept row-limit)
                     (or (nil? own-limit) (< (+ offset row-limit) own-limit)))]
    (cond-> (assoc base :rows (subvec rows 0 kept) :row_count kept)
      over?
      (assoc :truncated          true
             :truncation_message (budget-message offset kept fetched fitting warning))

      (and (not over?) more?)
      (assoc :truncated          true
             :truncation_message (or capped-message (next-page-message handle offset kept warning))))))
