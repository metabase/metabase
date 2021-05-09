(ns metabase.api.query-description
  "Functions for generating human friendly query descriptions"
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.mbql.predicates :as mbql.preds]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.segment :refer [Segment]]
            [metabase.util.i18n :as ui18n :refer [deferred-tru]]
            [toucan.db :as db]))

(defn- get-table-description
  [metadata query]
  {:table (:display_name metadata)})

(defn- field-clause->display-name [clause]
  (mbql.u/match-one clause
    [:field (id :guard integer?) _]
    (db/select-one-field :display_name Field :id id)

    [:field (field-name :guard string?) _]
    field-name))

(defn- get-aggregation-details
  [metadata query]
  (letfn [(field-name [match] (or (when (mbql.preds/Field? match)
                                    (field-clause->display-name match))
                                  (flatten (get-aggregation-details metadata match))))]
    (when-let [agg-matches (mbql.u/match query
                             [:aggregation-options _ (options :guard :display-name)]
                             {:type :aggregation :arg (:display-name options)}

                             [:aggregation-options ag _]
                             (recur ag)

                             [(operator :guard #{:+ :- :/ :*}) & args]
                             (interpose (name operator) (map field-name args))

                             [:metric (arg :guard integer?)]
                             {:type :metric
                              :arg  (let [metric-name (db/select-one-field :name Metric :id arg)]
                                      (if-not (str/blank? metric-name)
                                        metric-name
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
      agg-matches)))

(defn- get-aggregation-description
  [metadata query]
  (when-let [details (get-aggregation-details metadata query)]
    {:aggregation details}))

(defn- get-breakout-description
  [metadata query]
  (when-let [breakouts (seq (:breakout query))]
    {:breakout (map #(db/select-one-field :display_name Field :id %) breakouts)}))

(defn- get-filter-clause-description
  [metadata filt]
  (let [typ (first filt)]
    (condp = typ
      :field   {:field (field-clause->display-name filt)}
      :segment {:segment (let [segment (Segment (second filt))]
                           (if segment
                             (:name segment)
                             (deferred-tru "[Unknown Segment]")))}
      nil)))

(defn- get-filter-description
  [metadata query]
  (when-let [filters (:filter query)]
    {:filter (map #(get-filter-clause-description metadata %)
                  (mbql.u/match filters #{:field :segment} &match))}))

(defn- get-order-by-description
  [metadata query]
  (when-let [order-by (:order-by query)]
    {:order-by (map (fn [[direction field]]
                      {:field     (field-clause->display-name field)
                       :direction direction})
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
  (try
    (apply merge
           (map (fn [f] (f metadata query))
                query-descriptor-functions))
    (catch Exception e
      (log/warn e "Error generating query description")
      {})))
