(ns metabase.api.query-description
  "Functions for generating human friendly query descriptions"
  (:require [clojure.tools.logging :as log]
            [metabase.models.field :refer [Field]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.segment :refer [Segment]]
            [metabase.util.i18n :as ui18n :refer [deferred-trs]]
            [clojure.string :as str]))

(defn- get-table-description
  [metadata query]
  {:table (:display_name metadata)})

(defn- format-expression
  [metadata expr]
  ;; TODO: ... this
  "")

(defn- get-aggregation-description
  [metadata query]
  (when-let [aggregations (:aggregation query)]
    {:aggregation
     (map
      (fn [aggregation]
        (cond
          (:options aggregation) {:type :aggregation
                                  :arg  (or (:name aggregation)
                                           (second aggregation))}

          (= (first aggregation) :metric) {:type :metric
                                           :arg  (let [metric (Metric (second aggregation))]
                                                   (if (not (str/blank? (:name metric)))
                                                     (:name metric)
                                                     (deferred-trs "[Unknown Metric]")))}

          :else (let [field-name (fn [a] (:display_name (Field (second (second a)))))]
                  (case (first aggregation)
                    :rows      {:type :rows}
                    :count     {:type :count}
                    :cum-count {:type :cum-count}
                    :avg       {:type :avg :field (field-name aggregation)}
                    :distinct  {:type :distinct :arg (field-name aggregation)}
                    :stddev    {:type :stddev :arg (field-name aggregation)}
                    :sum       {:type :sum :arg (field-name aggregation)}
                    :cum-sum   {:type :cum-sum :arg (field-name aggregation)}
                    :max       {:type :max :arg (field-name aggregation)}
                    :min       {:type :min :arg (field-name aggregation)}
                    {:type :expression :arg (format-expression metadata aggregation)}))))
      aggregations)}))

(defn- get-breakout-description
  [metadata query]
  (when-let [breakouts (seq (:breakout query))]
    {:breakout (map #(:display_name (Field %)) breakouts)}))

(defn- get-filter-clause-description
  [metadata filters]
  (log/spy :error filters)
  (loop [filters filters
         results []]
    (if (empty? filters)
      results
      (let [element (first filters)
            result (log/spy :error (if (or (= element :and)
                                           (= element :or))
                                     nil

                                     (let [operator (log/spy :error (first element))]
                                       (if (= operator :segment)
                                         {:segment (let [segment (Segment (second element))]
                                                     (if segment
                                                       (:name segment)
                                                       (deferred-trs "[Unknown Segment]")))}

                                         {:field (:display_name (Field (second (second element))))}))))]

        (recur (rest filters) (if result
                                (conj results result)
                                results))))))

(defn- get-filter-description
  [metadata query]
  (when-let [filters (:filter query)]
    {:filter (get-filter-clause-description metadata (if (= :and (first filters))
                                                        filters
                                                        (cons :and filters)))}))

(defn- get-order-by-description
  [metadata query]
  (when-let [order-by (:order-by query)]
    (:order-by (map (fn [[direction field]]
                      {(:display_name (Field (second field))) direction}) order-by))))

(defn- get-limit-description
  [metadata query]
  (when-let [limit (:limit query)]
    {:limit limit}))

(def query-descriptor-functions
  [get-table-description
   get-aggregation-description
   get-breakout-description
   get-filter-description
   get-order-by-description
   get-limit-description])

(defn generate-query-description
  "Analyze a query and return a data structure with the parts broken down for display
  in the UI.

  Ex:
  {
    :table \"Orders\"
    :filters [\"Created At\", \"Product ID\"]
    :order-by [{\"Created At\" :asc}]
  }

  This data structure allows the UI to format the strings appropriately (including JSX)"
  [metadata query]
  (log/spy :error metadata)
  (apply merge
         (map (fn [f] (f metadata query))
              query-descriptor-functions)))
