(ns metabase.driver.generic-sql.sync
  "Generic implementations of `metabase.driver.sync` functions that should work across any SQL database supported by Korma."
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])))

(defn get-table-row-count
  "Get the number of rows in TABLE."
  [{:keys [korma-entity]}]
  (-> @korma-entity
      (select (aggregate (count :*) :count))
      first
      count))

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
    (->> (doall @table-names)
         (pmap (fn [table-name]
                 (let [table (or (sel :one Table :db_id id :name table-name)
                                 (ins Table
                                   :db_id id
                                   :name table-name
                                   :active true))]
                   (update-table-row-count table)
                   (sync-fields table)
                   (println table-name))))
         dorun)))
