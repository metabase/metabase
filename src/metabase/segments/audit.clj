(ns metabase.segments.audit
  "What the audit spec of a Segment needs beyond its columns."
  (:require
   [metabase.segments.db :as segments.db]))

(set! *warn-on-reflection* true)

(defn details
  "The details to store for the Segment `row`: its Table, the Database of the Table, and the message of its revision."
  [{:keys [table_id] :as row} _event]
  (cond-> {:table_id    table_id
           :database_id (when table_id
                          (:db_id (segments.db/table table_id)))}
    (contains? row :revision_message) (assoc :revision_message (:revision_message row))))
