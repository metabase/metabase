(ns metabase.sample-data.impl
  "Code related to adding the Sample Database on launch, or adding it back programmatically (used by the REST API).

   The sample database is hosted by an embedded Postgres instance managed
   in [[metabase.sample-data.embedded-postgres]]. We start that instance (or
   reuse a running one) and then upsert a `:model/Database` row whose
   `:details` point at the running server. The Postgres port is dynamic per
   JVM boot, so `update-sample-database-if-needed!` re-writes the details on
   every startup."
  (:require
   [metabase.sample-data.embedded-postgres :as embedded-postgres]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^String sample-database-name "Sample Database")

(defn- sample-db-details []
  (embedded-postgres/ensure-started!))

(defn extract-and-sync-sample-database!
  "Starts the embedded sample-data Postgres if needed, then adds or updates
   the corresponding `:model/Database` row and runs a sync against it."
  []
  (try
    (log/info "Loading sample database")
    (let [details (sample-db-details)
          db (if (t2/exists? :model/Database :is_sample true)
               (t2/select-one :model/Database
                              (first (t2/update-returning-pks! :model/Database
                                                               :is_sample true
                                                               {:details details})))
               (first (t2/insert-returning-instances! :model/Database
                                                      :name      sample-database-name
                                                      :details   details
                                                      :engine    :postgres
                                                      :is_sample true)))]
      (log/debug "Syncing Sample Database...")
      (sync/sync-database! db))
    (log/debug "Finished adding Sample Database.")
    (catch Throwable e
      (log/error e "Failed to load sample database"))))

(defn update-sample-database-if-needed!
  "Re-write the sample database's connection details if they no longer match
   the running embedded Postgres (always true on a fresh JVM boot, since the
   port is dynamic)."
  ([]
   (update-sample-database-if-needed! (t2/select-one :model/Database :is_sample true)))

  ([sample-db]
   (when sample-db
     (let [intended (sample-db-details)]
       (when (not= (:details sample-db) intended)
         (t2/update! :model/Database (:id sample-db) {:details intended}))))))
