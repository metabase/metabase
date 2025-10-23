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
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- all-top-level-remote-synced-collections
  "Get all top-level remote-synced collections.

  Returns:
    A vector of primary keys for all top-level remote-synced collections."
  []
  (t2/select-pks-vec :model/Collection :type "remote-synced"))

(defn- sync-objects!
  "Populate the remote-sync-object table with imported entities.

  Args:
    timestamp: The instant timestamp when the sync occurred.
    imported-entities-by-model: A map where keys are model names (strings) and values are sets of entity IDs that were imported.

  Returns:
    The result of inserting RemoteSyncObject records into the database."
  [timestamp imported-entities-by-model]
  (t2/delete! :model/RemoteSyncObject)
  (let [inserts (->> imported-entities-by-model
                     (mapcat (fn [[model entity-ids]]
                               (t2/select [(keyword "model" model) :id] :entity_id [:in entity-ids])))
                     (map (fn [{:keys [id] :as model}]
                            {:model_type (name (t2/model model))
                             :model_id id
                             :status "synced"
                             :status_changed_at timestamp})))]
    (t2/insert! :model/RemoteSyncObject inserts)))

(defn- remove-unsynced!
  "Delete any remote sync content that was NOT part of the import.

  Args:
    synced-collection-ids: A sequence of collection IDs that are remote-synced.
    imported-entities-by-model: A map where keys are model names (strings) and values are sets of entity IDs that were imported."
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
  "Handle constructing sensible messages for errors from remote sync sources.

  Args:
    e: A Throwable exception from a remote sync operation.

  Returns:
    A string error message suitable for display to users."
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
  "Handle exceptions that occur during import by logging and returning an error status map.

  Args:
    e: The exception that was thrown during import.
    source: The remote source where the import was attempted.

  Returns:
    A map with :status, :message, :version, and :details keys describing the import failure.
    If the exception indicates cancellation, logs an info message and returns without a map."
  [e source]
  (if (:cancelled? (ex-data e))
    (log/info "Import from git repository was cancelled")
    (do
      (log/errorf e "Failed to reload from git repository: %s" (ex-message e))
      (analytics/inc! :metabase-remote-sync/imports-failed)
      {:status :error
       :message (source-error-message e)
       :version (source.p/version source)

       :details {:error-type (type e)}})))

(defn import!
  "Import and reload Metabase entities from a remote source.

  Args:
    source: A Source instance providing access to serialized entities.
    task-id: The RemoteSyncTask identifier used to track progress updates.
    create-collection?: (Optional keyword arg) If true, creates a remote-synced collection if one doesn't exist.
    force?: (Optional keyword arg) If true, forces the import even when the source version matches the last imported version.

  Returns:
    A map with :status, :version, and :message keys describing the import result.
    Status can be :success or :error.

  Raises:
    Exception: Various exceptions may be thrown during import and are caught and converted to error status maps."
  [source task-id & {:keys [create-collection? force?]}]
  (log/info "Reloading remote entities from the remote source")
  (analytics/inc! :metabase-remote-sync/imports)
  (let [sync-timestamp (t/instant)]
    (if source
      (try
        (let [source-version (source.p/version source)
              last-imported-version (remote-sync.task/last-import-version)]
          (if (and (not force?) (= last-imported-version source-version))
            (u/prog1 {:status :success
                      :version (source.p/version source)
                      :message (format "Skipping import: source version %s matches last imported version" source-version)}
              (log/infof (:message <>)))
            (let [ingestable-source (->> (source.p/->ingestable source {:path-filters [#"collections/.*"]})
                                         (source.ingestable/wrap-progress-ingestable task-id 0.7))
                  load-result (serdes/with-cache
                                (serialization/load-metabase! ingestable-source))
                  imported-entities-by-model (->> (:seen load-result)
                                                  (map last) ; Get the last element of each path (the entity itself)
                                                  (group-by :model)
                                                  (map (fn [[model entities]]
                                                         [model (set (map :id entities))]))
                                                  (into {}))]
              (remote-sync.task/update-progress! task-id 0.8)
              (t2/with-transaction [_conn]
                (remove-unsynced! (all-top-level-remote-synced-collections) imported-entities-by-model)
                (sync-objects! sync-timestamp imported-entities-by-model)
                (when (and create-collection? (nil? (collection/remote-synced-collection)))
                  (collection/create-remote-synced-collection!)))
              (remote-sync.task/update-progress! task-id 0.95)
              (remote-sync.task/set-version!
               task-id
               (source.p/version source))
              (log/info "Successfully reloaded entities from git repository")
              {:status :success
               :version (source.p/version source)
               :message "Successfully reloaded from git repository"})))
        (catch Exception e
          (handle-import-exception e source))
        (finally
          (analytics/observe! :metabase-remote-sync/import-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))
      {:status :error
       :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."})))

(defn export!
  "Export remote-synced collections to a remote source repository.

  Args:
    source: The remote source implementing the Source protocol where files will be written.
    task-id: The RemoteSyncTask identifier used to track progress updates.
    message: The commit message to use when writing files to the source.

  Returns:
    A map with :status, :version, and :message keys describing the export result.
    Status can be :success or :error.

  Raises:
    Exception: Various exceptions may be thrown during export and are caught and converted to error status maps."
  [source task-id message]
  (if source
    (let [sync-timestamp (t/instant)
          collections (t2/select-fn-set :entity_id :model/Collection :type "remote-synced" :location "/")]
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
              (source/store! models source task-id message)
              (remote-sync.task/set-version! task-id (source.p/version source))
              (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at sync-timestamp})))
          {:status :success
           :version (source.p/version source)}
          (catch Exception e
            (if (:cancelled? (ex-data e))
              (log/info "Export to git repository was cancelled")
              (do
                (analytics/inc! :metabase-remote-sync/exports-failed)
                (remote-sync.task/fail-sync-task! task-id (ex-message e))
                {:status :error
                 :version (source.p/version source)
                 :message (format "Failed to export to git repository: %s" (ex-message e))})))
          (finally
            (analytics/observe! :metabase-remote-sync/export-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))))
    {:status :error
     :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(def cluster-lock
  "Shared cluster lock name for remote-sync tasks"
  ::remote-sync-task)

(defn create-task-with-lock!
  "Take a cluster-wide lock to return either a new RemoteSyncTask id or an existing in-progress task id.

  Args:
    task-type: The type of sync task to create, either 'import' or 'export'.

  Returns:
    A map with :id and optionally :existing? keys. If a task is already running, returns {:existing? true :id <existing-task-id>}.
    Otherwise creates a new task and returns {:id <new-task-id>}."
  [task-type]
  (cluster-lock/with-cluster-lock cluster-lock
    (if-let [{id :id} (remote-sync.task/current-task)]
      {:existing? true :id id}
      (remote-sync.task/create-sync-task! task-type api/*current-user-id*))))

(defn handle-task-result!
  "Handle the outcome of running import! or export! updating the RemoteSyncTask object tracking it with the outcome.

  Args:
    result: A map with :status key (either :success or :error) and optional :message key.
    task-id: The RemoteSyncTask identifier to update.
    branch: (Optional) The branch name to update in settings upon successful completion. "
  [result task-id & [branch]]
  (case (:status result)
    :success (t2/with-transaction [_conn]
               (when branch
                 (settings/remote-sync-branch! branch))
               (remote-sync.task/complete-sync-task! task-id))
    :error (remote-sync.task/fail-sync-task! task-id (:message result))
    (remote-sync.task/fail-sync-task! task-id "Unexpected Error")))

(defn- run-async!
  "Execute a remote sync task asynchronously in a virtual thread.

  Args:
    task-type: The type of task to run, either 'import' or 'export'.
    branch: The branch name to update in settings upon successful completion.
    sync-fn: A function that takes a task-id and performs the sync operation, returning a status map.

  Returns:
    The task ID of the created sync task.

  Raises:
    ExceptionInfo: If a sync task is already in progress (status 400)."
  [task-type branch sync-fn]
  (let [{task-id :id existing? :existing?} (create-task-with-lock! task-type)]
    (api/check-400 (not existing?) "Remote sync in progress")
    (u.jvm/in-virtual-thread*
     (dh/with-timeout {:interrupt? true
                       :timeout-ms (* (settings/remote-sync-task-time-limit-ms) 10)}
       (handle-task-result! (sync-fn task-id) task-id branch)))
    task-id))

(defn async-import!
  "Import remote-synced collections from a remote source repository asynchronously.

  Args:
    branch: The branch name to import from and update in settings upon success.
    force?: If true, proceed with import even if there are dirty (unsaved) changes.
    import-args: Additional arguments to pass to the import function.

  Returns:
    The task ID of the created import task.

  Raises:
    ExceptionInfo: If there are unsaved changes and force? is false (status 400, with :conflicts true in ex-data)."
  [branch force? import-args]
  (let [source (source/source-from-settings branch)
        has-dirty? (remote-sync.object/dirty-global?)]
    (when (and has-dirty? (not force?))
      (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "import" branch (fn [task-id] (import! source task-id (assoc import-args :force? force?))))))

(defn async-export!
  "Export the remote-synced collections to the remote source repository asynchronously.

  Args:
    branch: The branch name to export to and update in settings upon success.
    force?: If true, proceed with export even if there are new changes in the remote branch.
    message: The commit message to use when writing files to the source.

  Returns:
    The task ID of the created export task.

  Raises:
    ExceptionInfo: If there are new remote changes and force? is false (status 400, with :conflicts true in ex-data)."
  [branch force? message]
  (let [source (source/source-from-settings branch)
        last-task-version (remote-sync.task/last-version)
        current-source-version (source.p/version source)]
    (when (and (not force?) (some? last-task-version) (not= last-task-version current-source-version))
      (throw (ex-info "Cannot export changes that will overwrite new changes in the branch."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "export" branch (fn [task-id] (export! source task-id message)))))
