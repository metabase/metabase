(ns metabase-enterprise.metabot-v3.tools.query
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.types.isa :as lib.types.isa]))

(defn column-id
  "Query column id."
  [column]
  (or (:lib/desired-column-alias column)
      (:name column)))

(defn column-info
  "Query column id, name, type."
  [query column]
  {:id (column-id column)
   :name (-> (lib/display-info query column) :long-display-name)
   :type (cond
           (lib.types.isa/boolean? column) :boolean
           (lib.types.isa/date-or-datetime? column) :date
           (lib.types.isa/numeric? column) :number
           (lib.types.isa/string-or-string-like? column) :string
           :else :unknown)})

(defn clause-info
  "Query clause info."
  [query clause index]
  {:id index
   :name (lib/display-name query clause)})

(defn operator-name
  "Query operator name."
  [operator]
  (-> operator :short name))

(defn source-query
  "Query that metabot works with."
  [dataset-query]
  (-> (lib.metadata.jvm/application-database-metadata-provider (:database dataset-query))
      (lib/query dataset-query)))

(defn query-context
  "Context for query tools."
  [dataset-query]
  (when dataset-query
    (let [query (source-query dataset-query)]
      {:query
       {:filters      (into []
                            (map-indexed (fn [i clause] (clause-info query clause i)))
                            (lib/filters query))
        :aggregations (into []
                            (map-indexed (fn [i clause] (clause-info query clause i)))
                            (lib/aggregations query))
        :breakouts    (into []
                            (map-indexed (fn [i clause] (clause-info query clause i)))
                            (lib/breakouts query))
        :order_bys    (into []
                            (map-indexed (fn [i clause] (clause-info query clause i)))
                            (lib/order-bys query))
        :limit        (lib/current-limit query)}
       :query_columns (mapv #(column-info query %)
                            (lib/visible-columns query))})))
