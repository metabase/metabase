(ns metabase-enterprise.audit-db
  (:require
   [babashka.fs :as fs]
   [clojure.core :as c]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.internal-user :as ee.internal-user]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.env :as mdb.env]
   [metabase.models.database :refer [Database]]
   [metabase.plugins :as plugins]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import [java.util.jar JarEntry JarFile]))

(set! *warn-on-reflection* true)

(defn- running-from-jar?
  "Returns true iff we are running from a jar."
  []
  (-> (Thread/currentThread)
      (.getContextClassLoader)
      (.getResource "")
      (str/starts-with? "jar:")))

(defn- get-jar-path []
  (-> (class {})
      .getProtectionDomain
      .getCodeSource
      .getLocation
      .toURI
      .getPath))

(defn copy-from-jar!
  "Recursively copies a subdirectory from the jar at jar-path into out-dir."
  [jar-path resource-path out-dir]
  (let [jar-file (JarFile. (str jar-path))
        entries (.entries jar-file)]
    (while (.hasMoreElements entries)
      (let [^JarEntry entry (.nextElement entries)
            entry-name (.getName entry)
            out-file (fs/path out-dir entry-name)]
        (when (str/starts-with? entry-name resource-path)
          (if (.isDirectory entry)
            (fs/create-dirs out-file)
            (do
              (-> out-file fs/parent fs/create-dirs)
              (with-open [in (.getInputStream jar-file entry)
                          out (io/output-stream (str out-file))]
                (io/copy in out)))))))))

(defenterprise default-audit-db-id
  "Default audit db id."
  :feature :none
  []
  13371337)

(def ^:private default-audit-collection-entity-id
  "Default audit collection entity (instance analytics) id."
  "vG58R8k-QddHWA7_47umn")

(def ^:private default-custom-reports-entity-id
  "Default custom reports entity id."
  "okNLSZKdSxaoG58JSQY54")

(defn collection-entity-id->collection
  "Returns the collection from entity id for collections. Memoizes from entity id."
  [entity-id]
  ((mdb.connection/memoize-for-application-db
    (fn [entity-id]
      (t2/select-one :model/Collection :entity_id entity-id))) entity-id))

(defenterprise default-custom-reports-collection
  "Default custom reports collection."
  :feature :none
  []
  (collection-entity-id->collection default-custom-reports-entity-id))

(defenterprise default-audit-collection
  "Default audit collection (instance analytics) collection."
  :feature :none
  []
  (collection-entity-id->collection default-audit-collection-entity-id))

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


(defn- adjust-audit-db-to-source!
  [{audit-db-id :id}]
  ;; We need to move back to a schema that matches the serialized data
  (when (contains? #{:mysql :h2} mdb.env/db-type)
    (t2/update! :model/Database audit-db-id {:engine "postgres"})
    (when (= :mysql mdb.env/db-type)
      (t2/update! :model/Table {:db_id audit-db-id} {:schema "public"}))
    (when (= :h2 mdb.env/db-type)
      (t2/update! :model/Table {:db_id audit-db-id} {:schema [:lower :schema] :name [:lower :name]})
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

(def analytics-dir-resource
  "A resource dir containing analytics content created by Metabase to load into the app instance on startup."
  (io/resource "instance_analytics"))

(def instance-analytics-plugin-dir
  "The directory analytics content is unzipped or moved to, and subsequently loaded into the app from on startup."
  (fs/path (plugins/plugins-dir) "instance_analytics"))

(defn- ia-content->plugins
  "Load instance analytics content (collections/dashboards/cards/etc.) from resources dir or a zip file
   and put it into plugins/instance_analytics"
  []
  (if (running-from-jar?)
    (let [path-to-jar (get-jar-path)]
      (log/info "The app is ajar")
      (copy-from-jar! path-to-jar "instance_analytics/" "plugins/")
      (log/info "Copying complete."))
    (let [out-path (fs/path analytics-dir-resource)]
      (log/info "The app is not running from a jar")
      (log/info (str "Copying " out-path " -> " instance-analytics-plugin-dir))
      (fs/copy-tree (u.files/relative-path out-path)
                    (u.files/relative-path instance-analytics-plugin-dir)
                    {:replace-existing true})
      (log/info "Copying complete."))))

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
      (when analytics-dir-resource
        ;; prevent sync while loading
        ((sync-util/with-duplicate-ops-prevented :sync-database audit-db
           (fn []
             (ee.internal-user/ensure-internal-user-exists!)
             (adjust-audit-db-to-source! audit-db)
             (log/info "Loading Analytics Content...")
             (ia-content->plugins)
             (log/info (str "Loading Analytics Content from: plugins/instance_analytics"))
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
