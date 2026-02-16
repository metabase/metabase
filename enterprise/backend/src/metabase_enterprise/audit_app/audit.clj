(ns metabase-enterprise.audit-app.audit
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.audit-app.settings :as audit-app.settings]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.config.core :as config]
   [metabase.plugins.core :as plugins]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.sync.core :as sync]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Path)
   (java.util.jar JarEntry JarFile)))

(set! *warn-on-reflection* true)

(defn- get-jar-path
  "Returns the path to the currently running jar file.

  More info: https://stackoverflow.com/questions/320542/how-to-get-the-path-of-a-running-jar-file"
  []
  (assert (config/jar?) "Can only get-jar-path when running from a jar.")
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

(def default-db-name
  "Default Audit DB name"
  "Internal Metabase Database")

(defn- install-database!
  "Creates the audit db, a clone of the app db used for auditing purposes.

  - This uses a weird ID because some tests were hardcoded to look for database with ID = 2, and inserting an extra db
  throws that off since these IDs are sequential."
  [engine id]
  (t2/insert! :model/Database {:is_audit         true
                               :id               id
                               :name             default-db-name
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
  (t2/update! :model/Database audit-db-id {:engine "postgres"})
  ;; do a separate select and update of table ids that are not downcased
  ;; we don't want to try to downcase audit db tables that may already have a downcased version
  ;; some older migrations have both upper and lowercased table names
  ;; just grab the ids separately since there aren't many and this kind of check in an update
  ;; has different syntax on different appdbs
  (let [table-ids-to-update (t2/query {:select [:table.id]
                                       :from [[(t2/table-name :model/Table) :table]]
                                       :where [:and [:= :table.db_id audit-db-id]
                                               ;; Exclude DATABASECHANGELOG, DATABASECHANGELOGLOCK, and QRTZ_* tables, they are not metabase managed
                                               [:not= :table.name [:inline "DATABASECHANGELOG"]]
                                               [:not= :table.name [:inline "DATABASECHANGELOGLOCK"]] ;; new instances do not get this file, but existing instances may have it
                                               [:not [:like :table.name [:inline "QRTZ_%"]]]
                                               [:not [:exists {:select [1]
                                                               :from [[(t2/table-name :model/Table) :self_table]]
                                                               :where [:and
                                                                       [:= :self_table.db_id :table.db_id]
                                                                       [:or
                                                                        [:= :self_table.schema [:lower :table.schema]]
                                                                        [:and
                                                                         [:= :self_table.schema [:inline "public"]]
                                                                         [:= :table.schema nil]]]
                                                                       [:= :self_table.name [:lower :table.name]]]}]]]})]
    (when (seq table-ids-to-update)
      (t2/update! :model/Table :id [:in (map :id table-ids-to-update)]
                  {:schema "public" :name [:lower :name]})))
  (let [field-ids-to-update (t2/query {:select [:field.id]
                                       :from [[(t2/table-name :model/Field) :field]]
                                       :inner-join [[(t2/table-name :model/Table) :table]
                                                    [:= :table.id :field.table_id]]
                                       :where [:and [:= :table.db_id audit-db-id]
                                               [:not= :table.name [:inline "DATABASECHANGELOG"]]
                                               [:not [:like :table.name [:inline "QRTZ_%"]]]
                                               [:not [:exists {:select [1]
                                                               :from [[(t2/table-name :model/Field) :self_field]]
                                                               :inner-join [[(t2/table-name :model/Table) :self_table]
                                                                            [:= :self_table.id :self_field.table_id]]
                                                               :where [:and
                                                                       [:= :self_table.db_id :table.db_id]
                                                                       [:or
                                                                        [:= :self_table.schema [:lower :table.schema]]
                                                                        [:and
                                                                         [:= :self_table.schema [:inline "public"]]
                                                                         [:= :table.schema nil]]]
                                                                       [:= :self_field.name [:lower :field.name]]]}]]]})]
    (when (seq field-ids-to-update)
      (t2/update! :model/Field :id [:in (map :id field-ids-to-update)]
                  {:name [:lower :name]})))
  (log/info "Adjusted Audit DB for loading Analytics Content"))

(defn- fix-h2-card-metadata! [audit-db-id]
  (t2/with-connection [^java.sql.Connection conn]
    (with-open [stmt (.prepareStatement conn "UPDATE \"REPORT_CARD\" SET \"RESULT_METADATA\" = ? WHERE \"ID\" = ?;")]
      (reduce
       (fn [_ card]
         (when-let [result-metadata (not-empty (some-> (:result_metadata card) (json/decode true)))]
           (let [fixed-metadata (for [col result-metadata]
                                  (update col :name u/upper-case-en))
                 json-metadata  (json/encode fixed-metadata)]
             (.setString stmt 1 json-metadata)
             (.setInt stmt 2 (:id card))
             (.addBatch stmt))))
       nil
       (t2/reducible-select [(t2/table-name :model/Card) :id :result_metadata] :database_id audit-db-id))
      (.executeBatch stmt))))

(defn- adjust-audit-db-to-host!
  [{audit-db-id :id :keys [engine] :as audit-db}]
  (when-not (= engine (mdb/db-type))
    ;; We need to move the loaded data back to the host db
    (t2/update! :model/Database audit-db-id {:engine (name (mdb/db-type))})
    (case (mdb/db-type)
      :mysql
      (t2/update! :model/Table {:db_id audit-db-id} {:schema nil})

      :h2
      (do
        (t2/update! :model/Table {:db_id audit-db-id} {:schema [:upper :schema] :name [:upper :name]})
        (t2/update! :model/Field
                    {:table_id
                     [:in
                      {:select [:id]
                       :from   [(t2/table-name :model/Table)]
                       :where  [:= :db_id audit-db-id]}]}
                    {:name [:upper :name]})
        (fix-h2-card-metadata! audit-db-id))

      :postgres
      ;; in postgresql the data should look just like the source
      (adjust-audit-db-to-source! audit-db))
    (log/infof "Adjusted Audit DB to match host engine: %s" (name (mdb/db-type)))))

(def ^:private analytics-dir-resource
  "A resource dir containing analytics content created by Metabase to load into the app instance on startup."
  (io/resource "instance_analytics"))

(defn instance-analytics-plugin-dir
  "The directory analytics content is unzipped or moved to, and subsequently loaded into the app from on startup."
  [plugins-dir]
  (fs/path (fs/absolutize plugins-dir) "instance_analytics"))

(def ^:private jar-resource-path "instance_analytics/")

(defn ia-content->plugins
  "Load instance analytics content (collections/dashboards/cards/etc.) from resources dir or a zip file
   and copies it into the provided directory (by default, plugins/instance_analytics)."
  [plugins-dir]
  (let [ia-dir (instance-analytics-plugin-dir plugins-dir)]
    (when (fs/exists? (u.files/relative-path ia-dir))
      (fs/delete-tree (u.files/relative-path ia-dir)))
    (if (config/jar?)
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

(def ^:private skip-checksum-flag
  "If `last-analytics-checksum` is set to this value, we will skip calculating checksums entirely and *always* reload
  the analytics data."
  -1)

(defn- should-skip-checksum? [last-checksum]
  (= skip-checksum-flag last-checksum))

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
  "Gets the previous and current checksum for the analytics directory, respecting the `-1` flag for skipping checksums
  entirely."
  []
  (let [last-checksum (audit/last-analytics-checksum)]
    (if (should-skip-checksum? last-checksum)
      [skip-checksum-flag skip-checksum-flag]
      [last-checksum (analytics-checksum)])))

(defn- maybe-load-analytics-content!
  [audit-db]
  (when analytics-dir-resource
    (ia-content->plugins (plugins/plugins-dir))
    (let [[last-checksum current-checksum] (get-last-and-current-checksum)]
      (when (should-load-audit? (audit-app.settings/load-analytics-content) last-checksum current-checksum)
        (adjust-audit-db-to-source! audit-db)
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
              (audit/last-analytics-checksum! current-checksum))))
        (when-let [audit-db (t2/select-one :model/Database :is_audit true)]
          (adjust-audit-db-to-host! audit-db)
          (when-let [updated-audit-db (t2/select-one :model/Database :is_audit true)]
            ;; Sync the audit database to update field metadata to match the host database engine
            ;; This ensures fields with PostgreSQL-specific types (like timestamptz) get updated
            ;; to the correct types for the host database (e.g., datetime for MySQL)
            (log/info "Starting Sync of Audit DB fields to update metadata for host engine")
            (let [sync-future (future
                                (log/with-no-logs (sync/sync-database! updated-audit-db {:scan :schema}))
                                (log/info "Audit DB field sync complete."))]
              (when config/is-test?
                ;; Tests need the sync to complete before they run
                @sync-future))))))))

(defn- maybe-install-audit-db!
  []
  (let [audit-db (t2/select-one :model/Database :is_audit true)]
    (cond
      (not (audit-app.settings/install-analytics-database))
      (u/prog1 ::blocked
        (log/info "Not installing Audit DB - install-analytics-database setting is false"))

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
  (u/prog1 (maybe-install-audit-db!)
    (when-let [audit-db (t2/select-one :model/Database :is_audit true)]
      ;; prevent sync while loading
      ((sync-util/with-duplicate-ops-prevented
        :sync-database audit-db
        (fn []
          (maybe-load-analytics-content! audit-db)))))))
