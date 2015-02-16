(ns metabase.query-processor.processor
  (:require [metabase.db :refer [sel]]
            [metabase.models.database :refer [Database]]
            [metabase.models.table :refer [Table]]))

(declare process-query)

(defn process
  "Given a QUERY dict return SQL."
  [{:keys [type] :as query}]
  (case (keyword type)
    :query (process-query (:query query))))

(defn process-and-run [{:keys [database] :as query}]
  (let [sql (process query)
        db (sel :one Database :id database)]
    ()))

(defn process-query
  "Process a query of type `query`."
  [{:keys [source_table] :as query}]
  (println "SOURCE TABLE: " source_table)
  (let [table (sel :one Table :id source_table)]
    (format (str "SELECT *"
                 "FROM \"%s\";")
            (:name table))))

(process {:type "query"
          :database 5
          :query {:filter [nil
                           nil]
                  :source_table 224
                  :breakout nil
                  :limit nil
                  :aggregation ["count"]}})
