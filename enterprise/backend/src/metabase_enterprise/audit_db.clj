(ns metabase-enterprise.audit-db
  (:require
   [clojure.core :as c]
   [clojure.java.io :as io]
   [metabase-enterprise.internal-user :as ee.internal-user]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.db.env :as mdb.env]
   [metabase.models.database :refer [Database]]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (java.io File)))

(set! *warn-on-reflection* true)

(defenterprise default-audit-db-id
  "Default audit db id."
  :feature :none
  []
  13371337)

(defenterprise default-audit-collection-entity-id
  "Default audit collection entity (instance analytics) id."
  :feature :none
  []
  "vG58R8k-QddHWA7_47umn")

(defn- install-database!
  "Creates the audit db, a clone of the app db used for auditing purposes.

  - This uses a weird ID because some tests are hardcoded to look for database with ID = 2, and inserting an extra db
  throws that off since the IDs are sequential...

  - In the unlikely case that a user has many many databases in Metabase, and ensure there can Never be a collision, we
  do a quick check here and pick a new ID if it would have collided. Similar to finding an open port number."
  ([engine] (install-database! engine (default-audit-db-id)))
  ([engine id]
   (if (t2/select-one Database :id id)
     (install-database! engine (inc id))
     (do
       ;; guard against someone manually deleting the audit-db entry, but not removing the audit-db permissions.
       (t2/delete! :permissions {:where [:like :object (str "%/db/" id "/%")]})
       (t2/insert! Database {:is_audit         true
                             :id               id
                             :name             "Internal Metabase Database"
                             :description      "Internal Audit DB used to power metabase analytics."
                             :engine           engine
                             :is_full_sync     true
                             :is_on_demand     false
                             :creator_id       nil
                             :auto_run_queries true})))))


(def analytics-root-dir-resource
  "Where to look for analytics content created by Metabase to load into the app instance on startup."
  (io/resource "instance_analytics.zip"))

(defn- adjust-audit-db-to-source!
  [{audit-db-id :id}]
  ;; We need to move back to a schema that matches the serialized data
  (when (contains? #{:mysql :h2} mdb.env/db-type)
    (t2/update! :model/Database audit-db-id {:engine "postgres"})
    (when (= :mysql mdb.env/db-type)
      (t2/update! :model/Table {:db_id audit-db-id} {:schema "public"}))
    (when (= :h2 mdb.env/db-type)
      (t2/update! :model/Table {:db_id audit-db-id} {:schema [:lower :name] :name [:lower :name]})
      (t2/update! :model/Field
                  {:table_id
                   [:in
                    {:select [:id]
                     :from [(t2/table-name :model/Table)]
                     :where [:= :db_id audit-db-id]}]}
                  {:name [:lower :name]}))
    (log/infof "Adjusted Audit DB for loading Analytics Content")))

(defn- adjust-audit-db-to-host!
  [{audit-db-id :id :keys [engine]}]
  (when (not= engine mdb.env/db-type)
    ;; We need to move the loaded data back to the host db
    (t2/update! :model/Database audit-db-id {:engine (name mdb.env/db-type)})
    (when (= :mysql mdb.env/db-type)
      (t2/update! :model/Table {:db_id audit-db-id} {:schema nil}))
    (when (= :h2 mdb.env/db-type)
      (t2/update! :model/Table {:db_id audit-db-id} {:schema [:upper :schema] :name [:upper :name]})
      (t2/update! :model/Field
                  {:table_id
                   [:in
                    {:select [:id]
                     :from [(t2/table-name :model/Table)]
                     :where [:= :db_id audit-db-id]}]}
                  {:name [:upper :name]}))
    (log/infof "Adjusted Audit DB to match host engine: %s" (name mdb.env/db-type))))

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
        (adjust-audit-db-to-host! audit-db))

      :else
      ::no-op)))

(defn- map-instance-analytics-files-to-plugins-dir [path]
  (let [pattern (re-pattern (str ".*" File/separatorChar "(instance_analytics" File/separatorChar ".*)"))]
    (->> path
         (re-find pattern)
         second
         (str "plugins" File/separatorChar))))

(defenterprise ensure-audit-db-installed!
  "EE implementation of `ensure-db-installed!`. Also forces an immediate sync on audit-db."
  :feature :none
  []
  (u/prog1 (ensure-db-installed!)
    (let [audit-db (t2/select-one :model/Database :is_audit true)]
      (assert audit-db "Audit DB was not installed correctly!!")
      ;; There's a sync scheduled, but we want to force a sync right away:
      (log/info "Beginning Audit DB Sync...")
      (sync-metadata/sync-db-metadata! audit-db)
      (log/info "Audit DB Sync Complete.")

      ;; load instance analytics content (collections/dashboards/cards/etc.) when
      ;; the resource exists and when the feature flag is enabled
      (when (and (premium-features/enable-audit-app?) analytics-root-dir-resource)
        ;; prevent sync while loading
        ((sync-util/with-duplicate-ops-prevented :sync-database audit-db
           (fn []
             (ee.internal-user/ensure-internal-user-exists!)
             (adjust-audit-db-to-source! audit-db)
             (log/info "Loading Analytics Content...")
             (log/info "Unzipping instance_analytics to plugins...")
             (log/info "analytics-root-dir-resource is:"
                       (pr-str analytics-root-dir-resource)
                       " | "
                       analytics-root-dir-resource)
             (u.files/unzip-file
               analytics-root-dir-resource
               map-instance-analytics-files-to-plugins-dir)
             (log/info "Unzipping done.")
             (log/info (str "Loading Analytics Content from: " "plugins/instance_analytics"))
             ;; The EE token might not have :serialization enabled, but audit features should still be able to use it.
             (let [report (log/with-no-logs
                            (serialization.cmd/v2-load-internal "plugins/instance_analytics"
                                                                {}
                                                                :token-check? false))]
               (if (not-empty (:errors report))
                 (log/info (str "Error Loading Analytics Content: " (pr-str report)))
                 (log/info (str "Loading Analytics Content Complete (" (count (:seen report)) ") entities synchronized."))))
             (when-let [audit-db (t2/select-one :model/Database :is_audit true)]
               (adjust-audit-db-to-host! audit-db)))))))))
