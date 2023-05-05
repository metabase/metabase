(ns metabase-enterprise.audit-db
  "This is here so we can try to require it and see whether or not EE code is on the classpath."
  (:require [metabase.models.database :refer [Database]]
            [metabase.sync.schedules :as sync.schedules]
            [metabase.db.env :as mdb.env]
            [metabase.util :as u]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(defn- install-database!
  "Creates the audit db, a clone of the app db used for auditing purposes."
  [engine]
  (t2/insert! Database {:is_audit         true
                        :name             "Audit Database"
                        :description      "Internal Audit DB used to power metabase analytics."
                        :engine           engine
                        :is_full_sync     true
                        :is_on_demand     false
                        :creator_id       nil
                        :auto_run_queries true}))

(defn ensure-db-installed!
  "Called on app startup to ensure the existance of the audit db in enterprise apps."
  []
  (let [audit-db (t2/select-one Database :is_audit true)]
    (cond
      (nil? audit-db)
      (u/prog1 ::installed
        (log/info "Audit DB does not exist, Installing...")
        (install-database! mdb.env/db-type))

      (not= mdb.env/db-type (:engine audit-db))
      (u/prog1 ::updated
        (log/infof "Updating the Audit DB engine to %s." (name mdb.env/db-type))
        (t2/update! Database :is_audit true {:engine mdb.env/db-type})
        (ensure-db-installed!))

      :else
      :metabase-enterprise.audit-db/no-op)))
