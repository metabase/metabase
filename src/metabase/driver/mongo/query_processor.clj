(ns metabase.driver.mongo.query-processor
  (:refer-clojure :exclude [find sort])
  (:require (monger [core :as mg]
                    [db :as mdb]
                    [query :refer :all])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.mongo.util :refer [with-db-connection]]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])))

(defn fetch-results
  {:arglists '([database collection-name])}
  [{{connection-string :conn_str} :details} collection-name]
  (with-db-connection [db connection-string]
    (doall (with-collection db collection-name
             (find {})
             (limit 20)))))

(defmethod driver/process-and-run :mongo [{{:keys [source_table] :as query} :query}]
  (let [{table-name :name :as table} (sel :one Table :id source_table)
        db @(:db table)
        field-name->id (sel :many :field->id [Field :name] :table_id source_table)
        results (fetch-results db table-name)
        column-names (keys (first results))]
    {:row_count (count results)
     :status :completed
     :data {:columns column-names
            :cols (map (fn [column-name]
                         {:name column-name
                          :id (field-name->id (name column-name))
                          :table_id source_table
                          :description nil
                          :base_type :UnknownField
                          :special_type nil
                          :extra_info {}})
                       column-names)
            :rows (map #(map % column-names)
                       results)}}))
