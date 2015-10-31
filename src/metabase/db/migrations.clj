(ns metabase.db.migrations
  "Clojure-land data migration definitions and fns for running them."
  (:require [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [database :refer [Database]]
                             [setting :as setting])
            [metabase.sample-data :as sample-data]
            [metabase.util :as u]))

;;; # Migration Helpers

(defn- migration-ran? [migration-name]
  (-> (k/select :data_migrations
                (k/aggregate (count :*) :count)
                (k/where {:id (name migration-name)}))
      first :count (> 0)))

(defn- run-migration-if-needed
  "Run migration defined by MIGRATION-VAR if needed.

     (run-migration-if-needed #'set-card-database-and-table-ids)"
  [migration-var]
  (let [migration-name (name (:name (meta migration-var)))]
    (when-not (migration-ran? migration-name)
      (log/info (format "Running data migration '%s'..." migration-name))
      (@migration-var)
      (k/insert "data_migrations"
                (k/values {:id        migration-name
                           :timestamp (u/new-sql-timestamp)}))
      (log/info "[ok]"))))

(def ^:private data-migrations (atom []))

(defmacro ^:private defmigration
  "Define a new data migration. This is just a simple wrapper around `defn-` that adds the resulting var to that `data-migrations` atom."
  [migration-name & body]
  `(do (defn- ~migration-name [] ~@body)
       (swap! data-migrations conj #'~migration-name)))

(defn run-all
  "Run all data migrations defined by `defmigration`."
  []
  (dorun (map run-migration-if-needed @data-migrations)))


;;; # Migration Definitions

;; Upgrade for the `Card` model when `:database_id`, `:table_id`, and `:query_type` were added and needed populating.
;;
;; This reads through all saved cards, extracts the JSON from the `:dataset_query`, and tries to populate
;; the values for `:database_id`, `:table_id`, and `:query_type` if possible.
(defmigration set-card-database-and-table-ids
  ;; only execute when `:database_id` column on all cards is `nil`
  (when (= 0 (:cnt (first (k/select Card (k/aggregate (count :*) :cnt) (k/where (not= :database_id nil))))))
    (doseq [{id :id {:keys [type] :as dataset-query} :dataset_query} (db/sel :many [Card :id :dataset_query])]
      (when type
        ;; simply resave the card with the dataset query which will automatically set the database, table, and type
        (db/upd Card id :dataset_query dataset-query)))))


;; Set the `:ssl` key in `details` to `false` for all existing MongoDB `Databases`.
;; UI was automatically setting `:ssl` to `true` for every database added as part of the auto-SSL detection.
;; Since Mongo did *not* support SSL, all existing Mongo DBs should actually have this key set to `false`.
(defmigration set-mongodb-databases-ssl-false
  (doseq [{:keys [id details]} (db/sel :many :fields [Database :id :details] :engine "mongo")]
    (db/upd Database id, :details (assoc details :ssl false))))
