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
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- affected-collections
  "Get all collections that are descendants of those in the sync and the ones synced"
  []
  ;; Otherwise get all remote-synced collections
  (t2/select-pks-vec :model/Collection :type "remote-synced"))

(defn sync-objects!
  "Setup the remote-sync-object table with the imported-entities"
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
  "Reloads the Metabase entities from the git repo"
  [ingestable-source task-id]
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
            (sync-objects! sync-timestamp imported-entities))
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
  "Exports the synced collections to the source repo"
  [source task-id message]
  (if source
    (let [sync-timestamp (t/instant)
          collections (t2/select-fn-set :entity_id :model/Collection :type "remote-synced" :location "/")]
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
          (analytics/observe! :metabase-remote-sync/export-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis)))))
    {:status  :error
     :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(def cluster-lock
  "Shared cluster lock name for remote-sync tasks"
  ::remote-sync-task)
