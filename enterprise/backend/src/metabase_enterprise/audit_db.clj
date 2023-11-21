(ns metabase-enterprise.audit-db
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.internal-user :as ee.internal-user]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.env :as mdb.env]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions :as perms]
   [metabase.models.setting :refer [defsetting]]
   [metabase.plugins :as plugins]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.jar JarEntry JarFile)))

(set! *warn-on-reflection* true)

(defn- running-from-jar?
  "Returns true iff we are running from a jar.

  .getResource will return a java.net.URL, and those start with \"jar:\" if and only if the app is running from a jar.

  More info: https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/lang/Thread.html"
  []
  (-> (Thread/currentThread)
      (.getContextClassLoader)
      (.getResource "")
      (str/starts-with? "jar:")))

(defn- get-jar-path
  "Returns the path to the currently running jar file.

  More info: https://stackoverflow.com/questions/320542/how-to-get-the-path-of-a-running-jar-file"
  []
  (assert (running-from-jar?) "Can only get-jar-path when running from a jar.")
  (-> (class {})
      (.getProtectionDomain)
      (.getCodeSource)
      (.getLocation)
      (.toURI) ;; avoid problems with special characters in path.
      (.getPath)))

(defn copy-from-jar!
  "Recursively copies a subdirectory (at resource-path) from the jar at jar-path into out-dir.

  Scans every file in resources, to see which ones are inside of resource-path, since there's no
  way to \"ls\" or list a directory inside of a jar's resources."
  [jar-path resource-path out-dir]
  (let [jar-file (JarFile. (str jar-path))
        entries (.entries jar-file)]
     (doseq [^JarEntry entry (iterator-seq entries)
             :let [entry-name (.getName entry)]
             :when (str/starts-with? entry-name resource-path)
             :let [out-file (fs/path out-dir entry-name)]]
       (if (.isDirectory entry)
         (fs/create-dirs out-file)
         (do
           (-> out-file fs/parent fs/create-dirs)
           (with-open [in (.getInputStream jar-file entry)
                       out (io/output-stream (str out-file))]
             (io/copy in out)))))))

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

  - This uses a weird ID because some tests were hardcoded to look for database with ID = 2, and inserting an extra db
  throws that off since these IDs are sequential."
  [engine id]
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
                        :auto_run_queries true}))

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
  (when (fs/exists? (u.files/relative-path instance-analytics-plugin-dir))
    (fs/delete-tree (u.files/relative-path instance-analytics-plugin-dir)))
  (if (running-from-jar?)
    (let [path-to-jar (get-jar-path)]
      (log/info "The app is running from a jar, starting copy...")
      (copy-from-jar! path-to-jar "instance_analytics/" "plugins/")
      (log/info "Copying complete."))
    (let [in-path (fs/path analytics-dir-resource)]
      (log/info "The app is not running from a jar, starting copy...")
      (log/info (str "Copying " in-path " -> " instance-analytics-plugin-dir))
      (fs/copy-tree (u.files/relative-path in-path)
                    (u.files/relative-path instance-analytics-plugin-dir)
                    {:replace-existing true})
      (log/info "Copying complete."))))

(defsetting load-analytics-content
  "Whether or not we should load Metabase analytics content on startup. Defaults to true, but can be disabled via environment variable."
  :type       :boolean
  :default    true
  :visibility :internal
  :setter     :none
  :audit      :never
  :doc        false)

(defn- maybe-load-analytics-content!
  [audit-db]
  (when (and analytics-dir-resource (load-analytics-content))
    (ee.internal-user/ensure-internal-user-exists!)
    (adjust-audit-db-to-source! audit-db)
    (log/info "Loading Analytics Content...")
    (ia-content->plugins)
    (log/info (str "Loading Analytics Content from: " instance-analytics-plugin-dir))
    ;; The EE token might not have :serialization enabled, but audit features should still be able to use it.
    (let [report (log/with-no-logs
                   (serialization.cmd/v2-load-internal! (str instance-analytics-plugin-dir)
                                                        {}
                                                        :token-check? false))]
      (if (not-empty (:errors report))
        (log/info (str "Error Loading Analytics Content: " (pr-str report)))
        (log/info (str "Loading Analytics Content Complete (" (count (:seen report)) ") entities loaded."))))
    (when-let [audit-db (t2/select-one :model/Database :is_audit true)]
      (adjust-audit-db-to-host! audit-db))))

(defn- maybe-install-audit-db
  []
  (let [audit-db (t2/select-one :model/Database :is_audit true)]
    (cond
      (nil? audit-db)
      (u/prog1 ::installed
       (log/info "Installing Audit DB...")
       (install-database! mdb.env/db-type perms/audit-db-id))

      (not= mdb.env/db-type (:engine audit-db))
      (u/prog1 ::updated
       (log/infof "App DB change detected. Changing Audit DB source to match: %s." (name mdb.env/db-type))
       (adjust-audit-db-to-host! audit-db))

      :else
      ::no-op)))

(defenterprise ensure-audit-db-installed!
  "EE implementation of `ensure-db-installed!`. Installs audit db if it does not already exist, and loads audit
  content if it is available."
  :feature :none
  []
  (u/prog1 (maybe-install-audit-db)
   (let [audit-db (t2/select-one :model/Database :is_audit true)]
       ;; prevent sync while loading
     ((sync-util/with-duplicate-ops-prevented :sync-database audit-db
        (fn [] (maybe-load-analytics-content! audit-db)))))))
