(ns metabase.warehouse-schema.recent-views
  "The recent views of Tables."
  (:require
   [metabase.models.interface :as mi]))

(set! *warn-on-reflection* true)

(defn render
  "The recent view item of the loaded `table`, or nil when it must not be shown."
  [table {:keys [model_id timestamp]}]
  (when (and (not= "hidden" (:visibility_type table))
             (:database-name table)
             (:active table)
             (mi/can-read? table))
    {:id            model_id
     :name          (:name table)
     :description   (:description table)
     :model         :table
     :display_name  (:display_name table)
     :can_write     (mi/can-write? table)
     :timestamp     (str timestamp)
     :table_schema  (:schema table)
     :database      {:id                  (:db_id table)
                     :name                (:database-name table)
                     :initial_sync_status (:initial-sync-status table)}}))
