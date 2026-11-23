(ns metabase.segments.audit
  "What the audit spec of a Segment needs beyond its columns."
  (:require
   [metabase.segments.db :as segments.db]))

(set! *warn-on-reflection* true)

(defn hydrate
  "The Segment `rows` with the Database of the Table of each as `::database-id`, loaded together."
  [rows]
  (let [database-ids (if-let [table-ids (not-empty (into [] (comp (keep :table_id) (distinct)) rows))]
                       (segments.db/table-database-ids table-ids)
                       {})]
    (mapv #(assoc % ::database-id (get database-ids (:table_id %))) rows)))

(defn details
  "The details to store for the Segment `row`: its Table, the Database of the Table, and the message of its revision."
  [{:keys [table_id] :as row} _event]
  (cond-> {:table_id    table_id
           :database_id (when table_id
                          (::database-id row))}
    (contains? row :revision_message) (assoc :revision_message (:revision_message row))))
