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
       {:filters      (mapv #(lib/display-name query %) (lib/filters query))
        :aggregations (mapv #(lib/display-name query %) (lib/aggregations query))
        :breakouts    (mapv #(lib/display-name query %) (lib/breakouts query))
        :order_bys    (mapv #(lib/display-name query %) (lib/order-bys query))
        :limit        (lib/current-limit query)}
       :query_columns (mapv #(column-info query %)
                            (lib/visible-columns query))})))
