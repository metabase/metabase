(ns metabase.api.query-description
  "Functions for generating human friendly query descriptions"
  (:require [clojure.tools.logging :as log]
            [metabase.models.field :refer [Field]]
            [metabase.util.i18n :as ui18n :refer [deferred-trs]]
            [clojure.string :as str]))

(defn- get-table-description
  [metadata query & options]
  {:table (:display_name metadata)})

(defn- format-expression
  [metadata expr]
  "")

(defn- get-aggregation-description
  [metadata query & options]
  ;; TODO: handle deprecated / unknown metrics
  (when-let [aggregations (:aggregation query)]
    {:aggregations
     (map
      (fn [aggregation]
        (let [field-name (fn [a] (:display_name (Field (second (second a)))))]
          (case (first aggregation)
            :rows (deferred-trs "Raw data")
            :count (deferred-trs "Count")
            :cum-count (deferred-trs "Cumulative count")
            :avg (deferred-trs "Average of {0}" (field-name aggregation))
            :distinct (deferred-trs "Distinct values of {0}" (field-name aggregation))
            :stddev (deferred-trs "Standard deviation of {0}" (field-name aggregation))
            :sum (deferred-trs "Sum of {0}" (field-name aggregation))
            :cum-sum (deferred-trs "Cumulative sum of {0}" (field-name aggregation))
            :max (deferred-trs "Maximum of {0}" (field-name aggregation))
            :min (deferred-trs "minimum of {0}" (field-name aggregation))
            (format-expression metadata aggregation))))
      aggregations)}))

(defn- get-breakout-description
  [metadata query & options]
  (when-let [breakouts (seq (:breakout query))]
    {:breakouts (deferred-trs
                  "Grouped by {0}"
                  (str/join (deferred-trs " and, ") (map #(:display_name (Field %)) breakouts)))}))

(defn- get-filter-clause-description
  [metadata filters]
  "")

(defn- get-filter-description
  [metadata query & options]
  (when-let [filters (:filter query)]
    {:filters (deferred-trs
                "Filtered by {0}"
                (get-filter-clause-description metadata (cons :and filters)))}))

(defn- get-order-by-description
  [metadata query & options]
  {})

(defn- get-limit-description
  [metadata query & options]
  {})

(def query-descriptor-functions
  [get-table-description
   get-aggregation-description
   get-breakout-description
   get-filter-description
   get-order-by-description
   get-limit-description])

(defn generate-query-description
  "Generate a localized description of a given query.

  Examples:

  Filtered by Total
  Filtered by Created At"
  [metadata query & options]
  (log/spy :error query)
  (log/spy :error
           (apply merge
                  (map (fn [f] (f metadata query options))
                       query-descriptor-functions))))
