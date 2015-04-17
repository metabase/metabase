(ns metabase.driver.sync
  "Generalized DB / Table syncing functions intended for use by specific driver implementations."
  (:require [clojure.tools.logging :as log]
            [metabase.db :refer :all]
            (metabase.models [field :refer [Field] :as field]
                             [table :refer [Table]])))

(defn sync-database-create-tables
  "Create new `Tables` for DATABASE + mark ones that no longer exist as inactive."
  {:arglists '([database active-table-names-set])}
  [{database-id :id} active-table-names]
  {:pre [(set? active-table-names)
         (every? string? active-table-names)]}
  (let [table-name->id (sel :many :field->id [Table :name] :db_id database-id)]
    (log/debug "Marking old Tables as inactive...")
    (dorun (map (fn [[table-name table-id]]
                  (when-not (contains? active-table-names table-name)
                    (upd Table table-id :active false)))
                table-name->id))
    (log/debug "Creating new Tables...")
    (dorun (map (fn [table-name]
                  (when-not (table-name->id table-name)
                    (ins Table
                      :db_id database-id
                      :name table-name
                      :active true)))
                active-table-names))))

(defn sync-active-tables
  "Run SYNC-TABLE-FNS against all the active Tables for DATABASE.
   Each function is ran in parallel against all active tables, and once it finishes, the next function is ran, etc."
  {:arglists '([database & sync-table-fns])}
  [{database-id :id :as database} & sync-table-fns]
  (let [tables (->> (sel :many Table :active true :db_id database-id)
                    (map #(assoc % :db (delay database))))] ; reuse DATABASE so we don't need to fetch it more than once
    (dorun (map (fn [sync-fn]
                  (dorun (pmap (fn [table]
                                 (try (sync-fn table)
                                      (catch Throwable e
                                        (log/error "Caught exception in sync-active-tables: " sync-fn ":" (.getMessage e)))))
                               tables)))
                sync-table-fns))))

(defn sync-table-create-fields
  "Create new `Fields` for TABLE as needed, and mark old ones as inactive.

    (sync-table-create-fields table {\"ID\" :IntegerField, \"Name\" :TextField, ...})"
  [{table-id :id :as table} active-field-name->base-type]
  {:pre [(map? active-field-name->base-type)
         (every? string? (keys active-field-name->base-type))
         (every? (partial contains? field/base-types) (vals active-field-name->base-type))]}
  (let [active-field-names (set (keys active-field-name->base-type))
        field-name->id (sel :many :field->id [Field :name] :table_id table-id)]
    ;; Mark old Fields as inactive
    (dorun (map (fn [[field-name field-id]]
                  (when-not (contains? active-field-names field-name)
                    (upd Field field-id :active false)))
                field-name->id))
    ;; Create new Fields as needed
    (dorun (map (fn [[field-name base-type]]
                  (when-not (field-name->id field-name)
                    (ins Field
                      :table_id table-id
                      :name field-name
                      :base_type base-type)))
                active-field-name->base-type))))
