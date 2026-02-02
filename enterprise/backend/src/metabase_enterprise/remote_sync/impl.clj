(ns metabase-enterprise.remote-sync.impl
  (:require
   [clojure.string :as str]
   [diehard.core :as dh]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.ingestable :as source.ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
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

(defn- snapshot-has-transforms?
  "Checks if the snapshot contains any Transform, TransformTag, or PythonLibrary entities.
   Used to auto-enable remote-sync-transforms setting during import.

   Uses the ingestable to list all entities and checks their :model metadata."
  [ingestable]
  (let [serdes-paths (serialization/ingest-list ingestable)
        models-present (spec/models-in-import serdes-paths)]
    (some spec/transform-models models-present)))

(defn- sync-objects!
  "Populates the remote-sync-object table with imported entities. Deletes all existing RemoteSyncObject records and
  inserts new ones for each imported entity, marking them as 'synced' with the given timestamp.

  Takes a timestamp instant and imported-data map from spec/extract-imported-entities.

  Uses the spec system to determine how to query and build sync objects for each model type."
  [timestamp imported-data]
  (t2/delete! :model/RemoteSyncObject)
  (let [all-inserts (spec/sync-all-entities! timestamp imported-data)]
    (when (seq all-inserts)
      (t2/insert! :model/RemoteSyncObject all-inserts))))

(defn- remove-unsynced!
  "Deletes any remote sync content that was NOT part of the import.

  Takes a sequence of remote-synced collection IDs and imported-data map from spec/extract-imported-entities.
  For each entity-id based model, deletes entities whose entity_id is not in the imported set.

  Models with :scope-key in their spec are scoped to synced collections (using :id for Collection, :collection_id
  for others). Models without :scope-key (like TransformTag) are deleted globally by entity_id.

  Path-based models (Table, Field) are not removed here - they are controlled by published table settings.

  Uses specs-for-deletion to process models in dependency order (models with FK references to
  Collection are deleted before Collection itself)."
  [synced-collection-ids {:keys [by-entity-id]}]
  (doseq [[model-key model-spec] (spec/specs-for-deletion)
          :let [serdes-model (:model-type model-spec)
                entity-ids (get by-entity-id serdes-model [])
                entity-id-clause (if (seq entity-ids)
                                   [:not-in entity-ids]
                                   :entity_id)
                scope-key (get-in model-spec [:removal :scope-key])
                extra-conditions (into [] cat (:conditions model-spec))]]
    (if scope-key
      ;; Collection-scoped: delete only within synced collections
      (when (seq synced-collection-ids)
        (apply t2/delete! model-key
               scope-key [:in synced-collection-ids]
               :entity_id entity-id-clause
               extra-conditions))
      ;; Global: delete by entity_id only
      (apply t2/delete! model-key
             :entity_id entity-id-clause
             extra-conditions))))

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

    (some-> e ex-cause ex-message (str/includes? "Can't create a tenant collection without tenants enabled"))
    "This repository contains tenant collections, but the tenants feature is disabled on your instance."

    (str/includes? (ex-message e) "Missing commit")
    "Repository cache is stale: the remote repository may have been force-pushed. Please retry the operation."

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

(defn- get-conflicts
  "Detects conflicts that would prevent or complicate import.
   Returns a map with :conflicts (detailed list) and :summary (set of category names).

   Conflict types detected:
   - :entity-id-conflict - Items with existing entity IDs that are NOT already synced
   - :library-conflict - First import only, local Library exists, import has Library
   - :transforms-not-enabled - Import has Transform/TransformTag/PythonLibrary, setting disabled
   - :snippets-without-library - Import has NativeQuerySnippet, Library not remote-synced"
  [ingestable first-import?]
  (let [ingest-list (serialization/ingest-list ingestable)
        imported-data (spec/extract-imported-entities ingest-list)
        models-present (spec/models-in-import ingest-list)
        ;; TODO (epaget 2026-02-02) -- entity-id conflict checking (detect unsynced local entities with matching entity_ids)
        feature-conflicts (spec/check-feature-conflicts models-present)
        library-conflict (when-let [local-library (t2/select-one :model/Collection :type collection/library-collection-type)]
                           (when (and first-import?
                                      (contains? (get-in imported-data [:by-entity-id "Collection"] #{})
                                                 collection/library-entity-id)
                                      (not (t2/exists? :model/RemoteSyncObject
                                                       :model_type "Collection"
                                                       :model_id (:id local-library))))
                             {:type :library-conflict
                              :category "Library"
                              :message "Import contains Library but local instance has an unsynced Library collection"}))
        all-conflicts (concat
                       feature-conflicts
                       (when library-conflict [library-conflict]))]
    {:conflicts (vec all-conflicts)
     :summary (into #{} (map :category) all-conflicts)}))

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
              last-imported-version (remote-sync.task/last-version)
              first-import? (nil? last-imported-version)
              path-filters [#"collections/.*" #"databases/.*" #"actions/.*"
                            #"transforms/.*" #"python-libraries/.*" #"snippets/.*"]
              base-ingestable (source.p/->ingestable snapshot {:path-filters path-filters})
              has-transforms? (snapshot-has-transforms? base-ingestable)
              {:keys [conflicts summary]} (get-conflicts base-ingestable first-import?)
              ingestable-snapshot (source.ingestable/wrap-progress-ingestable task-id 0.7 base-ingestable)]

          (cond
            (and first-import? (not force?) (seq conflicts))
            (u/prog1 {:status :conflict
                      :version (source.p/version snapshot)
                      :conflicts summary  ; Keep backward compatibility: return set of category names
                      :conflict-details conflicts  ; New: detailed conflict info
                      :message (format "Skipping import: snapshot version %s contains conflicts use force to override" snapshot-version)}
              (log/infof (:message <>)))

            (and (not force?) (= last-imported-version snapshot-version))
            (u/prog1 {:status :success
                      :version (source.p/version snapshot)
                      :message (format "Skipping import: snapshot version %s matches last imported version" snapshot-version)}
              (log/infof (:message <>)))

            :else
            (let [load-result (serdes/with-cache
                                (serialization/load-metabase! ingestable-snapshot))
                  seen-paths (:seen load-result)
                  imported-data (spec/extract-imported-entities seen-paths)]
              (remote-sync.task/update-progress! task-id 0.8)
              (when (and has-transforms?
                         (not (settings/remote-sync-transforms)))
                (log/info "Detected transforms in remote source, enabling remote-sync-transforms setting")
                (settings/remote-sync-transforms! true))
              (t2/with-transaction [_conn]
                (remove-unsynced! (spec/all-syncable-collection-ids) imported-data)
                (sync-objects! sync-timestamp imported-data))
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
    (let [sync-timestamp (t/instant)]
      (try
        (analytics/inc! :metabase-remote-sync/exports)
        (serdes/with-cache
          (if-let [models (spec/extract-entities-for-export)]
            (do
              (remote-sync.task/update-progress! task-id 0.3)
              (let [all-delete-prefixes (spec/build-all-removal-paths)
                    written-version (source/store! models all-delete-prefixes snapshot task-id message)]
                (remote-sync.task/set-version! task-id written-version))
              (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at sync-timestamp})
              {:status :success
               :version (source.p/version snapshot)})
            {:status :error
             :message "No remote-syncable content available."}))
        (catch Exception e
          (if (:cancelled? (ex-data e))
            (log/info "Export to git repository was cancelled")
            (do
              (log/errorf e "Failed to export to git repository: %s" (ex-message e))
              (analytics/inc! :metabase-remote-sync/exports-failed)
              (remote-sync.task/fail-sync-task! task-id (ex-message e))
              {:status :error
               :version (source.p/version snapshot)
               :message (format "Failed to export to git repository: %s" (ex-message e))})))
        (finally
          (analytics/observe! :metabase-remote-sync/export-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis)))))
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

;;; ------------------------------------------- Remote Changes Check -------------------------------------------

(def ^:private remote-changes-cache
  "Cache for remote changes check to avoid frequent git operations.
   Structure: {:last-checked <instant>
               :branch <branch-name>
               :remote-version <git-sha>
               :local-version <git-sha or nil>
               :has-changes? <boolean>}"
  (atom nil))

(defn invalidate-remote-changes-cache!
  "Invalidate the remote changes cache. Call this after import/export."
  []
  (reset! remote-changes-cache nil))

(defn- cache-expired?
  "Check if the cache has expired based on TTL setting."
  [last-checked]
  (let [ttl-seconds (settings/remote-sync-check-changes-cache-ttl-seconds)
        expiry-time (t/plus last-checked (t/seconds ttl-seconds))]
    (t/after? (t/instant) expiry-time)))

(defn has-remote-changes?
  "Check if remote has new changes compared to last imported version.
   Uses cache to avoid frequent git operations. Returns map with:
   - :has-changes? boolean
   - :remote-version string (git SHA)
   - :local-version string (git SHA of last import, or nil)
   - :cached? boolean (whether result came from cache)

   Cache is invalidated if:
   - TTL has expired
   - Branch setting has changed
   - force-refresh? is true"
  ([]
   (has-remote-changes? nil))
  ([{:keys [force-refresh?]}]
   (let [cache-state @remote-changes-cache
         current-branch (settings/remote-sync-branch)
         cache-valid? (and cache-state
                           (not force-refresh?)
                           (= current-branch (:branch cache-state))
                           (not (cache-expired? (:last-checked cache-state))))]
     (if cache-valid?
       (assoc cache-state :cached? true)
       (let [last-imported (remote-sync.task/last-version)
             source (source/source-from-settings current-branch)
             snapshot (source.p/snapshot source)
             current-remote (source.p/version snapshot)
             ;; has-changes? is true if:
             ;; - never imported (last-imported is nil), OR
             ;; - remote version differs from local version
             has-changes? (or (nil? last-imported)
                              (not= last-imported current-remote))
             result {:last-checked (t/instant)
                     :branch current-branch
                     :remote-version current-remote
                     :local-version last-imported
                     :has-changes? has-changes?}]
         (reset! remote-changes-cache result)
         (assoc result :cached? false))))))

;;; ------------------------------------------- Task Result Handling -------------------------------------------

(defn handle-task-result!
  "Handles the outcome of running import! or export! by updating the RemoteSyncTask record.

  Takes a result map with a :status key (either :success, :conflict, or :error) and optional :message key, a
  RemoteSyncTask ID, and an optional branch name. On success, updates the remote-sync-branch setting (if branch
  provided), marks the task complete, and invalidates the remote changes cache. On conflict, sets the version and
  stores the conflicts. On error, marks the task as failed with the error message. For any other status, marks the
  task as failed with 'Unexpected Error'."
  [result task-id & [branch]]
  (case (:status result)
    :success (do
               (t2/with-transaction [_conn]
                 (when branch
                   (settings/remote-sync-branch! branch))
                 (remote-sync.task/complete-sync-task! task-id))
               (invalidate-remote-changes-cache!))
    :conflict (do
                (remote-sync.task/set-version! task-id (:version result))
                (remote-sync.task/conflict-sync-task! task-id (:conflicts result)))
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
       (handle-task-result!
        (try
          (sync-fn task-id)
          (catch Exception e
            (log/error e "Remote sync task failed")
            {:status :error
             :message (source-error-message e)}))
        task-id branch)))
    task))

(defn async-import!
  "Imports remote-synced collections from a remote source repository asynchronously.

  Takes a branch name to import from, a force? boolean (if true, imports even if there are unsaved changes or conflicts),
  and an import-args map of additional arguments to pass to the import function.

  Returns a RemoteSyncTask."
  [branch force? import-args]
  (let [source (source/source-from-settings branch)]
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
      (when (= :read-only (settings/remote-sync-type))
        (:id (async-import! (settings/remote-sync-branch) true {}))))
    (u/prog1 nil
      (collection/clear-remote-synced-collection!))))
