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

(defn sync-tables
  "Fetch the table names for DATABASE and create corresponding `Tables` if they don't already exist.
   (This is executed in parallel.)"
  [{:keys [id table-names] :as database}]
  (binding [*log-db-calls* false]
    (dorun (pmap (fn [table-name]
                   (let [table (or (sel :one Table :db_id id :name table-name)
                                   (ins Table
                                        :db_id id
                                        :name table-name
                                        :active true))]
                     (sync-fields table)))
                 @table-names))))

(defn sync-fields
  "Sync `Fields` for TABLE."
  [{:keys [id jdbc-columns] :as table}]
  (dorun (map (fn [{:keys [type_name column_name]}]
                (or (exists? Field :table_id id :name column_name)
                    (ins Field
                         :table_id id
                         :name column_name
                         :base_type (or (column->base-type (keyword type_name))
                                        (do (print "COL NAME:" column_name)
                                            (throw (Exception. (str "Unknown type: " type_name ". Please add the type mapping to metabase.driver.postgres.sync."))))))))
              @jdbc-columns)))
