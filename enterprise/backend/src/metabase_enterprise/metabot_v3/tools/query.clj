(ns metabase-enterprise.metabot-v3.tools.query
  (:require
    [metabase.lib.core :as lib]
    [metabase.lib.metadata.jvm :as lib.metadata.jvm]))

(defn column-id
  "Column id."
  [column]
  (or (:lib/desired-column-alias column)
      (:name column)))

(defn column-info
  "Column id and name."
  [query column]
  {:id (column-id column)
   :name (-> (lib/display-info query column) :long-display-name)})

(defn operator-name
  "Operator name."
  [operator]
  (-> operator :short name))

(defn source-query
  "Query that metabot works with."
  [dataset_query]
  (-> (lib.metadata.jvm/application-database-metadata-provider (:database dataset_query))
      (lib/query dataset_query)))
