(ns metabase-enterprise.audit-db
  (:require [clojure.java.io :as io]
            [internal-mb-user-id :as ee.internal-user]
            [metabase-enterprise.serialization.cmd :as serialization.cmd]
            [metabase.config :as config]
            [metabase.db.env :as mdb.env]
            [metabase.models.database :refer [Database]]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.util :as u]
            [metabase.util.files :as u.files]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-audit-db-id 13371337)

(defn- install-database!
  "Creates the audit db, a clone of the app db used for auditing purposes.

  - This uses a weird ID because some tests are hardcoded to look for database with ID = 2, and inserting an extra db
  throws that off since the IDs are sequential...

  - In the unlikely case that a user has many many databases in Metabase, and ensure there can Never be a collision, we
  do a quick check here and pick a new ID if it would have collided. Similar to finding an open port number."
  ([engine] (install-database! engine default-audit-db-id))
  ([engine id]
   (if (t2/select-one Database :id id)
     (install-database! engine (inc id))
     (do
       ;; guard against someone manually deleting the audit-db entry, but not removing the audit-db permissions.
       (t2/delete! :permissions {:where [:like :object (str "%/db/" id "/%")]})
       (t2/insert! Database {:is_audit         true
                             :id               default-audit-db-id
                             :name             "Internal Metabase Database"
                             :description      "Internal Audit DB used to power metabase analytics."
                             :engine           engine
                             :is_full_sync     true
                             :is_on_demand     false
                             :creator_id       nil
                             :auto_run_queries true})))))

(defn ensure-db-installed!
  "Called on app startup to ensure the existance of the audit db in enterprise apps.

  The return values indicate what action was taken."
  []
  (let [audit-db (t2/select-one Database :is_audit true)]
    (cond
      (nil? audit-db)
      (u/prog1 ::installed
        (log/info "Installing Audit DB...")
        (install-database! mdb.env/db-type))

      (not= mdb.env/db-type (:engine audit-db))
      (u/prog1 ::updated
        (log/infof "App DB change detected. Changing Audit DB source to match: %s." (name mdb.env/db-type))
        (t2/update! Database :is_audit true {:engine mdb.env/db-type})
        (ensure-db-installed!))

      :else
      ::no-op)))

(def analytics-root-dir-resource
  "Where to look for analytics content created by Metabase to load into the app instance on startup."
  (io/resource "instance_analytics.zip"))

(defenterprise ensure-audit-db-installed!
  "EE implementation of `ensure-db-installed!`. Also forces an immediate sync on audit-db."
  :feature :none
  []
  (u/prog1 (ensure-db-installed!)
    ;; There's a sync scheduled, but we want to force a sync right away:
    (if-let [audit-db (t2/select-one :model/Database {:where [:= :is_audit true]})]
      (do (log/info "Beginning Audit DB Sync...")
          (log/with-no-logs (sync-metadata/sync-db-metadata! audit-db))
          (log/info "Audit DB Sync Complete."))
      (when (not config/is-prod?)
        (log/warn "Audit DB was not installed correctly!!")))
    ;; load instance analytics content (collections/dashboards/cards/etc.) when the resource exists:
    (when analytics-root-dir-resource
      (ee.internal-user/ensure-internal-user-exists!)
      (log/info "Loading Analytics Content...")
      (log/info "Unzipping analytics to plugins...")
      (u.files/unzip-file analytics-root-dir-resource "plugins")
      (log/info "Unzipping done.")
      (log/info "Loading files...")
      (let [report (log/with-no-logs (serialization.cmd/v2-load "plugins/instance_analytics" {}))]
        (if (not-empty (:errors report))
          (log/info (str "Error Loading Analytics Content: " (pr-str report)))
          (log/info (str "Loading Analytics Content Complete (" (count (:seen report)) ") entities synchronized.")))))))
