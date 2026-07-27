(ns metabase-enterprise.audit-app.audit
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.audit-app.settings :as audit-app.settings]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.lib.core :as lib]
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
   (java.nio.file FileVisitOption Files LinkOption Path)
   (java.util.jar JarEntry JarFile)))

(set! *warn-on-reflection* true)

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
    (if (u.files/running-from-jar?)
      (let [path-to-jar (u.files/get-jar-path)]
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

(defn directory-content-checksum
  "Stable hash of the relative paths and contents of files under `root` (recursively) whose filenames
   end with `suffix` (e.g. `.sql`). Detects renames (paths are included) and content swaps between
   files (single hash over sorted pairs)."
  ([root] (directory-content-checksum root ""))
  ([^Path root suffix]
   (with-open [stream (Files/walk root (u/varargs FileVisitOption))]
     (->> (iterator-seq (.iterator stream))
          (filter (fn [^Path p]
                    (and (Files/isRegularFile p (u/varargs LinkOption))
                         (str/ends-with? (str (.getFileName p)) suffix))))
          (mapv (fn [^Path path]
                  [(str (.relativize root path))
                   (Files/readString path)]))
          (sort-by first)
          hash))))

(defn analytics-checksum
  "Checksum of the serialized analytics content (collections, dashboards, cards) on the classpath.
   Stored in the `last-analytics-checksum` setting; when it changes, `ensure-audit-db-installed!`
   re-runs `serialization.cmd/v2-load-internal!` on boot."
  []
  (-> (plugins/plugins-dir)
      instance-analytics-plugin-dir
      directory-content-checksum))

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

(defn- audit-db-in-source-state?
  "True when *active* audit tables are stuck at the postgres \"source\" schema (`public`) on a non-postgres host — the
  half-applied state left by an interrupted `adjust-audit-db-to-host!`."
  [audit-db-id]
  (and (not= :postgres (mdb/db-type))
       (t2/exists? :model/Table :db_id audit-db-id :schema "public" :active true)))

(defn- maybe-load-analytics-content!
  "Loads serialized audit content from the classpath if its checksum has changed.

   Returns true iff loading required swapping the audit DB engine type to match the host
   (i.e. the host is not postgres and we just rewrote the engine row from postgres back to
   h2/mysql). The boolean tells `maybe-sync-audit-db!` whether field metadata needs to be
   re-scanned for the new dialect — this transient swap isn't visible from outside the
   function, which is why it has to be returned explicitly."
  [audit-db]
  (boolean
   (when analytics-dir-resource
     (ia-content->plugins (plugins/plugins-dir))
     (let [[last-checksum current-checksum] (get-last-and-current-checksum)
           load?                            (audit-app.settings/load-analytics-content)]
       (when (or (should-load-audit? load? last-checksum current-checksum)
                 (and load? (audit-db-in-source-state? (:id audit-db))))
         (adjust-audit-db-to-source! audit-db)
         (log/info (str "Loading Analytics Content from: " (instance-analytics-plugin-dir (plugins/plugins-dir))))
         ;; The EE token might not have :serialization enabled, but audit features should still be able to use it.
         (let [report  (log/with-no-logs
                         (serialization.cmd/v2-load-internal! (str (instance-analytics-plugin-dir (plugins/plugins-dir)))
                                                              {}
                                                              :token-check? false
                                                              :require-initialized-db? false))
               loaded? (empty? (:errors report))]
           (if loaded?
             (log/info (str "Loading Analytics Content Complete (" (count (:seen report)) ") entities loaded."))
             (log/info (str "Error Loading Analytics Content: " (pr-str report))))
           (when-let [{:keys [engine] :as audit-db} (t2/select-one :model/Database :is_audit true)]
             (let [original-engine engine]
               (adjust-audit-db-to-host! audit-db)
               ;; GHY-3974 Mode B: advance the checksum only after the host-adjust completes, so an
               ;; interrupted host-adjust leaves the checksum behind and the next boot re-runs the load.
               (when loaded?
                 (audit/last-analytics-checksum! current-checksum))
               (not= original-engine (mdb/db-type))))))))))

(defn- maybe-install-audit-db!
  []
  (let [audit-db (t2/select-one :model/Database :is_audit true)
        result   (cond
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
                   ::no-op)]
    (when (contains? #{::installed ::updated} result)
      (when-let [db (t2/select-one :model/Database :is_audit true)]
        (log/info "Syncing Audit DB")
        (log/with-no-logs (sync/sync-database! db {:scan :schema}))))
    result))

(defn- views-checksum
  "Checksum of the `instance_analytics_views` SQL files. Stored in the `last-analytics-views-checksum`
   setting; when it changes, `ensure-audit-db-installed!` triggers a one-shot audit DB schema sync
   so that newly added or renamed views become discoverable without waiting for the next scheduled sync."
  []
  (when (io/resource "migrations/instance_analytics_views")
    (u.files/with-open-path-to-resource [views-dir "migrations/instance_analytics_views"]
      (directory-content-checksum views-dir ".sql"))))

(defn- maybe-sync-audit-db!
  "One-shot synchronous `:scan :schema` sync of the audit DB. Fires when either trigger is true:
     - `engine-changed?` — `maybe-load-analytics-content!` swapped the audit DB engine and
       field metadata needs to be refreshed for the new dialect.
     - the `instance_analytics_views` SQL files have changed since the last successful sync,
       meaning a migration may have added a new view that isn't yet in `metabase_table`.
   The two triggers share one sync because they both want the same operation. Runs synchronously
   (not in a background future) so it stays inside the caller's cross-node cluster lock and
   transaction — a sync on another thread would escape the lock and, on a transactional appdb,
   deadlock against the caller's uncommitted `metabase_table` writes."
  [audit-db engine-changed?]
  (let [current      (views-checksum)
        views-stale? (and current (not= current (audit-app.settings/last-analytics-views-checksum)))]
    (when (or engine-changed? views-stale?)
      (log/infof "Syncing Audit DB schema (engine-changed? %s, views-stale? %s)"
                 engine-changed? views-stale?)
      (try
        (log/with-no-logs (sync/sync-database! audit-db {:scan :schema}))
        (when current
          (audit-app.settings/last-analytics-views-checksum! current))
        (log/info "Audit DB sync complete.")
        (catch Exception e
          (log/error e "Audit DB sync failed."))))))

(defn- host-canonical-table
  "The `[name schema]` an audit-DB `metabase_table` row should use for the host engine, matching the
   conventions `adjust-audit-db-to-host!` applies."
  [table-name]
  (case (mdb/db-type)
    :mysql [(u/lower-case-en table-name) nil]
    :h2    [(u/upper-case-en table-name) "PUBLIC"]
    [(u/lower-case-en table-name) "public"]))

(defn- orphan->survivor-field-ids
  "Map of `orphan-table-id`'s field ids to `survivor-table-id`'s field ids, matched by lower-cased field name.
   Orphan fields with no same-named survivor field are omitted."
  [orphan-table-id survivor-table-id]
  (let [survivor-by-name (into {}
                               (map (juxt (comp u/lower-case-en :name) :id))
                               (t2/select [:model/Field :id :name] :table_id survivor-table-id))]
    (into {}
          (keep (fn [{:keys [id name]}]
                  (when-let [survivor-field-id (survivor-by-name (u/lower-case-en name))]
                    [id survivor-field-id])))
          (t2/select [:model/Field :id :name] :table_id orphan-table-id))))

(defn- remap-result-metadata-ref
  "Remap the Field ID of a single result-metadata `:field_ref` via `field-id-remap`. Handles legacy refs
   (`[:field id opts]`, `[:field-id id]`, id second) and pMBQL refs (`[:field opts id]`, id last). Non-field refs and
   ids with no remapping are returned unchanged."
  [field-id-remap ref]
  (if (and (vector? ref) (#{:field :field-id} (first ref)))
    (let [idx (if (map? (second ref)) 2 1)
          id  (nth ref idx nil)]
      (if (field-id-remap id)
        (assoc ref idx (field-id-remap id))
        ref))
    ref))

(defn- remap-result-metadata
  "Remap orphan Field IDs onto survivor fields in a card's `result_metadata` columns — the `:id`,
   `:fk_target_field_id`, and `:field_ref` of each column — via `field-id-remap`. Result metadata is stored, not a
   Lib query, so it's handled here rather than by the Lib query helpers."
  [field-id-remap result-metadata]
  (let [remap-id (fn [id] (or (field-id-remap id) id))]
    (mapv (fn [col]
            (-> col
                (m/update-existing :id remap-id)
                (m/update-existing :fk_target_field_id remap-id)
                (m/update-existing :field_ref #(remap-result-metadata-ref field-id-remap %))))
          result-metadata)))

(defn- repoint-cards-to-survivor!
  "Move every card that references `orphan-table-id` onto `survivor-table-id` by rewriting its query and result
   metadata. A card's `table_id` is derived from its `dataset_query` by `populate-query-fields`, so updating the
   column alone is silently reverted — and the orphan's FK is ON DELETE CASCADE, so a card left behind is destroyed
   when the orphan is deleted. Field ids are remapped onto the survivor's same-named fields."
  [orphan-table-id survivor-table-id]
  (let [field-id-remap (orphan->survivor-field-ids orphan-table-id survivor-table-id)]
    (doseq [card (t2/select :model/Card :table_id orphan-table-id)]
      (t2/update! :model/Card (:id card)
                  (cond-> {:dataset_query (-> (:dataset_query card)
                                              (lib/replace-table-ids {orphan-table-id survivor-table-id})
                                              (lib/replace-field-ids field-id-remap))}
                    (:result_metadata card)
                    (assoc :result_metadata (remap-result-metadata field-id-remap (:result_metadata card))))))))

(defn- reconcile-audit-db-duplicates!
  "Collapse duplicate `metabase_table` rows for the same audit view into a single active row at the host-canonical
  name/schema.

  Idempotent: a no-op when there are no duplicates.

  Dedupe by choosing the row other content points at, otherwise the active row, otherwise the lowest id. Content on
  the rows being removed is moved onto the survivor (query source-table and field ids rewritten) before they are
  deleted, so no card is lost to the orphan's ON DELETE CASCADE."
  [audit-db-id]
  ;; order by id in the query so every selection below (including the `referenced?` tiebreak) is deterministic;
  ;; group-by preserves this order within each group
  (let [groups (->> (t2/select [:model/Table :id :name :schema :active] :db_id audit-db-id
                               {:order-by [[:id :asc]]})
                    (group-by (comp u/lower-case-en :name))
                    (filter (fn [[_ rows]] (> (count rows) 1))))]
    (doseq [[_ rows] groups]
      (let [referenced-ids    (into #{}
                                    (map :table_id)
                                    (t2/query {:select-distinct [:table_id]
                                               :from            [(t2/table-name :model/Card)]
                                               :where           [:in :table_id (map :id rows)]}))
            survivor          (or (first (filter (comp referenced-ids :id) rows))
                                  (first (filter :active rows))
                                  (first rows))
            [c-name c-schema] (host-canonical-table (:name survivor))
            orphans           (remove #(= (:id %) (:id survivor)) rows)]
        ;; move content off each orphan, then delete it before re-canonicalizing the survivor so the survivor's
        ;; new (name, schema) can't collide with an orphan still sitting at that slot on idx_unique_table
        (doseq [{orphan-id :id} orphans]
          (repoint-cards-to-survivor! orphan-id (:id survivor))
          (t2/delete! :model/Table orphan-id))
        ;; clear is_defective_duplicate so the survivor re-enters idx_unique_table (its unique_table_helper is
        ;; NULL — and thus excluded from the index — while the flag is set)
        (t2/update! :model/Table (:id survivor)
                    {:active true :name c-name :schema c-schema :is_defective_duplicate false})
        (log/infof "Reconciled %d duplicate audit view row(s) onto table id %s"
                   (count orphans) (:id survivor))))))

(def ^:private audit-db-cluster-lock
  "Cluster lock serializing the audit DB load/adjust/sync/reconcile across nodes (GHY-3974 1b)."
  ::audit-db-lock)

(defn- audit-lock-contention?
  "True only for the exception `with-cluster-lock` throws when it could not acquire *our* audit lock. A
   different cluster lock's acquisition failure raised from inside the locked body (e.g. the permissions
   lock taken when serdes inserts a Database) also carries `:lock-names`, but must propagate rather than be
   swallowed as audit contention."
  [e]
  (let [audit-lock-name (str (namespace audit-db-cluster-lock) "/" (name audit-db-cluster-lock))]
    (boolean (some #{audit-lock-name} (:lock-names (ex-data e))))))

(defenterprise ensure-audit-db-installed!
  "EE implementation of `ensure-db-installed!`. Installs audit db if it does not already exist, and loads audit
  content if it is available."
  :feature :none
  []
  ;; serialize install+adjust+load+sync+reconcile across nodes so a rolling upgrade can't run an adjust or sync
  ;; against a half-adjusted schema (`with-duplicate-ops-prevented` is per-process only). The install runs inside the
  ;; lock too, so a node that acquires it after the installer committed sees the DB already exists and falls through
  ;; to a no-op rather than colliding on the audit DB primary key. The sync runs synchronously inside the lock so it
  ;; stays in the lock's transaction. If another node already holds the lock it is doing this same work, so we skip
  ;; rather than fail the boot.
  (try
    (cluster-lock/with-cluster-lock {:lock audit-db-cluster-lock :timeout-seconds 5 :retry-config {:max-retries 2}}
      (u/prog1 (maybe-install-audit-db!)
        (when-let [audit-db (t2/select-one :model/Database :is_audit true)]
          ((sync-util/with-duplicate-ops-prevented
            :sync-database audit-db
            (fn []
              (maybe-sync-audit-db! audit-db (maybe-load-analytics-content! audit-db))
              ;; GHY-3974 Mode A: runs every boot so already-corrupted instances (whose checksum already
              ;; matches, so the load/sync above are skipped) still self-heal.
              (reconcile-audit-db-duplicates! (:id audit-db))))))))
    (catch Throwable e
      (if (audit-lock-contention? e)
        (u/prog1 ::skipped-locked
          (log/info "Another node holds the audit DB lock; skipping audit DB install/load on this node."))
        (throw e)))))
