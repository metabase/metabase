(ns metabase.models.table
  (:require [clojure.java.jdbc :as jdbc]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database with-jdbc-metadata]]
                             [field :refer [Field]])
            [metabase.util :as util]))

(defentity Table
  (table :metabase_table))

(defn jdbc-columns
  "Fetch information about the various columns for Table with TABLE-NAME by getting JDBC metadata for DATABASE."
  [database table-name]
  (with-jdbc-metadata database
    (fn [md] (->> (-> md
                     (.getColumns nil nil table-name nil) ; ResultSet getColumns(String catalog, String schemaPattern, String tableNamePattern, String columnNamePattern)
                     jdbc/result-set-seq)
                 (mapv #(select-keys % [:column_name :type_name]))))))

(defmethod post-select Table [_ {:keys [id db_id name] :as table}]
  (util/assoc* table
               :db (sel-fn :one Database :id db_id)
               :fields (sel-fn :many Field :table_id id)
               :jdbc-columns (delay (jdbc-columns ((:db <>)) name))
               :can_read (delay @(:can_read ((:db <>))))
               :can_write (delay @(:can_write ((:db <>))))))

(defmethod pre-insert Table [_ table]
  (assoc table
         :created_at (util/new-sql-date)
         :updated_at (util/new-sql-date)))
