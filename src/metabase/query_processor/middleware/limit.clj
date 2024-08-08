(ns metabase.query-processor.middleware.limit
  "Middleware that handles limiting the maximum number of rows returned by a query."
  (:require
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.util :as qp.util]))

;;;; Pre-processing

(defn disable-max-results?
  "Returns the value of the disable-max-results? option in this query."
  [query]
  (get-in query [:middleware :disable-max-results?] false))

(defn disable-max-results
  "Sets the value of the disable-max-results? option in this query."
  [query]
  (assoc-in query [:middleware :disable-max-results?] true))

(defn- add-limit [max-rows {query-type :type, {original-limit :limit}, :query, :as query}]
  (cond-> query
    (and (= query-type :query)
         (qp.util/query-without-aggregations-or-limits? query))
    (update :query assoc :limit max-rows, ::original-limit original-limit)))

(defn- xlsx-export?
  [& {info :info}]
  (let [context (:context info)]
    (= context :xlsx-download)))

(defn determine-query-max-rows
  "Given a `query`, return the max rows that should be returned. This is either:
  1. the output of [[metabase.legacy-mbql.util/query->max-rows-limit]] when called on the given query
  2. the value of `pubic-settings/download-row-limit`
     a. if it is less than [[metabase.query-processor.interface/absolute-max-results]] or
     b. if it is greater and the export is NOT xlsx otherwise,
  3. [[metabase.query-processor.interface/absolute-max-results]] (a constant, non-nil backstop value)"
  [query]
  (when-not (disable-max-results? query)
    (cond-> (or (mbql.u/query->max-rows-limit query)
                (public-settings/download-row-limit)
                qp.i/absolute-max-results)
      (xlsx-export? query)
      (min qp.i/absolute-max-results))))

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
