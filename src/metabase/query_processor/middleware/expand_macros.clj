(ns metabase.query-processor.middleware.expand-macros
  "Middleware for expanding `:metric` and `:segment` 'macros' in *unexpanded* MBQL queries.

  (`:metric` forms are expanded into aggregations and sometimes filter clauses, while `:segment` forms are expanded
  into filter clauses.)

   TODO - this namespace is ancient and written with MBQL '95 in mind, e.g. it is case-sensitive.
   At some point this ought to be reworked to be case-insensitive and cleaned up."
  (:require [clojure.tools.logging :as log]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [metric :refer [Metric]]
             [segment :refer [Segment]]]
            [metabase.query-processor.interface :as i]
            [metabase.util :as u]
            [puppetlabs.i18n.core :refer [tru]]
            [schema.core :as s]
            [toucan.db :as db]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    SEGMENTS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- segment-clauses->id->definition [segment-clauses]
  (when-let [segment-ids (seq (filter integer? (map second segment-clauses)))]
    (db/select-id->field :definition Segment, :id [:in (set segment-ids)])))

(defn- replace-segment-clauses [outer-query segment-id->definition]
  (mbql.u/replace-in outer-query [:query]
    [:segment (segment-id :guard (complement mbql.u/ga-id?))]
    (or (:filter (segment-id->definition segment-id))
        (throw (IllegalArgumentException. (str (tru "Segment {0} does not exist, or is invalid." segment-id)))))))

(s/defn ^:private expand-segments :- mbql.s/Query
  [{inner-query :query, :as outer-query} :- mbql.s/Query]
  (if-let [segments (mbql.u/match inner-query :segment)]
    (replace-segment-clauses outer-query (segment-clauses->id->definition segments))
    outer-query))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    METRICS                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- metrics
  "Return a sequence of any (non-GA) `:metric` MBQL clauses in `query`."
  [query]
  ;; metrics won't be in a native query but they could be in source-query or aggregation clause
  (mbql.u/match query [:metric (_ :guard (complement mbql.u/ga-id?))]))

(defn- metric-clauses->id->definition [metric-clauses]
  (db/select-id->field :definition Metric, :id [:in (set (map second metric-clauses))]))

(defn- add-metrics-filters [query metric-id->definition]
  (let [filters (filter identity (map :filter (vals metric-id->definition)))]
    (reduce mbql.u/add-filter-clause query filters)))

(defn- replace-metrics-aggregations [query metric-id->definition]
  (mbql.u/replace-in query [:query]
    [:metric (metric-id :guard (complement mbql.u/ga-id?))]
    (or (first (:aggregation (metric-id->definition metric-id)))
        (throw (IllegalArgumentException.
                (str (tru "Metric {0} does not exist, or is invalid." metric-id)))))))

(defn- add-metrics-clauses
  "Add appropriate `filter` and `aggregation` clauses for a sequence of Metrics.

    (add-metrics-clauses {:query {}} [[:metric 10]])
    ;; -> {:query {:aggregation [[:count]], :filter [:= [:field-id 10] 20]}}"
  [query metric-id->definition]
  (-> query
      (add-metrics-filters metric-id->definition)
      (replace-metrics-aggregations metric-id->definition)))

(s/defn ^:private expand-metrics :- mbql.s/Query
  [query :- mbql.s/Query]
  (if-let [metrics (metrics query)]
    (add-metrics-clauses query (metric-clauses->id->definition metrics))
    query))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIDDLEWARE                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private expand-metrics-and-segments  :- mbql.s/Query
  "Expand the macros (`segment`, `metric`) in a `query`."
  [query  :- mbql.s/Query]
  (-> query
      expand-metrics
      expand-segments))

(defn- expand-macros*
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (u/prog1 (expand-metrics-and-segments query)
      (when (and (not i/*disable-qp-logging*)
                 (not= <> query))
        (log/debug (u/format-color 'cyan "\n\nMACRO/SUBSTITUTED: %s\n%s" (u/emoji "😻") (u/pprint-to-str <>)))))))

(defn expand-macros
  "Middleware that looks for `:metric` and `:segment` macros in an unexpanded MBQL query and substitute the macros for
  their contents."
  [qp]
  (comp qp expand-macros*))
