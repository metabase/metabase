(ns metabase-enterprise.metabot-v3.tools.query
  (:require
    [metabase.lib.core :as lib]
    [metabase.lib.metadata :as lib.metadata]
    [metabase.lib.metadata.jvm :as lib.metadata.jvm]))

(defn column-id
  "Column id."
  [column]
  (or (:lib/desired-column-alias column)
      (:name column)))

(defn column-info
  "Column info."
  [query column]
  {:id (column-id column)
   :name (-> (lib/display-info query column) :long-display-name)})

(defn source-query
  "Creates a query based on the provided data `source`."
  [source]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database_id source))
        table-or-card     (condp = (-> source :type keyword)
                                 :table (lib.metadata/table metadata-provider (:id source))
                                 :card  (lib.metadata/card metadata-provider (:id source)))]
    (lib/query metadata-provider table-or-card)))
