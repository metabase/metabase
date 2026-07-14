(ns metabase.agent-api.results
  "What a query tool does once it holds a query: run it as the app runs one, and shape the rows into the
   bounded page the query toolset returns.

   `execute_query` and `execute_sql` differ in what a call names — MBQL or SQL — and in how a page is cut
   out of the result. They do not differ in what comes back: the dataset REST shape, a handle naming the
   query that ran, and, when rows sit behind the page, a message naming the call that reads them. That
   contract lives here rather than in each tool, because a steer that is right on one tool and stale on
   the other pages a model into rows that are not there.

   The response is bounded twice over: by the row cap the instance enforces, and by the token budget a
   client can hold. Both are real, and the second bites first — `response_format: \"detailed\"` returns
   whole query-processor columns, and a few hundred wide rows overrun a response long before the row cap
   does."
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

(defn run-query!
  "Run `query-map` under the app's own userland preparation and return the query processor's result.

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
  [offset returned warning]
  (str "Showing " returned " rows from offset " offset ", and more may follow. Call again with the same "
       "`query_handle` and `offset: " (+ offset returned) "`, or add a filter or an aggregation to narrow "
       "the result."
       warning))

(defn- budget-message
  [offset kept fetched page-size warning]
  (str "Showing " kept " of the " fetched " rows this page would have carried — the rest did not fit the "
       "response budget. Call again with `row_limit: " page-size "` and `offset: " (+ offset kept)
       "` to read the result in pages that fit, or add a filter or an aggregation to narrow it."
       warning))

(defn page-response
  "Shape a query processor `result` into the page a query tool returns: the columns projected to the caller's
   `response_format`, the rows, the `query_handle` naming what ran, and the steer to the rest.

   Options:
   - `:handle`, `:offset`, `:row-limit`, `:response-format` — the call this page answers.
   - `:own-limit` — a row cap the *query itself* carries (an MBQL `limit:`), which bounds the whole set
     rather than one page, so the last page stops short of `row-limit` and nothing sits behind it.
   - `:warning` — a caveat appended to every steer this page emits, for a result whose row order the tool
     cannot vouch for.
   - `:capped-message` — the steer to use in place of the next-page one when rows remain but `offset` cannot
     reach them: raw SQL pages by re-reading and dropping, so the instance's row cap bounds how far an
     `offset` can go, where MBQL's `:page` re-windows in the warehouse and has no such ceiling."
  [{{:keys [cols rows]} :data}
   {:keys [handle offset row-limit response-format own-limit warning capped-message]}]
  (let [rows    (if own-limit
                  (vec (take (- own-limit offset) rows))
                  (vec rows))
        cols    (tools/project-all response-format (projections/spec :result-column) cols)
        fetched (count rows)
        base    {:query_handle handle :cols cols :row_count fetched}
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
             :truncation_message (or capped-message (next-page-message offset kept warning))))))
