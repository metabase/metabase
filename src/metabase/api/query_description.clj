(ns metabase.api.query-description
  "Functions for generating human friendly query descriptions"
  (:require [clojure.string :as str]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]]
            [metabase.util.i18n :as ui18n :refer [deferred-tru]]))

(defn- get-table-description
  [metadata query]
  {:table (:display_name metadata)})

(defn- get-aggregation-description
  [metadata query]
  (let [field-name (fn [match] (:display_name (Field (mbql.u/field-clause->id-or-literal match))))]
    (when-let [agg-matches (mbql.u/match query
                             [:metric arg]    {:type :metric
                                               :arg (let [metric (Metric arg)]
                                                      (if (not (str/blank? (:name metric)))
                                                        (:name metric)
                                                        (deferred-tru "[Unknown Metric]")))}
                             [:rows]          {:type :rows}
                             [:count]         {:type :count}
                             [:cum-count]     {:type :cum-count}
                             [:avg arg]       {:type :avg :arg (field-name arg)}
                             [:distinct arg]  {:type :distinct :arg (field-name arg)}
                             [:stddev arg]    {:type :stddev :arg (field-name arg)}
                             [:sum arg]       {:type :sum :arg (field-name arg)}
                             [:cum-sum arg]   {:type :cum-sum :arg (field-name arg)}
                             [:max arg]       {:type :max :arg (field-name arg)}
                             [:min arg]       {:type :min :arg (field-name arg)})]
      {:aggregation agg-matches})))

(defn- get-breakout-description
  [metadata query]
  (when-let [breakouts (seq (:breakout query))]
    {:breakout (map #(:display_name (Field %)) breakouts)}))

(defn- get-filter-clause-description
  [metadata filt]
  (let [typ (first filt)]
    (cond
      (or (= :field-id typ)
          (= :field-literal typ)) {:field (:display_name (Field (mbql.u/field-clause->id-or-literal filt)))}

      (= :segment typ) {:segment (let [segment (Segment (second filt))]
                                   (if segment
                                     (:name segment)
                                     (deferred-tru "[Unknown Segment]")))}

      :else nil)))

(defn- get-filter-description
  [metadata query]
  (when-let [filters (:filter query)]
    {:filter (map #(get-filter-clause-description metadata %)
                  (mbql.u/match filters #{:field-id :field-literal :segment} &match))}))

(defn- get-order-by-description
  [metadata query]
  (when-let [order-by (:order-by query)]
    {:order-by (map (fn [[direction field]]
                      {:field (:display_name (Field (mbql.u/field-clause->id-or-literal field))) :direction direction})
                    (mbql.u/match query #{:asc :desc} &match))}))

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
