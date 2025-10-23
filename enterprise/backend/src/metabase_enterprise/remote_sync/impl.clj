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
  "Returns a vector of primary keys for all top-level remote-synced collections."
  []
  (t2/select-pks-vec :model/Collection :type "remote-synced"))

(defn- sync-objects!
  "Populates the remote-sync-object table with imported entities. Deletes all existing RemoteSyncObject records and
  inserts new ones for each imported entity, marking them as 'synced' with the given timestamp.

  Takes a timestamp instant and a map of imported entities grouped by model name, where each model maps to a set of
  entity IDs that were imported."
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
  "Imports and reloads Metabase entities from a remote source.

  Takes a Source instance, a RemoteSyncTask ID for progress tracking, and optional keyword arguments:
  - :create-collection? - creates a remote-synced collection if none exists
  - :force? - forces import even when the source version matches the last imported version

  Loads serialized entities, removes entities not in the import, syncs the remote-sync-object table, and
  optionally creates a remote-synced collection.

  Returns a map with :status (either :success or :error), :version, and :message keys. Various exceptions may be
  thrown during import and are caught and converted to error status maps."
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
  "Exports remote-synced collections to a remote source repository.

  Takes a Source instance, a RemoteSyncTask ID for progress tracking, and a commit message string. Extracts all
  remote-synced collections, serializes their content, writes the files to the source, and updates all
  RemoteSyncObject statuses to 'synced'.

  Returns a map with :status (either :success or :error), :version, and optionally :message keys. Various
  exceptions may be thrown during export and are caught and converted to error status maps."
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
  "Takes a cluster-wide lock and either returns an existing in-progress RemoteSyncTask ID or creates a new one.

  Takes a task-type string (either 'import' or 'export'). Returns a map with :id and optionally :existing? keys.
  If a task is already running, returns {:existing? true :id <existing-task-id>}. Otherwise creates a new task and
  returns {:id <new-task-id>}."
  [task-type]
  (cluster-lock/with-cluster-lock cluster-lock
    (if-let [{id :id} (remote-sync.task/current-task)]
      {:existing? true :id id}
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

  Returns the task ID. Throws ExceptionInfo with status 400 if a sync task is already in progress."
  [task-type branch sync-fn]
  (let [{task-id :id existing? :existing?} (create-task-with-lock! task-type)]
    (api/check-400 (not existing?) "Remote sync in progress")
    (u.jvm/in-virtual-thread*
     (dh/with-timeout {:interrupt? true
                       :timeout-ms (* (settings/remote-sync-task-time-limit-ms) 10)}
       (handle-task-result! (sync-fn task-id) task-id branch)))
    task-id))

(defn async-import!
  "Imports remote-synced collections from a remote source repository asynchronously.

  Takes a branch name to import from, a force? boolean (if true, imports even if there are unsaved changes), and an
  import-args map of additional arguments to pass to the import function. Checks for dirty changes and throws an
  exception if force? is false and changes exist.

  Returns the task ID of the created import task. Throws ExceptionInfo with status 400 and :conflicts true if there
  are unsaved changes and force? is false."
  [branch force? import-args]
  (let [source (source/source-from-settings branch)
        has-dirty? (remote-sync.object/dirty-global?)]
    (when (and has-dirty? (not force?))
      (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "import" branch (fn [task-id] (import! source task-id (assoc import-args :force? force?))))))

(defn async-export!
  "Exports the remote-synced collections to the remote source repository asynchronously.

  Takes a branch name to export to, a force? boolean (if true, exports even if there are new changes in the remote
  branch), and a commit message string. Checks if the remote branch has changed since the last sync and throws an
  exception if force? is false and changes exist.

  Returns the task ID of the created export task. Throws ExceptionInfo with status 400 and :conflicts true if there
  are new remote changes and force? is false."
  [branch force? message]
  (let [source (source/source-from-settings branch)
        last-task-version (remote-sync.task/last-version)
        current-source-version (source.p/version source)]
    (when (and (not force?) (some? last-task-version) (not= last-task-version current-source-version))
      (throw (ex-info "Cannot export changes that will overwrite new changes in the branch."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "export" branch (fn [task-id] (export! source task-id message)))))
