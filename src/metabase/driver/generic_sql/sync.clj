(ns metabase.driver.generic-sql.sync
  "Generic implementations of `metabase.driver.sync` functions that should work across any SQL database supported by Korma."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.generic-sql.util :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])))


(defn table-names
  "Fetch a list of table names for DATABASE."
  [database]
  (with-jdbc-metadata database
    (fn [md] (->> (-> md
                    (.getTables nil nil nil (into-array String ["TABLE"])) ; ResultSet getTables(String catalog, String schemaPattern, String tableNamePattern, String[] types)
                    jdbc/result-set-seq)
               (mapv :table_name)))))

(defn korma-count [{:keys [korma-entity]}]
  (-> @korma-entity
    (select (aggregate (count :*) :count))
    first
    :count))

(defn jdbc-columns
  "Fetch information about the various columns for Table with TABLE-NAME by getting JDBC metadata for DATABASE."
  [database table-name]
  (with-jdbc-metadata database
    (fn [md] (->> (-> md
                    (.getColumns nil nil table-name nil) ; ResultSet getColumns(String catalog, String schemaPattern, String tableNamePattern, String columnNamePattern)
                    jdbc/result-set-seq)
               (mapv #(select-keys % [:column_name :type_name]))))))


;;;; ===============


(defn get-table-row-count
  "Get the number of rows in TABLE."
  [table]
  (-> (korma-entity table)
      (select (aggregate (count :*) :count))
      first
      :count))

(defn update-table-row-count
  "Update the `:rows` column for TABLE with the count from `get-table-row-count`."
  [{:keys [id] :as table}]
  {:pre [(integer? id)]}
  (let [new-count (get-table-row-count table)]
    (upd Table id :rows new-count)))

(def ^:dynamic *column->base-type*
  "COLUMN->BASE-TYPE should be a map of column types returned by the DB to Field base types."
  {})

(defn sync-fields
  "Sync `Fields` for TABLE. "
  [{:keys [id name db] :as table}]
  (dorun (map (fn [{:keys [type_name column_name]}]
                (or (exists? Field :table_id id :name column_name)
                    (ins Field
                      :table_id id
                      :name column_name
                      :base_type (or (*column->base-type* (keyword type_name))
                                     (throw (Exception. (str "Column '" column_name "' has an unknown type: '" type_name
                                                             "'. Please add the type mapping to corresponding driver (e.g. metabase.driver.postgres.sync).")))))))
              (jdbc-columns db name))))                     ; TODO - more fixing.  reuse database connections.

(defn sync-tables
  [{:keys [id] :as database}]
  (with-jdbc-metadata database ; with-jdbc-metadata reuses *jdbc-metadata* in any call to it inside the fn passed to it
    (fn [_]                     ; by wrapping the entire sync operation in this we can reuse the same connection throughout
      (->> (table-names database)                           ; TODO - fix this.  used to reuse db connection
        (pmap (fn [table-name]
                (binding [*entity-overrides* {:transforms [#(assoc % :db (delay database))]}] ; add a korma transform to Table that will assoc :db on results.
                  (let [table (or (sel :one Table :db_id id :name table-name)                 ; Table's post-select only sets :db if it's not already set.
                                (ins Table                                                    ; This way, we can reuse a single `database` instead of creating
                                  :db_id id                                                   ; a few dozen duplicate instances of it.
                                  :name table-name                                            ; We can re-use one korma connection pool instead of
                                  :active true))]                                             ; creating dozens of them, which was causing issues with too
                    (update-table-row-count table)                                            ; many open connections.
                    (sync-fields table)
                    (log/debug "Synced" table-name)))))
        dorun))))
