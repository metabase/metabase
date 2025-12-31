(ns metabase-enterprise.remote-sync.impl
  (:require
   [clojure.string :as str]
   [diehard.core :as dh]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.ingestable :as source.ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.collections.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (metabase_enterprise.remote_sync.source.protocol SourceSnapshot)))

(defn- all-top-level-remote-synced-collections
  "Returns a vector of primary keys for all top-level remote-synced collections."
  []
  (t2/select-pks-vec :model/Collection :is_remote_synced true))

(defn- model-fields-for-sync
  "Returns the fields to select for a given model type when syncing."
  [model-name]
  (case model-name
    "Card" [:id :name :collection_id :display]
    "NativeQuerySnippet" [:id :name]
    "Collection" [:id :name [:id :collection_id]]
    "Segment" [:id :name :table_id]
    [:id :name :collection_id]))

(defn- sync-objects!
  "Populates the remote-sync-object table with imported entities. Deletes all existing RemoteSyncObject records and
  inserts new ones for each imported entity, marking them as 'synced' with the given timestamp.

  Takes a timestamp instant, a map of imported entities grouped by model name (for standard models with entity_id),
  and separate path collections for Table and Field models which use name-based identity."
  [timestamp imported-entities-by-model table-paths field-paths]
  (t2/delete! :model/RemoteSyncObject)
  (let [;; Standard models use entity_id UUIDs (excluding Segment which needs special handling)
        standard-inserts (->> (dissoc imported-entities-by-model "Segment")
                              (mapcat (fn [[model entity-ids]]
                                        (when (seq entity-ids)
                                          (let [fields (model-fields-for-sync model)
                                                model-kw (keyword "model" model)]
                                            (t2/select (into [model-kw] fields) :entity_id [:in entity-ids])))))
                              (map (fn [{:keys [id name collection_id display] :as model}]
                                     {:model_type (clojure.core/name (t2/model model))
                                      :model_id id
                                      :model_name name
                                      :model_collection_id collection_id
                                      :model_display (some-> display clojure.core/name)
                                      :model_table_id nil
                                      :model_table_name nil
                                      :status "synced"
                                      :status_changed_at timestamp})))
        ;; Segments: need to join to get table info
        segment-entity-ids (get imported-entities-by-model "Segment")
        segment-inserts (when (seq segment-entity-ids)
                          (->> (t2/query {:select [:s.id :s.name :s.table_id [:t.name :table_name] [:t.collection_id :collection_id]]
                                          :from [[:segment :s]]
                                          :join [[:metabase_table :t] [:= :s.table_id :t.id]]
                                          :where [:in :s.entity_id segment-entity-ids]})
                               (map (fn [{:keys [id name table_id table_name collection_id]}]
                                      {:model_type "Segment"
                                       :model_id id
                                       :model_name name
                                       :model_collection_id collection_id
                                       :model_display nil
                                       :model_table_id table_id
                                       :model_table_name table_name
                                       :status "synced"
                                       :status_changed_at timestamp}))))
        ;; Tables: batch lookup using join - include name and collection_id
        ;; For tables, table_id = self id, table_name = self name
        table-inserts (when (seq table-paths)
                        (->> (t2/query {:select [:t.id :t.name :t.collection_id]
                                        :from [[:metabase_table :t]]
                                        :join [[:metabase_database :db] [:= :db.id :t.db_id]]
                                        :where (into [:or]
                                                     (for [{:keys [db_name schema table_name]} table-paths]
                                                       [:and
                                                        [:= :db.name db_name]
                                                        (if schema [:= :t.schema schema] [:is :t.schema nil])
                                                        [:= :t.name table_name]]))})
                             (map (fn [{:keys [id name collection_id]}]
                                    {:model_type "Table"
                                     :model_id id
                                     :model_name name
                                     :model_collection_id collection_id
                                     :model_display nil
                                     :model_table_id id
                                     :model_table_name name
                                     :status "synced"
                                     :status_changed_at timestamp}))))
        ;; Fields: batch lookup using join through table - include name and collection_id from table
        field-inserts (when (seq field-paths)
                        (->> (t2/query {:select [:f.id :f.name :f.table_id [:t.collection_id :collection_id] [:t.name :table_name]]
                                        :from [[:metabase_field :f]]
                                        :join [[:metabase_table :t] [:= :t.id :f.table_id]
                                               [:metabase_database :db] [:= :db.id :t.db_id]]
                                        :where (into [:or]
                                                     (for [{:keys [db_name schema table_name field_name]} field-paths]
                                                       [:and
                                                        [:= :db.name db_name]
                                                        (if schema [:= :t.schema schema] [:is :t.schema nil])
                                                        [:= :t.name table_name]
                                                        [:= :f.name field_name]]))})
                             (map (fn [{:keys [id name table_id table_name collection_id]}]
                                    {:model_type "Field"
                                     :model_id id
                                     :model_name name
                                     :model_collection_id collection_id
                                     :model_display nil
                                     :model_table_id table_id
                                     :model_table_name table_name
                                     :status "synced"
                                     :status_changed_at timestamp}))))
        all-inserts (concat standard-inserts segment-inserts table-inserts field-inserts)]
    (when (seq all-inserts)
      (t2/insert! :model/RemoteSyncObject all-inserts))))

(defn- remove-unsynced!
  "Deletes any remote sync content that was NOT part of the import.

  Takes a sequence of remote-synced collection IDs and a map of imported entities grouped by model name. For each
  model type (Collection, Card, Dashboard, etc.), deletes any entities in the remote-synced collections whose
  entity_id is not in the imported set."
  [synced-collection-ids imported-entities-by-model]
  (when (seq synced-collection-ids)
    (doseq [model [:model/Collection
                   :model/Card
                   :model/Dashboard
                   :model/NativeQuerySnippet
                   :model/Timeline
                   :model/Document]
            :let [serdes-model (name model)
                  entity-ids (get imported-entities-by-model serdes-model [])]]
      (if (= model :model/Collection)
        (t2/delete! :model/Collection
                    :id [:in synced-collection-ids]
                    ;; if we didn't sync any, then delete all collections in the remote sync
                    :entity_id (if (seq entity-ids)
                                 [:not-in entity-ids]
                                 :entity_id))
        (t2/delete! model
                    :collection_id [:in synced-collection-ids]
                    :entity_id (if (seq entity-ids)
                                 [:not-in entity-ids]
                                 :entity_id))))))

(defn source-error-message
  "Constructs user-friendly error messages from remote sync source exceptions.

  Takes a throwable exception and returns a string message that categorizes the error (network, authentication,
  repository not found, branch, or generic) based on the exception type and message content."
  [e]
  (cond
    (or (instance? java.net.UnknownHostException e)
        (instance? java.net.UnknownHostException (ex-cause e)))
    "Network error: Unable to reach git repository host"

    (str/includes? (ex-message e) "Authentication failed")
    "Authentication failed: Please check your git credentials"

    (str/includes? (ex-message e) "Repository not found")
    "Repository not found: Please check the repository URL"

    (str/includes? (ex-message e) "branch")
    "Branch error: Please check the specified branch exists"

    :else
    (format "Failed to reload from git repository: %s" (ex-message e))))

(defn- handle-import-exception
  "Handles exceptions that occur during import by logging and returning an error status map.

  If the exception indicates cancellation (has :cancelled? in ex-data), logs an info message and returns nil.
  Otherwise logs the error, increments the failed imports analytics metric, and returns a map with :status :error,
  a user-friendly :message, the source :version, and error :details."
  [e snapshot]
  (if (:cancelled? (ex-data e))
    (log/info "Import from git repository was cancelled")
    (do
      (log/errorf e "Failed to reload from git repository: %s" (ex-message e))
      (analytics/inc! :metabase-remote-sync/imports-failed)
      {:status :error
       :message (source-error-message e)
       :version (source.p/version snapshot)

       :details {:error-type (type e)}})))

(defn import!
  "Imports and reloads Metabase entities from a remote snapshot.

  Takes a SourceSnapshot instance, a RemoteSyncTask ID for progress tracking, and optional keyword arguments:
  - :force? - forces import even when the snapshot version matches the last imported version

  Loads serialized entities, removes entities not in the import, syncs the remote-sync-object table, and
  optionally creates a remote-synced collection.

  Returns a map with :status (either :success or :error), :version, and :message keys. Various exceptions may be
  thrown during import and are caught and converted to error status maps."
  [^SourceSnapshot snapshot task-id & {:keys [force?]}]
  (log/info "Reloading remote entities from the remote source")
  (analytics/inc! :metabase-remote-sync/imports)
  (let [sync-timestamp (t/instant)]
    (if snapshot
      (try
        (let [snapshot-version (source.p/version snapshot)
              last-imported-version (remote-sync.task/last-version)]
          (if (and (not force?) (= last-imported-version snapshot-version))
            (u/prog1 {:status :success
                      :version (source.p/version snapshot)
                      :message (format "Skipping import: snapshot version %s matches last imported version" snapshot-version)}
              (log/infof (:message <>)))
            (let [ingestable-snapshot (->> (source.p/->ingestable snapshot {:path-filters [#"collections/.*" #"databases/.*"]})
                                           (source.ingestable/wrap-progress-ingestable task-id 0.7))
                  load-result (serdes/with-cache
                                (serialization/load-metabase! ingestable-snapshot))
                  seen-paths (:seen load-result)
                  data-model-models #{"Table" "Field"}
                  ;; For standard models (Collection, Card, Segment, etc.), extract entity_id as before
                  imported-entities-by-model (->> seen-paths
                                                  (remove #(data-model-models (:model (last %))))
                                                  (map last)
                                                  (group-by :model)
                                                  (map (fn [[model entities]]
                                                         [model (set (map :id entities))]))
                                                  (into {}))
                  ;; For Tables, capture full path for unique identification
                  ;; Path format: [{:model "Database" :id db-name} {:model "Schema" :id schema}? {:model "Table" :id table-name}]
                  table-paths (->> seen-paths
                                   (filter #(= "Table" (:model (last %))))
                                   (map (fn [path]
                                          {:db_name    (-> path first :id)
                                           :schema     (when (= 3 (count path)) (-> path second :id))
                                           :table_name (-> path last :id)})))
                  ;; For Fields, path format includes Table
                  ;; [{:model "Database"} {:model "Schema"}? {:model "Table"} {:model "Field" :id field-name}]
                  field-paths (->> seen-paths
                                   (filter #(= "Field" (:model (last %))))
                                   (map (fn [path]
                                          (let [table-idx (dec (count path))]
                                            {:db_name    (-> path first :id)
                                             :schema     (when (> (count path) 3) (-> path second :id))
                                             :table_name (-> path (nth (dec table-idx)) :id)
                                             :field_name (-> path last :id)}))))]
              (remote-sync.task/update-progress! task-id 0.8)
              (t2/with-transaction [_conn]
                (remove-unsynced! (all-top-level-remote-synced-collections) imported-entities-by-model)
                (sync-objects! sync-timestamp imported-entities-by-model table-paths field-paths)
                (when (and (nil? (collection/remote-synced-collection)) (= :read-write (settings/remote-sync-type)))
                  (collection/create-remote-synced-collection!)))
              (remote-sync.task/update-progress! task-id 0.95)
              (remote-sync.task/set-version!
               task-id
               (source.p/version snapshot))
              (log/info "Successfully reloaded entities from git repository")
              {:status :success
               :version (source.p/version snapshot)
               :message "Successfully reloaded from git repository"})))
        (catch Exception e
          (handle-import-exception e snapshot))
        (finally
          (analytics/observe! :metabase-remote-sync/import-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))
      {:status :error
       :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."})))

(defn export!
  "Exports remote-synced collections to a remote source repository.

  Takes a SourceSnapshot instance, a RemoteSyncTask ID for progress tracking, and a commit message string. Extracts all
  remote-synced collections, serializes their content, writes the files to the source, and updates all
  RemoteSyncObject statuses to 'synced'.

  Returns a map with :status (either :success or :error), :version, and optionally :message keys. Various
  exceptions may be thrown during export and are caught and converted to error status maps."
  [^SourceSnapshot snapshot task-id message]
  (if snapshot
    (let [sync-timestamp (t/instant)
          collections (t2/select-fn-set :entity_id :model/Collection :is_remote_synced true :location "/")]
      (if (empty? collections)
        {:status :error
         :message "No remote-synced collections available to sync."}
        (try
          (analytics/inc! :metabase-remote-sync/exports)
          (serdes/with-cache
            (let [models (serialization/extract {:targets (mapv #(vector "Collection" %) collections)
                                                 :no-collections false
                                                 :no-data-model true
                                                 :no-settings true
                                                 :no-transforms true
                                                 :include-field-values false
                                                 :include-database-secrets false
                                                 :continue-on-error false
                                                 :skip-archived true})]
              (remote-sync.task/update-progress! task-id 0.3)
              (let [top-level-removed-prefixes (->> (t2/query {:select [:c.entity_id]
                                                               :from [[:collection :c]]
                                                               :join [[:remote_sync_object :rso]
                                                                      [:and [:= :rso.model_type [:inline "Collection"]]
                                                                       [:= :rso.status [:inline "removed"]]
                                                                       [:= :rso.model_id :c.id]]]
                                                               :where [:= :location "/"]})
                                                    (map #(str "collections/" (:entity_id %))))
                    ;; Add removed table paths - join to get db_name + schema in one query
                    removed-table-paths (->> (t2/query {:select [[:t.name :table_name] :t.schema [:db.name :db_name]]
                                                        :from [[:metabase_table :t]]
                                                        :join [[:remote_sync_object :rso]
                                                               [:and [:= :rso.model_type [:inline "Table"]]
                                                                [:= :rso.status [:inline "removed"]]
                                                                [:= :rso.model_id :t.id]]
                                                               [:metabase_database :db]
                                                               [:= :db.id :t.db_id]]})
                                             (map (fn [{:keys [table_name schema db_name]}]
                                                    (str/join "/" (cond-> ["databases" db_name]
                                                                    schema (conj "schemas" schema)
                                                                    true   (conj "tables" table_name))))))
                    ;; Add removed segment paths - join to get all path components in one query
                    ;; Segments use entity_id for path construction
                    removed-segment-paths (->> (t2/query {:select [:s.entity_id
                                                                   [:t.name :table_name]
                                                                   :t.schema
                                                                   [:db.name :db_name]]
                                                          :from [[:segment :s]]
                                                          :join [[:remote_sync_object :rso]
                                                                 [:and [:= :rso.model_type [:inline "Segment"]]
                                                                  [:= :rso.status [:inline "removed"]]
                                                                  [:= :rso.model_id :s.id]]
                                                                 [:metabase_table :t] [:= :t.id :s.table_id]
                                                                 [:metabase_database :db] [:= :db.id :t.db_id]]})
                                               (map (fn [{:keys [entity_id table_name schema db_name]}]
                                                      (str/join "/" (cond-> ["databases" db_name]
                                                                      schema (conj "schemas" schema)
                                                                      true   (conj "tables" table_name "segments" entity_id))))))
                    all-delete-prefixes (concat top-level-removed-prefixes
                                                removed-table-paths
                                                removed-segment-paths)
                    written-version (source/store! models all-delete-prefixes snapshot task-id message)]
                (remote-sync.task/set-version! task-id written-version))
              ;; Delete removed Table/Field/Segment entries (they've been deleted from remote)
              (t2/delete! :model/RemoteSyncObject
                          :model_type [:in ["Table" "Field" "Segment"]]
                          :status "removed")
              (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at sync-timestamp})))
          {:status :success
           :version (source.p/version snapshot)}
          (catch Exception e
            (if (:cancelled? (ex-data e))
              (log/info "Export to git repository was cancelled")
              (do
                (analytics/inc! :metabase-remote-sync/exports-failed)
                (remote-sync.task/fail-sync-task! task-id (ex-message e))
                {:status :error
                 :version (source.p/version snapshot)
                 :message (format "Failed to export to git repository: %s" (ex-message e))})))
          (finally
            (analytics/observe! :metabase-remote-sync/export-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))))
    {:status :error
     :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(defn create-task-with-lock!
  "Takes a cluster-wide lock and either returns an existing in-progress RemoteSyncTask ID or creates a new one.

  Takes a task-type string (either 'import' or 'export'). Returns a RemoteSyncTask with an optional :existing? key.
  If a task is already running, returns (assoc existing-task :existing? true). Otherwise creates a new task and
  returns it."
  [task-type]
  (cluster-lock/with-cluster-lock ::remote-sync-task
    (if-let [task (remote-sync.task/current-task)]
      (assoc task :existing? true)
      (remote-sync.task/create-sync-task! task-type api/*current-user-id*))))

(defn handle-task-result!
  "Handles the outcome of running import! or export! by updating the RemoteSyncTask record.

  Takes a result map with a :status key (either :success or :error) and optional :message key, a RemoteSyncTask ID,
  and an optional branch name. On success, updates the remote-sync-branch setting (if branch provided) and marks the
  task complete. On error, marks the task as failed with the error message. For any other status, marks the task as
  failed with 'Unexpected Error'."
  [result task-id & [branch]]
  (case (:status result)
    :success (t2/with-transaction [_conn]
               (when branch
                 (settings/remote-sync-branch! branch))
               (remote-sync.task/complete-sync-task! task-id))
    :error (remote-sync.task/fail-sync-task! task-id (:message result))
    (remote-sync.task/fail-sync-task! task-id "Unexpected Error")))

(defn- run-async!
  "Executes a remote sync task asynchronously in a virtual thread.

  Takes a task-type string ('import' or 'export'), a branch name to update in settings upon completion, and a
  sync-fn function that takes a task-id and performs the sync operation. Creates a new task (or errors if one is
  already running), then executes the sync function in a virtual thread with a timeout.

  Returns a RemoteSyncTask. Throws ExceptionInfo with status 400 if a sync task is already in progress."
  [task-type branch sync-fn]
  (let [{task-id :id existing? :existing? :as task} (create-task-with-lock! task-type)]
    (api/check-400 (not existing?) "Remote sync in progress")
    (u.jvm/in-virtual-thread*
     (dh/with-timeout {:interrupt? true
                       :timeout-ms (* (settings/remote-sync-task-time-limit-ms) 10)}
       (handle-task-result! (sync-fn task-id) task-id branch)))
    task))

(defn async-import!
  "Imports remote-synced collections from a remote source repository asynchronously.

  Takes a branch name to import from, a force? boolean (if true, imports even if there are unsaved changes), and an
  import-args map of additional arguments to pass to the import function. Checks for dirty changes and throws an
  exception if force? is false and changes exist.

  Returns a RemoteSyncTask. Throws ExceptionInfo with status 400 and :conflicts true if there
  are unsaved changes and force? is false."
  [branch force? import-args]
  (let [source (source/source-from-settings branch)
        has-dirty? (remote-sync.object/dirty-global?)]
    (when (and has-dirty? (not force?))
      (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "import" branch (fn [task-id] (import! (source.p/snapshot source) task-id (assoc import-args :force? force?))))))

(defn async-export!
  "Exports the remote-synced collections to the remote source repository asynchronously.

  Takes a branch name to export to, a force? boolean (if true, exports even if there are new changes in the remote
  branch), and a commit message string. Checks if the remote branch has changed since the last sync and throws an
  exception if force? is false and changes exist.

  Returns a RemoteSyncTask. Throws ExceptionInfo with status 400 and :conflicts true if there
  are new remote changes and force? is false."
  [branch force? message]
  (let [source (source/source-from-settings branch)
        last-task-version (remote-sync.task/last-version)
        snapshot (source.p/snapshot source)
        current-source-version (source.p/version snapshot)]
    (when (and (not force?) (some? last-task-version) (not= last-task-version current-source-version))
      (throw (ex-info "Cannot export changes that will overwrite new changes in the branch."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "export" branch (fn [task-id] (export! snapshot task-id message)))))

(defn finish-remote-config!
  "Based on the current configuration, fill in any missing settings and finalize remote sync setup.

  Will attempt, import the remote collection if no remote-collection exists locally or you are in read-only mode.

  Returns the async-task id if an async task was started, otherwise nil."
  []
  (if (settings/remote-sync-enabled)
    (do
      (when (str/blank? (setting/get :remote-sync-branch))
        (setting/set! :remote-sync-branch (source.p/default-branch (source/source-from-settings))))
      (when (or (nil? (collection/remote-synced-collection)) (= :read-only (settings/remote-sync-type)))
        (:id (async-import! (settings/remote-sync-branch) true {}))))
    (u/prog1 nil
      (collection/clear-remote-synced-collection!))))
