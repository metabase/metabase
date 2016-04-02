(ns metabase.models.raw-column
  (:require [clojure.tools.logging :as log]
            [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.util :as u]))


(i/defentity RawColumn :raw_column)

(defn- pre-insert [table]
  (let [defaults {:active  true
                  :is_pk   false
                  :details {}}]
    (merge defaults table)))


(u/strict-extend (class RawColumn)
  i/IEntity (merge i/IEntityDefaults
                   {:hydration-keys     (constantly [:columns])
                    :types              (constantly {:base_type :keyword, :details :json})
                    :timestamped?       (constantly true)
                    :pre-insert         pre-insert}))


;;; ## ---------------------------------------- PERSISTENCE FUNCTIONS ----------------------------------------


(defn save-all-table-columns
  "Save *all* `RawColumns` for a given RAW-TABLE."
  [{:keys [id]} columns]
  {:pre [(integer? id)
         (coll? columns)
         (every? map? columns)]}
  (let [existing-columns (into {} (for [{:keys [name] :as column} (db/sel :many :fields [RawColumn :id :name] :raw_table_id id)]
                                    {name column}))]

    ;; deactivate any columns which were removed
    (doseq [[column-name {column-id :id}] (sort-by :name existing-columns)]
      (when-not (some #(= column-name (:name %)) columns)
        (log/debug (u/format-color 'cyan "Marked column %s as inactive." column-name))
        (db/upd RawColumn column-id :active false)))

    ;; insert or update the remaining columns
    (doseq [{column-name :name, :keys [base-type pk? special-type details]} (sort-by :name columns)]
      (let [details (merge (or details {})
                           (when special-type {:special-type special-type}))
            is_pk   (true? pk?)]
        (if-let [{column-id :id} (get existing-columns column-name)]
          ;; column already exists, update it
          (db/upd RawColumn column-id
            :name      column-name
            :base_type base-type
            :is_pk     is_pk
            :details   details
            :active    true)
          ;; must be a new column, insert it
          (db/ins RawColumn
            :raw_table_id  id
            :name          column-name
            :base_type     base-type
            :is_pk         is_pk
            :details       details
            :active        true))))))
