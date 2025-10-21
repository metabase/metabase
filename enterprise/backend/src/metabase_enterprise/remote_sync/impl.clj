(ns metabase-enterprise.remote-sync.impl
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.ingestable :as source.ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.analytics.core :as analytics]
   [metabase.collections.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- affected-collections
  "Get all collections that are descendants of those in the sync and the ones synced"
  []
  ;; Otherwise get all remote-synced collections
  (t2/select-pks-vec :model/Collection :type "remote-synced"))

(defn sync-objects!
  "Populate the remote-sync-object table with imported entities.

  Args:
    timestamp: The instant timestamp when the sync occurred.
    imported-entities: A map where keys are model names (strings) and values are sets of entity IDs that were imported.

  Returns:
    The result of inserting RemoteSyncObject records into the database."
  [timestamp imported-entities]
  (t2/delete! :model/RemoteSyncObject)
  (let [inserts (->> imported-entities
                     (mapcat (fn [[model entity-ids]]
                               (t2/select [(keyword "model" model) :id] :entity_id [:in entity-ids])))
                     (map (fn [{:keys [id] :as model}]
                            {:model_type (name (t2/model model))
                             :model_id id
                             :status "synced"
                             :status_changed_at timestamp})))]
    (t2/insert! :model/RemoteSyncObject inserts)))

(defn- clean-synced!
  "Delete any remote sync content that was NOT part of the import"
  [synced-collection-ids imported-entities]
  (when (seq synced-collection-ids)
    (doseq [model [:model/Collection
                   :model/Card
                   :model/Dashboard
                   :model/NativeQuerySnippet
                   :model/Timeline
                   :model/Document]
            :let [serdes-model (name model)
                  entity-ids (get imported-entities serdes-model [])]]
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

(defn- handle-import-exception
  [e source-ingestable]
  (if (:cancelled? (ex-data e))
    (log/info "Import from git repository was cancelled")
    (do
      (log/errorf e "Failed to reload from git repository: %s" (ex-message e))
      (analytics/inc! :metabase-remote-sync/imports-failed)
      (let [error-msg (cond
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
                        (format "Failed to reload from git repository: %s" (ex-message e)))]
        {:status        :error
         :message       error-msg
         :version       (source.ingestable/ingestable-version source-ingestable)

         :details {:error-type (type e)}}))))

(defn import!
  "Import and reload Metabase entities from a remote source.

  Args:
    ingestable-source: An IngestableSource instance providing access to serialized entities.
    task-id: The RemoteSyncTask identifier used to track progress updates.
    create-collection?: (Optional keyword arg) If true, creates a remote-synced collection if one doesn't exist.

  Returns:
    A map with :status, :version, and :message keys describing the import result.
    Status can be :success or :error.

  Raises:
    Exception: Various exceptions may be thrown during import and are caught and converted to error status maps."
  [ingestable-source task-id & {:keys [create-collection?]}]
  (log/info "Reloading remote entities from the remote source")
  (analytics/inc! :metabase-remote-sync/imports)
  (let [sync-timestamp (t/instant)]
    (if ingestable-source
      (try
        (let [ingestable-source (source.ingestable/wrap-progress-ingestable task-id 0.7 ingestable-source)
              load-result (serdes/with-cache
                            (serialization/load-metabase! ingestable-source))
              imported-entities (->> (:seen load-result)
                                     (map last) ; Get the last element of each path (the entity itself)
                                     (group-by :model)
                                     (map (fn [[model entities]]
                                            [model (set (map :id entities))]))
                                     (into {}))]
          (remote-sync.task/update-progress! task-id 0.8)
          (t2/with-transaction [_conn]
            (clean-synced! (affected-collections) imported-entities)
            (sync-objects! sync-timestamp imported-entities)
            (when (and create-collection? (nil? (collection/remote-synced-collection)))
              (collection/create-remote-synced-collection!)))
          (remote-sync.task/update-progress! task-id 0.95))
        (remote-sync.task/set-version!
         task-id
         (source.ingestable/ingestable-version ingestable-source))
        (log/info "Successfully reloaded entities from git repository")
        {:status  :success
         :version (source.ingestable/ingestable-version ingestable-source)
         :message "Successfully reloaded from git repository"}

        (catch Exception e
          (handle-import-exception e ingestable-source))
        (finally
          (analytics/observe! :metabase-remote-sync/import-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))
      {:status  :error
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
        {:status  :error
         :message "No remote-synced collections available to sync."}
        (try
          (analytics/inc! :metabase-remote-sync/exports)
          (serdes/with-cache
            (let [models (serialization/extract {:targets                  (mapv #(vector "Collection" %) collections)
                                                 :no-collections           false
                                                 :no-data-model            true
                                                 :no-settings              true
                                                 :no-transforms            true
                                                 :include-field-values     false
                                                 :include-database-secrets false
                                                 :continue-on-error        false
                                                 :skip-archived            true})]
              (remote-sync.task/update-progress! task-id 0.3)
              (source/store! models source task-id message)
              (remote-sync.task/set-version! task-id (source.p/version source))
              (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at sync-timestamp})))
          {:status :success
           :version       (source.p/version source)}

          (catch Exception e
            (if (:cancelled? (ex-data e))
              (log/info "Export to git repository was cancelled")
              (do
                (analytics/inc! :metabase-remote-sync/imports-failed)
                (remote-sync.task/fail-sync-task! task-id (ex-message e))
                {:status  :error
                 :version       (source.p/version source)

                 :message (format "Failed to export to git repository: %s" (ex-message e))})))
          (finally
            (analytics/observe! :metabase-remote-sync/export-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))))
    {:status  :error
     :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(def cluster-lock
  "Shared cluster lock name for remote-sync tasks"
  ::remote-sync-task)
