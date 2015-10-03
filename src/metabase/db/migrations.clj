(ns metabase.db.migrations
  (:require [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [database :refer [Database]]
                             [setting :as setting])
            [metabase.sample-data :as sample-data]))

(defn- set-card-database-and-table-ids
  "Upgrade for the `Card` model when `:database_id`, `:table_id`, and `:query_type` were added and needed populating.

   This reads through all saved cards, extracts the JSON from the `:dataset_query`, and tries to populate
   the values for `:database_id`, `:table_id`, and `:query_type` if possible."
  []
  ;; only execute when `:database_id` column on all cards is `nil`
  (when (= 0 (:cnt (first (k/select Card (k/aggregate (count :*) :cnt) (k/where (not= :database_id nil))))))
    (log/info "Data migration: Setting database/table/type fields on all Cards.")
    (doseq [{id :id {:keys [type] :as dataset-query} :dataset_query} (db/sel :many [Card :id :dataset_query])]
      (when type
        ;; simply resave the card with the dataset query which will automatically set the database, table, and type
        (db/upd Card id :dataset_query dataset-query)))))

(defn run-all
  "Run all coded data migrations."
  []
  ;; Append to the bottom of this list so that these run in chronological order
  (set-card-database-and-table-ids))
