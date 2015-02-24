(ns metabase.driver.postgres.sync
  (:require [metabase.db :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]]
                             [database :refer [Database]])))

(def column->base-type
  "Map of Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  {:bool :BooleanField
   :date :DateField
   :float8 :FloatField
   :inet :TextField             ; This was `GenericIPAddressField` in some places in the Django code but not others ...
   :int2 :IntegerField
   :int4 :IntegerField
   :serial :IntegerField
   :text :TextField
   :timestamptz :DateTimeField
   :varchar :TextField})

(declare sync-fields)

(defn get-table-row-count
  "Get the number of rows in TABLE."
  [database table]
  (-> ((:native-query database) (format "SELECT COUNT(*) FROM \"%s\"" (:name table)))
      first
      :count))

(defn update-table-row-count
  "Update the `:rows` column for TABLE with the count from `get-table-row-count`."
  [database table]
  (let [new-count (get-table-row-count database table)]
    (upd Table (:id table) :rows new-count)))

(defn sync-tables
  "Fetch the table names for DATABASE and create corresponding `Tables` if they don't already exist.
   (This is executed in parallel.)"
  [{:keys [id table-names] :as database}]
  (binding [*log-db-calls* false]
    (->> (doall @table-names)                                                ; load the whole lazy seq of `table-names` before pmap generates futures
         (pmap (fn [table-name]
                 (let [table (or (sel :one Table :db_id id :name table-name)
                                 (ins Table
                                   :db_id id
                                   :name table-name
                                   :active true))]
                   (update-table-row-count database table)
                   (sync-fields table)
                   (println table-name))))
         dorun)))

(defn sync-fields
  "Sync `Fields` for TABLE."
  [{:keys [id jdbc-columns] :as table}]
  (dorun (map (fn [{:keys [type_name column_name]}]
                (or (exists? Field :table_id id :name column_name)
                    (ins Field
                         :table_id id
                         :name column_name
                         :base_type (or (column->base-type (keyword type_name))
                                        (throw (Exception. (str "Column " column_name "has an unknown type: " type_name
                                                                ". Please add the type mapping to metabase.driver.postgres.sync.")))))))
              @jdbc-columns)))
