(ns metabase.query-processor.middleware.limit
  "Middleware that handles limiting the maximum number of rows returned by a query."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.limit :as lib.limit]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.util.malli :as mu]))

;;;; Pre-processing

(defn disable-max-results?
  "Returns the value of the disable-max-results? option in this query."
  [query]
  (get-in query [:middleware :disable-max-results?] false))

(defn disable-max-results
  "Sets the value of the disable-max-results? option in this query."
  [query]
  (assoc-in query [:middleware :disable-max-results?] true))

(mu/defn ^:private add-limit :- ::lib.schema/query
  [max-rows :- ::lib.schema/limit
   query    :- ::lib.schema/query]
  (let [last-stage (lib.util/query-stage query -1)]
    (if (and (= (:lib/type last-stage) :mbql.stage/mbql)
             (not (lib/aggregations query -1))
             (not (lib/current-limit query -1))
             (not (:page last-stage)))
      (lib/limit query -1 max-rows)
      query)))

(mu/defn determine-query-max-rows :- [:maybe ::lib.schema/limit]
  "Given a `query`, return the max rows that should be returned, or `nil` if no limit should be applied.
  If a limit should be applied, this is the first non-nil value from (in decreasing priority order):

  1. the value of the [[metabase.query-processor.middleware.constraints/max-results-bare-rows]] setting, which allows
     for database-local override
  2. the output of [[metabase.mbql.util/query->max-rows-limit]] when called on the given query
  3. [[metabase.query-processor.interface/absolute-max-results]] (a constant, non-nil backstop value)"
  [query :- ::lib.schema/query]
  (when-not (disable-max-results? query)
    (or (qp.constraints/max-results-bare-rows)
        (lib.limit/query->max-rows-limit query -1)
        qp.i/absolute-max-results)))

(defn add-default-limit
  "Pre-processing middleware. Add default `:limit` to MBQL queries without any aggregations."
  [query]
  (if-let [max-rows (determine-query-max-rows query)]
    (add-limit max-rows query)
    query))


;;;; Post-processing

(defn- limit-xform [max-rows rf]
  {:pre [(fn? rf)]}
  ;; TODO FIXME: This is sort of a hack, but our old version of this code used to always take the first row no matter
  ;; what and [[metabase.driver.sqlserver-test/max-results-bare-rows-test]] was written expecting that behavior. I
  ;; haven't quite worked around how to fix that test yet. When that happens we can change this to
  ;;
  ;;    ((take max-rows) rf)
  ;;
  ;; Background: SQL Server treats a limit of `0` as meaning "unbounded". SQL Server can override
  ;; [[qp.constraints/max-results-bare-rows]] with a Database-local Setting to fix #9940, where queries with aggregations
  ;; and expressions could return the wrong results because of limits being applied to subselects. Realistically the
  ;; overriden limit of `0` should probably only apply to the MBQL query and not to the number of rows we take. But we'd
  ;; have to break [[determine-query-max-rows]] into two separate things in order to do that. :shrug:
  ((take (if-not (pos? max-rows) 1 max-rows)) rf))

(defn limit-result-rows
  "Post-processing middleware. Limit the maximum number of rows that are returned in post-processing."
  [query rff]
  (let [max-rows (determine-query-max-rows query)]
    (fn limit-result-rows-rff* [metadata]
      (limit-xform max-rows (rff metadata)))))
