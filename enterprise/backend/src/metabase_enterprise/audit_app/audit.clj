(ns metabase-enterprise.audit-app.audit
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.audit :as audit]
   [metabase.db :as mdb]
   [metabase.models.database :refer [Database]]
   [metabase.models.setting :refer [defsetting]]
   [metabase.plugins :as plugins]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.jar JarEntry JarFile)
   (java.nio.file Path)))

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

(def default-question-overview-entity-id
  "Default Question Overview (this is a dashboard) entity id."
  "jm7KgY6IuS6pQjkBZ7WUI")

(def default-dashboard-overview-entity-id
  "Default Dashboard Overview (this is a dashboard) entity id."
  "bJEYb0o5CXlfWFcIztDwJ")

(defn- install-database!
  "Creates the audit db, a clone of the app db used for auditing purposes.

  - This uses a weird ID because some tests were hardcoded to look for database with ID = 2, and inserting an extra db
  throws that off since these IDs are sequential."
  [engine id]
  (t2/insert! Database {:is_audit         true
                        :id               id
                        :name             "Internal Metabase Database"
                        :description      "Internal Audit DB used to power metabase analytics."
                        :engine           engine
                        :is_full_sync     true
                        :is_on_demand     false
                        :creator_id       nil
                        :auto_run_queries true})
  ;; guard against someone manually deleting the audit-db entry, but not removing the audit-db permissions.
  (t2/delete! :model/Permissions {:where [:like :object (str "%/db/" id "/%")]}))

(defn- adjust-audit-db-to-source!
  [{audit-db-id :id}]
  ;; We need to move back to a schema that matches the serialized data
  (when (contains? #{:mysql :h2} (mdb/db-type))
    (t2/update! :model/Database audit-db-id {:engine "postgres"})
    (when (= :mysql (mdb/db-type))
      (t2/update! :model/Table {:db_id audit-db-id} {:schema "public"}))
    (when (= :h2 (mdb/db-type))
      (t2/update! :model/Table {:db_id audit-db-id} {:schema [:lower :schema] :name [:lower :name]})
      (t2/update! :model/Field
                  {:table_id
                   [:in
                    {:select [:id]
                     :from [(t2/table-name :model/Table)]
                     :where [:= :db_id audit-db-id]}]}
                  {:name [:lower :name]}))
    (log/info "Adjusted Audit DB for loading Analytics Content")))

(defn- adjust-audit-db-to-host!
  [{audit-db-id :id :keys [engine]}]
  (when (not= engine (mdb/db-type))
    ;; We need to move the loaded data back to the host db
    (t2/update! :model/Database audit-db-id {:engine (name (mdb/db-type))})
    (when (= :mysql (mdb/db-type))
      (t2/update! :model/Table {:db_id audit-db-id} {:schema nil}))
    (when (= :h2 (mdb/db-type))
      (t2/update! :model/Table {:db_id audit-db-id} {:schema [:upper :schema] :name [:upper :name]})
      (t2/update! :model/Field
                  {:table_id
                   [:in
                    {:select [:id]
                     :from [(t2/table-name :model/Table)]
                     :where [:= :db_id audit-db-id]}]}
                  {:name [:upper :name]}))
    (log/infof "Adjusted Audit DB to match host engine: %s" (name (mdb/db-type)))))

(def ^:private analytics-dir-resource
  "A resource dir containing analytics content created by Metabase to load into the app instance on startup."
  (io/resource "instance_analytics"))

(defn- instance-analytics-plugin-dir
  "The directory analytics content is unzipped or moved to, and subsequently loaded into the app from on startup."
  [plugins-dir]
  (fs/path (fs/absolutize plugins-dir) "instance_analytics"))

(def ^:private jar-resource-path "instance_analytics/")

(defn- ia-content->plugins
  "Load instance analytics content (collections/dashboards/cards/etc.) from resources dir or a zip file
   and copies it into the provided directory (by default, plugins/instance_analytics)."
  [plugins-dir]
  (let [ia-dir (instance-analytics-plugin-dir plugins-dir)]
    (when (fs/exists? (u.files/relative-path ia-dir))
      (fs/delete-tree (u.files/relative-path ia-dir)))
    (if (running-from-jar?)
      (let [path-to-jar (get-jar-path)]
        (log/info "The app is running from a jar, starting copy...")
        (log/info (str "Copying " path-to-jar "::" jar-resource-path " -> " plugins-dir))
        (copy-from-jar! path-to-jar jar-resource-path plugins-dir)
        (log/info "Copying complete."))
      (let [in-path (fs/path analytics-dir-resource)]
        (log/info "The app is not running from a jar, starting copy...")
        (log/info (str "Copying " in-path " -> " ia-dir))
        (fs/copy-tree (u.files/relative-path in-path)
                      (u.files/relative-path ia-dir)
                      {:replace-existing true})
        (log/info "Copying complete.")))))

(defsetting load-analytics-content
  "Whether or not we should load Metabase analytics content on startup. Defaults to true, but can be disabled via environment variable."
  :type       :boolean
  :default    true
  :visibility :internal
  :setter     :none
  :audit      :never
  :doc        "Setting this environment variable to false can also come in handy when migrating environments, as it can simplify the migration process.")

(def ^:constant SKIP_CHECKSUM_FLAG
  "If `last-analytics-checksum` is set to this value, we will skip calculating checksums entirely and *always* reload the
  analytics data."
  -1)

(defn- should-skip-checksum? [last-checksum]
  (= SKIP_CHECKSUM_FLAG last-checksum))

(defn analytics-checksum
  "Hashes the contents of all non-dir files in the `analytics-dir-resource`."
  []
  (->> ^Path (instance-analytics-plugin-dir (plugins/plugins-dir))
       (.toFile)
       file-seq
       (remove fs/directory?)
       (pmap #(hash (slurp %)))
       (reduce +)))

(defn- should-load-audit?
  "Should we load audit data?"
  [load-analytics-content? last-checksum current-checksum]
  (and load-analytics-content?
       (or (should-skip-checksum? last-checksum)
           (not= last-checksum current-checksum))))

(defn- get-last-and-current-checksum
  "Gets the previous and current checksum for the analytics directory, respecting the `-1` flag for skipping checksums entirely."
  []
  (let [last-checksum (audit/last-analytics-checksum)]
    (if (should-skip-checksum? last-checksum)
      [SKIP_CHECKSUM_FLAG SKIP_CHECKSUM_FLAG]
      [last-checksum (analytics-checksum)])))

(defn- maybe-load-analytics-content!
  [audit-db]
  (when analytics-dir-resource
    (adjust-audit-db-to-source! audit-db)
    (ia-content->plugins (plugins/plugins-dir))
    (let [[last-checksum current-checksum] (get-last-and-current-checksum)]
      (when (should-load-audit? (load-analytics-content) last-checksum current-checksum)
        (log/info (str "Loading Analytics Content from: " (instance-analytics-plugin-dir (plugins/plugins-dir))))
        ;; The EE token might not have :serialization enabled, but audit features should still be able to use it.
        (let [report (log/with-no-logs
                       (serialization.cmd/v2-load-internal! (str (instance-analytics-plugin-dir (plugins/plugins-dir)))
                                                            {:backfill? false}
                                                            :token-check? false
                                                            :require-initialized-db? false))]
          (if (not-empty (:errors report))
            (log/info (str "Error Loading Analytics Content: " (pr-str report)))
            (do
              (log/info (str "Loading Analytics Content Complete (" (count (:seen report)) ") entities loaded."))
              (audit/last-analytics-checksum! current-checksum))))))
    (when-let [audit-db (t2/select-one :model/Database :is_audit true)]
      (adjust-audit-db-to-host! audit-db))))

(defn- maybe-install-audit-db
  []
  (let [audit-db (t2/select-one :model/Database :is_audit true)]
    (cond
      (nil? audit-db)
      (u/prog1 ::installed
       (log/info "Installing Audit DB...")
       (install-database! (mdb/db-type) audit/audit-db-id))

      (not= (mdb/db-type) (:engine audit-db))
      (u/prog1 ::updated
       (log/infof "App DB change detected. Changing Audit DB source to match: %s." (name (mdb/db-type)))
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
        (fn []
          (maybe-load-analytics-content! audit-db)))))))
