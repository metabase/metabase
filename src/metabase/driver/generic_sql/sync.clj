(ns metabase.driver.generic-sql.sync
  "Generic implementations of `metabase.driver.sync` functions that should work across any SQL database supported by Korma."
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [database :refer [with-jdbc-metadata]]
                             [field :refer [Field]]
                             [table :refer [Table]])))

(defn get-table-row-count
  "Get the number of rows in TABLE."
  [{:keys [korma-entity]}]
  (-> @korma-entity
      (select (aggregate (count :*) :count))
      first
      :count))

(defn update-table-row-count
  "Update the `:rows` column for TABLE with the count from `get-table-row-count`."
  [table]
  (let [new-count (get-table-row-count table)]
    (upd Table (:id table) :rows new-count)))

(def ^:dynamic *column->base-type*
  "COLUMN->BASE-TYPE should be a map of column types returned by the DB to Field base types."
  {})

(defn sync-fields
  "Sync `Fields` for TABLE. "
  [{:keys [id jdbc-columns] :as table}]
  (dorun (map (fn [{:keys [type_name column_name]}]
                (or (exists? Field :table_id id :name column_name)
                    (ins Field
                      :table_id id
                      :name column_name
                      :base_type (or (*column->base-type* (keyword type_name))
                                     (throw (Exception. (str "Column '" column_name "' has an unknown type: '" type_name
                                                             "'. Please add the type mapping to corresponding driver (e.g. metabase.driver.postgres.sync).")))))))
              @jdbc-columns)))

(defn sync-tables
  [{:keys [id table-names] :as database}]
  (binding [*log-db-calls* false]
    (with-jdbc-metadata database ; with-jdbc-metadata reuses *jdbc-metadata* in any call to it inside the fn passed to it
      (fn [_]                     ; by wrapping the entire sync operation in this we can reuse the same connection throughout
        (->> @table-names
             (pmap (fn [table-name]
                     (binding [*entity-overrides* {:transforms [#(assoc % :db (constantly database))]}] ; add a korma transform to Table that will assoc :db on results.
                       (let [table (or (sel :one Table :db_id id :name table-name)                      ; Table's post-select only sets :db if it's not already set.
                                       (ins Table                                                       ; This way, we can reuse a single `database` instead of creating
                                            :db_id id                                                   ; a few dozen duplicate instances of it.
                                            :name table-name                                            ; We can re-use one korma connection pool instead of
                                            :active true))]                                             ; creating dozens of them, which was causing issues with too
                         (update-table-row-count table)                                                 ; many open connections.
                         (sync-fields table)
                         (println "Synced" table-name)))))
             dorun)))))
