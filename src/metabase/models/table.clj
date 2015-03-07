(ns metabase.models.table
  (:require [clojure.java.jdbc :as jdbc]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [database :as db]
                             [field :refer [Field]])
            [metabase.util :as util]))

(defentity Table
  (table :metabase_table))

(defn korma-entity
  "Return a Korma entity for TABLE.

    (-> (sel :one Table :id 100)
        korma-entity
        (select (aggregate (count :*) :count)))"
  [{:keys [name db]}]
  {:table name
   :pk :id
   :db @(:korma-db (db))})

(defn korma-count [{:keys [korma-entity]}]
  (-> @korma-entity
      (select (aggregate (count :*) :count))
      first
      :count))

(defn jdbc-columns
  "Fetch information about the various columns for Table with TABLE-NAME by getting JDBC metadata for DATABASE."
  [database table-name]
  (db/with-jdbc-metadata database
    (fn [md] (->> (-> md
                     (.getColumns nil nil table-name nil) ; ResultSet getColumns(String catalog, String schemaPattern, String tableNamePattern, String columnNamePattern)
                     jdbc/result-set-seq)
                 (mapv #(select-keys % [:column_name :type_name]))))))

(defmethod post-select Table [_ {:keys [id db db_id name] :as table}]
  (util/assoc* table
               :db (or db (sel-fn :one db/Database :id db_id))       ; Check to see if `:db` is already set. In some cases we add a korma transform fn to `Table`
               :fields (sel-fn :many Field :table_id id)             ; and assoc :db if the DB has already been fetched, so we can re-use its DB connections.
               :jdbc-columns (delay (jdbc-columns ((:db <>)) name))
               :can_read (delay @(:can_read ((:db <>))))
               :can_write (delay @(:can_write ((:db <>))))
               :korma-entity (delay (korma-entity <>))))

(defmethod pre-insert Table [_ table]
  (assoc table
         :created_at (util/new-sql-timestamp)
         :updated_at (util/new-sql-timestamp)))
