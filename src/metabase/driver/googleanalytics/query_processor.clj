(ns metabase.driver.googleanalytics.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into Google Analytics request format."
  (:require (clojure [string :as s])
            [clojure.tools.logging :as log]
            [medley.core :as m]
            (metabase.query-processor [expand :as expand])))

(defn- escape-map
  [chars escape-char]
  (into {} (zipmap chars (map #(str escape-char %) chars))))

(defn escape-for-regex
  [str]
  (s/escape str (escape-map ".\\+*?[^]$(){}=!<>|:-" "\\")))

(defn escape-for-filter-clause
  [str]
  (s/escape str (escape-map ",;\\" "\\")))

;;; ### breakout

(defn- handle-breakout [{breakout-clause :breakout}]
  (when breakout-clause
    (s/join "," (for [breakout breakout-clause]
                  (:field-name breakout)))))

;;; ### filter

(defn- parse-filter-subclause [{:keys [filter-type field value] :as filter} & [negate?]]
  (let [field (when field (:field-name field))
        value (when value (:value value))
        v     (case filter-type
                :contains    (str "=@"  value)
                :starts-with (str "=~^" (escape-for-regex value))
                :ends-with   (str "=~"  (escape-for-regex value) "$")
                :=           (str "==" value)
                :!=          (str "!=" value))]
    (escape-for-filter-clause (str field v))))

(defn- parse-filter-clause [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (s/join ";" (mapv parse-filter-clause subclauses))
    :or  (s/join "," (mapv parse-filter-clause subclauses))
    :not (parse-filter-subclause subclause :negate)
    nil  (parse-filter-subclause clause)))

(defn- handle-filter [{filter-clause :filter}]
  (when filter-clause
    (parse-filter-clause filter-clause)))

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
  {:query {:start-date  "2005-01-01"
           :end-date    "today"
           :metrics     (get-in query [:ga :metrics])
           :segment     (get-in query [:ga :segment])
           :dimensions  (handle-breakout (:query query))
           :filters     (handle-filter (:query query))
           :sort        (handle-order-by (:query query))
           :max-results (handle-limit (:query query))}})



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
      (= 1 (count segments)) (first segments)
      (< 1 (count segments)) (throw (Exception. "Only one Google Analytics segment allowed at a time.")))))

(defn- remove-builtin-segments
  [filter-clause]
  (let [filter-clause (filter (complement builtin-segment?) filter-clause)]
    (if (> 1 (count filter-clause))
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
