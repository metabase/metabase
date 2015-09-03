(ns metabase.db.migrations
  (:require [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.models.card :refer [Card]]))

(defn- set-card-database-and-table-ids
  "Upgrade for the `Card` model when `:database_id` and `:table_id` were added and needed populating.

   This reads through all saved cards, extracts the JSON from the `:dataset_query`, and tries to populate
   the values for `:database_id` and `:table_id` if possible."
  []
  ;; only execute when `:database_id` column on all cards is `nil`
  (when (= 0 (:cnt (first (k/select Card (k/aggregate (count :*) :cnt) (k/where (not= :database_id nil))))))
    (log/info "Data migration: Setting database/table/type fields on all Cards.")
    (doseq [{id :id {{table :source_table} :query :keys [database type]} :dataset_query} (db/sel :many [Card :id :dataset_query])]
      (when type
        (db/upd Card id
          :query_type  type
          :database_id database
          :table_id    table)))))

(defn run-all
  "Run all coded data migrations."
  []
  ;; Append to the bottom of this list so that these run in chronological order
  (set-card-database-and-table-ids))
