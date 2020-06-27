(ns metabase.api.query-description
  "Functions for generating human friendly query descriptions"
  (:require [clojure.string :as str]
            [metabase.models
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]]
            [metabase.util.i18n :as ui18n :refer [deferred-trs]]))

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
  (let [elem (first filters)]
    (cond
      (or (= :and elem)
          (= :or elem)) (map #(get-filter-clause-description metadata %) (drop 1 filters))

      (= :segment elem) {:segment (let [segment (Segment (second elem))]
                                    (if segment
                                      (:name segment)
                                      (deferred-trs "[Unknown Segment]")))}

      :else {:field (:display_name (Field (second (second filters))))})))

(defn- get-filter-description
  [metadata query]
  (when-let [filters (:filter query)]
    {:filter (get-filter-clause-description metadata [:and filters])}))

(defn- get-order-by-description
  [metadata query]
  (when-let [order-by (:order-by query)]
    (:order-by (map (fn [[direction field]]
                      {(:display_name (Field (second field))) direction}) order-by))))

(defn- get-limit-description
  [metadata query]
  (when-let [limit (:limit query)]
    {:limit limit}))

(def ^:private query-descriptor-functions
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
  (apply merge
         (map (fn [f] (f metadata query))
              query-descriptor-functions)))
