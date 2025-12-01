(ns dev.usage-analytics
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.app-db.env :as mdb.env]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;;; ============================================================================
;;; Database Management
;;; ============================================================================

(defn- get-app-db-type
  "Get the type of the application database."
  []
  (mdb/db-type))

(defn- get-app-db-connection-details
  "Get the application database connection details including password.

  Returns a map suitable for creating a Metabase Database entry.
  Uses the same connection details as the app DB (from environment variables)."
  []
  (let [db-type (get-app-db-type)]
    (@#'mdb.env/broken-out-details db-type mdb.env/env)))

(def ^:private dev-db-name "Analytics Development DB")

(defn find-analytics-dev-database
  "Finds existing analytics dev database."
  []
  (t2/select-one :model/Database :name dev-db-name))

(defn create-analytics-dev-database!
  "Creates a Database entry pointing to the app database for analytics development.

  The database:
  - Points to the same database as the app DB
  - Named 'Analytics Development DB'
  - Not marked as is_audit (gets normal permissions, is editable)

  Returns the created database map."
  [user-id]
  (let [db-type (get-app-db-type)]
    (if-let [existing (find-analytics-dev-database)]
      (do
        (log/info "Analytics dev database already exists:" (:id existing))
        existing)
      (let [db-details (get-app-db-connection-details)
            db (t2/insert-returning-instance! :model/Database
                                              {:name dev-db-name
                                               :description "Development database for analytics views and content"
                                               :engine (name db-type)
                                               :details db-details
                                               :is_audit false ; Important: not an audit DB
                                               :is_full_sync true
                                               :is_on_demand false
                                               :creator_id user-id
                                               :auto_run_queries true})]
        (log/info "Created analytics dev database:" (:id db))
        (sync/analyze-db! db)
        db))))

(defn delete-analytics-dev-database!
  "Deletes the analytics dev database and all related metadata."
  [db-id]
  (log/info "Deleting analytics dev database:" db-id)
  (t2/delete! :model/Database :id db-id)
  (log/info "Deleted analytics dev database"))
