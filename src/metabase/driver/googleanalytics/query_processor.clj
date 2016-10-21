(ns metabase.driver.googleanalytics.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into Google Analytics request format."
  (:require (clojure [string :as s])
            [clojure.tools.logging :as log]
            [medley.core :as m]
            (metabase.query-processor [expand :as expand])))

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
(defn- parse-filter-subclause [{:keys [filter-type field value] :as filter} & [negate?]]
  (let [field (when field (:field-name field))
        value (when value (:value value))]
    ;; "when field" ends up filtering out datetime filters, which we want, but there's probably a better way
    (when field (case filter-type
                  :contains    (ga-filter field "=@" value)
                  :starts-with (ga-filter field "=~^" (escape-for-regex value))
                  :ends-with   (ga-filter field "=~"  (escape-for-regex value) "$")
                  :=           (ga-filter field "==" value)
                  :>           (ga-filter field ">" value)
                  :<           (ga-filter field "<" value)
                  :>=          (ga-filter field ">=" value)
                  :<=          (ga-filter field "<=" value)
                  :between     (str (ga-filter field ">=" (:value (:min-val filter)))
                                    ";"
                                    (ga-filter field ">=" (:value (:min-val filter))))))))

(defn- parse-filter-clause [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (s/join ";" (remove nil? (mapv parse-filter-clause subclauses)))
    :or  (s/join "," (remove nil? (mapv parse-filter-clause subclauses)))
    :not (parse-filter-subclause subclause :negate)
    nil  (parse-filter-subclause clause)))

(defn- handle-filter [{filter-clause :filter}]
  (when filter-clause
    (let [filter (parse-filter-clause filter-clause)]
      (when-not (s/blank? filter) filter))))


(defn- format-ga-date [{:keys [amount unit value]}]
  (cond
    value                             (.format (java.text.SimpleDateFormat. "yyyy-MM-dd") value)
    (and (= unit :day) (= amount 0))  "today"
    (and (= unit :day) (= amount -1)) "yesterday"
    (and (= unit :day) (< amount -1)) (str (- amount) "daysAgo")))

(defn- parse-date-filter-subclause [{:keys [filter-type field value] :as filter} & [negate?]]
  (case filter-type
    :between {:start-date (format-ga-date (:min-val filter))
              :end-date (format-ga-date  (:max-val filter))}
    :=       {:start-date "TODO"
              :end-date "TODO"}))

(defn- parse-date-filter-clause [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply concat (mapv parse-date-filter-clause subclauses))
    :or  (apply concat (mapv parse-date-filter-clause subclauses))
    :not (parse-date-filter-clause subclause)
    nil  (when (isa? (get-in clause [:field :field :base-type]) :type/DateTime)
           [(parse-date-filter-subclause clause)])))

(defn- extract-start-end-date [{filter-clause :filter}]
  (let [date-filters (if filter-clause (parse-date-filter-clause filter-clause) [])]
    (case (count date-filters)
      0 {:start-date "2005-01-01" :end-date "today"}
      1 (first date-filters)
      (throw (Exception. "Multiple date filters are not allowed")))))

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
