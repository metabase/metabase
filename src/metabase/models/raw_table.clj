(ns metabase.models.raw-table
  (:require [korma.core :as k]
            [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.models.raw-column :refer [RawColumn], :as raw-column]
            [metabase.util :as u]))


(i/defentity RawTable :raw_table)

(defn- pre-insert [table]
  (let [defaults {:details {}}]
    (merge defaults table)))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete RawColumn :raw_table_id id))

(u/strict-extend (class RawTable)
  i/IEntity (merge i/IEntityDefaults
                   {:types              (constantly {:details :json, :fks :json})
                    :timestamped?       (constantly true)
                    :pre-insert         pre-insert
                    :pre-cascade-delete pre-cascade-delete}))


;;; ## ---------------------------------------- PERSISTENCE FUNCTIONS ----------------------------------------


(defn ^:hydrate columns
  "Return the `RawColumns` belonging to RAW-TABLE."
  [{:keys [id]}]
  (db/sel :many RawColumn :raw_table_id id, (k/order :name :ASC)))


(defn create-raw-table
  "Create a new `RawTable`, includes saving all specified `:columns`."
  [database-id {table-name :name, table-schema :schema, :keys [details columns fks]}]
  {:pre [(integer? database-id)
         (string? table-name)]}
  (let [table (db/ins RawTable
                :database_id  database-id
                :schema       table-schema
                :name         table-name
                :details      (or details {})
                :fks          fks
                :active       true)]
    ;; save columns
    (raw-column/save-all-table-columns table columns)))

(defn update-raw-table
  "Update an existing `RawTable`, includes saving all specified `:columns`."
  [{table-id :id, :as table} {table-name :name, table-schema :schema, :keys [details columns fks]}]
  (db/upd RawTable table-id
    :schema   table-schema
    :name     table-name
    :details  (or details {})
    :fks      fks
    :active   true)
  ;; save columns
  (raw-column/save-all-table-columns table columns))

(defn disable-raw-tables
  "Disable a list of `RawTable` ids, including all `RawColumns` associated with those tables."
  [table-ids]
  {:pre [(coll? table-ids)
         (every? integer? table-ids)]}
  (let [table-ids (filter identity table-ids)]
    ;; disable the tables
    (k/update RawTable
      (k/where {:id [in table-ids]})
      (k/set-fields {:active false}))
    ;; whenever a table is disabled we need to disable all of its fields too
    (k/update RawColumn
      (k/where {:raw_table_id [in table-ids]})
      (k/set-fields {:active false}))))
