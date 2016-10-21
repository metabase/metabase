(ns metabase.driver.googleanalytics.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into Google Analytics request format."
  (:require (clojure [string :as s])
            [clojure.tools.logging :as log]
            [medley.core :as m]
            (metabase.query-processor [expand :as expand])
            [metabase.util :as u])
  (:import java.sql.Timestamp
           java.util.Date
           clojure.lang.PersistentArrayMap
           (metabase.query_processor.interface AgFieldRef
                                               DateTimeField
                                               DateTimeValue
                                               Field
                                               RelativeDateTimeValue
                                               Value)))

(def ^:private ^:const earliest-date "2005-01-01")
(def ^:private ^:const latest-date "today")

;; TODO: what should this actually be?
;; https://developers.google.com/analytics/devguides/reporting/core/v3/reference#startDate
;; says: Relative dates are always relative to the current date at the time of the query and are based on the timezone of the view (profile) specified in the query.
(defn- get-timezone-id [] "UTC")

(defn- date->ga-date
  [date]
  (.format (java.text.SimpleDateFormat. "yyyy-MM-dd") date))

(defprotocol ^:private IRValue
  (^:private ->rvalue [this]))

(extend-protocol IRValue
  nil                   (->rvalue [_] nil)
  Object                (->rvalue [this] this)
  Field                 (->rvalue [this] (:field-name this))
  DateTimeField         (->rvalue [this] (->rvalue (:field this)))
  Value                 (->rvalue [this] (:value this))
  DateTimeValue         (->rvalue [{{unit :unit} :field, value :value}] (date->ga-date (u/date-trunc-or-extract unit value (get-timezone-id))))
  RelativeDateTimeValue (->rvalue [{:keys [unit amount]}]
                                  (cond
                                    (and (= unit :day) (= amount 0))  "today"
                                    (and (= unit :day) (= amount -1)) "yesterday"
                                    (and (= unit :day) (< amount -1)) (str (- amount) "daysAgo")
                                    :else (date->ga-date (u/date-trunc-or-extract unit (u/relative-date unit amount) (get-timezone-id))))))

(defn- escape-map
  [chars escape-char]
  (into {} (zipmap chars (map #(str escape-char %) chars))))

(defn- escape-for-regex
  [str]
  (s/escape str (escape-map ".\\+*?[^]$(){}=!<>|:-" "\\")))

(defn- escape-for-filter-clause
  [str]
  (s/escape str (escape-map ",;\\" "\\")))

(defn- ga-filter
  [& parts]
  (escape-for-filter-clause (apply str parts)))

;;; ### breakout

(defn- handle-breakout [{breakout-clause :breakout}]
  (when breakout-clause
    (s/join "," (for [breakout breakout-clause]
                  (:field-name breakout)))))

;;; ### filter

;; TODO: implement negate?
(defn- parse-filter-subclause:filter [{:keys [filter-type field value] :as filter} & [negate?]]
  (if negate? (throw (Exception. ":not is :not yet implemented")))
  (when-not (instance? DateTimeField field)
    (let [field (when field (->rvalue field))
          value (when value (->rvalue value))]
      (case filter-type
        :contains    (ga-filter field "=@" value)
        :starts-with (ga-filter field "=~^" (escape-for-regex value))
        :ends-with   (ga-filter field "=~"  (escape-for-regex value) "$")
        :=           (ga-filter field "==" value)
        :>           (ga-filter field ">" value)
        :<           (ga-filter field "<" value)
        :>=          (ga-filter field ">=" value)
        :<=          (ga-filter field "<=" value)
        :between     (str (ga-filter field ">=" (->rvalue (:min-val filter)))
                          ";"
                          (ga-filter field "<=" (->rvalue (:max-val filter))))))))

(defn- parse-filter-clause:filter [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (s/join ";" (remove nil? (mapv parse-filter-clause:filter subclauses)))
    :or  (s/join "," (remove nil? (mapv parse-filter-clause:filter subclauses)))
    :not (parse-filter-subclause:filter subclause :negate)
    nil  (parse-filter-subclause:filter clause)))

(defn- handle-filter [{filter-clause :filter}]
  (when filter-clause
    (let [filter (parse-filter-clause:filter filter-clause)]
      (when-not (s/blank? filter) filter))))

(defn- parse-filter-subclause:interval [{:keys [filter-type field value] :as filter} & [negate?]]
  (if negate? (throw (Exception. ":not is :not yet implemented")))
  (when (instance? DateTimeField field)
    (case filter-type
      :between {:start-date (->rvalue (:min-val filter))
                :end-date   (->rvalue (:max-val filter))}
      :>       {:start-date (->rvalue (:value filter))
                :end-date   latest-date}
      :<       {:start-date earliest-date
                :end-date   (->rvalue (:value filter))}
      :=       {:start-date (->rvalue (:value filter))
                :end-date   (->rvalue (:value filter))})))

(defn- parse-filter-clause:interval [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply concat (remove nil? (mapv parse-filter-clause:interval subclauses)))
    :or  (apply concat (remove nil? (mapv parse-filter-clause:interval subclauses)))
    :not (remove nil? [(parse-filter-subclause:interval subclause :negate)])
    nil  (remove nil? [(parse-filter-subclause:interval clause)])))

(defn- extract-start-end-date [{filter-clause :filter}]
  (let [date-filters (if filter-clause (parse-filter-clause:interval filter-clause) [])]
    (log/info date-filters)
    (case (count date-filters)
      0 {:start-date earliest-date :end-date latest-date}
      1 (first date-filters)
      (throw (Exception. "Multiple date filters are not supported")))))

;;; ### order-by

(defn- handle-order-by [{order-by-clause :order-by}]
  (when order-by-clause
    (s/join "," (for [{:keys [field direction]} order-by-clause]
                  (str (case direction
                         :ascending  ""
                         :descending "-")
                       (:field-name field))))))

;;; ### limit

(defn- handle-limit [{limit-clause :limit}]
  (when-not (nil? limit-clause)
     (int limit-clause)))

(defn mbql->native [query]
  "Transpile MBQL query into parameters required for a Google Analytics request."
  {:query (merge (extract-start-end-date (:query query))
                 {:metrics     (get-in query [:ga :metrics])
                  :dimensions  (handle-breakout (:query query))
                  :sort        (handle-order-by (:query query))
                  :segment     (get-in query [:ga :segment])
                  :filters     (handle-filter (:query query))
                  :max-results (handle-limit (:query query))})})

(defn- builtin-metric?
  [aggregation]
  (and (sequential? aggregation)
       (= :metric (expand/normalize-token (get aggregation 0)))
       (string? (get aggregation 1))))

(defn- builtin-segment?
  [filter]
  (and (sequential? filter)
       (= :segment (expand/normalize-token (get filter 0)))
       (string? (get filter 1))))

(defn- extract-builtin-segment
  [filter-clause]
  (let [segments (for [f filter-clause :when (builtin-segment? f)] (get f 1))]
    (cond
      (= (count segments) 1) (first segments)
      (> (count segments) 1) (throw (Exception. "Only one Google Analytics segment allowed at a time.")))))

(defn- remove-builtin-segments
  [filter-clause]
  (let [filter-clause (vec (filter (complement builtin-segment?) filter-clause))]
    (if (> (count filter-clause) 1)
      filter-clause)))

(defn transform-query [query]
  "Preprocess the incoming query to pull out builtin segments and metrics."
  (-> query
      ;; pull metrics out and put in :ga
      ;; TODO: support mulitple metrics
      (assoc-in [:ga :metrics] (get-in query [:query :aggregation 1]))
      ;; remove metrics from query dict
      ; (m/dissoc-in [:query :aggregation])
      ;; fake the aggregation :-/
      (assoc-in [:query :aggregation] [:count])
      ;; pull segments out and put in :ga
      (assoc-in [:ga :segment] (extract-builtin-segment (get-in query [:query :filter])))
      ;; remove segments from query dict
      (update-in [:query :filter] remove-builtin-segments)))
