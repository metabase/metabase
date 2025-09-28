(ns metabase-enterprise.remote-sync.impl
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.events :as lib.events]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- affected-collections
  "Get all collections that are descendants of those in the sync and the ones synced"
  [collections]
  (if (seq collections)
    (let [col-models (t2/select :model/Collection :entity_id [:in collections])]
      (concat (map :id col-models)
              (mapcat collection/collection->descendant-ids col-models)))
              ;; Otherwise get all remote-synced collections
    (t2/select-pks-vec :model/Collection :type "remote-synced")))

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
  [e collections sync-timestamp branch]
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
    (if (seq collections)
      (doseq [collection collections]
        (lib.events/publish-remote-sync! "import" nil api/*current-user-id*
                                         {:source-branch branch
                                          :collection-id collection
                                          :timestamp sync-timestamp
                                          :status  "error"
                                          :message (ex-message e)}))
      (lib.events/publish-remote-sync! "import" nil api/*current-user-id*
                                       {:source-branch branch
                                        :timestamp sync-timestamp
                                        :status  "error"
                                        :message (ex-message e)}))
    {:status  :error
     :message error-msg
     :details {:error-type (type e)}}))

(defn import!
  "Reloads the Metabase entities from the git repo"
  [source task-id branch & [collections]]
  (log/info "Reloading remote entities from the remote source")
  (analytics/inc! :metabase-remote-sync/imports)
  (let [sync-timestamp (t/instant)]
    (if source
      (try
        ;; Load all entities from Git first - this handles creates/updates via entity_id matching
        (let [load-result (u/prog1 (serdes/with-cache
                                     (->> (cond-> {:task-id task-id}
                                            (seq collections) (assoc :root-dependencies (map #(vector {:id % :model "Collection"}) collections)
                                                                     :path-filters (map #(re-pattern (str "collections/" % ".*")) collections))
                                            (empty? collections) (assoc :path-filters [#"collections/.*"]))
                                          (source.p/->ingestable source)
                                          serialization/load-metabase!)))
              ;; Extract entity_ids by model from the :seen paths
              imported-entities (->> (:seen load-result)
                                     (map last) ; Get the last element of each path (the entity itself)
                                     (group-by :model)
                                     (map (fn [[model entities]]
                                            [model (set (map :id entities))]))
                                     (into {}))]

          (remote-sync.task/update-progress! task-id 0.8)
          (clean-synced! (affected-collections collections) imported-entities)
          (remote-sync.task/update-progress! task-id 0.9)
          (let [collection-entity-ids (get imported-entities "Collection")
                root-collections (when (seq collection-entity-ids)
                                   (t2/select :model/Collection :entity_id [:in collection-entity-ids] :location "/"))]
            (doseq [{:keys [entity_id]} root-collections]
              (lib.events/publish-remote-sync! "import" nil api/*current-user-id*
                                               {:source-branch branch
                                                :collection-id entity_id
                                                :timestamp sync-timestamp
                                                :status "success"}))))
        (log/info "Successfully reloaded entities from git repository")
        {:status  :success
         :message "Successfully reloaded from git repository"}

        (catch Exception e
          (handle-import-exception e collections sync-timestamp branch))
        (finally
          (analytics/observe! :metabase-remote-sync/import-duration-ms (u/since-ms sync-timestamp))))
      {:status  :error
       :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."})))

(defn export!
  "Exports the synced collections to the source repo"
  ([source task-id branch message]
   (export! source task-id branch message nil))
  ([source task-id branch message collections]
   (if source
     (let [sync-timestamp (t/instant)
           collections (or (seq collections) (t2/select-fn-set :entity_id :model/Collection :type "remote-synced" :location "/"))]
       (analytics/inc! :metabase-remote-sync/exports)
       (try
         (serdes/with-cache
           (let [models (serialization/extract {:targets                  (mapv #(vector "Collection" %) collections)
                                                :no-collections           false
                                                :no-data-model            true
                                                :no-settings              true
                                                :no-transforms            true
                                                :include-field-values     :false
                                                :include-database-secrets :false
                                                :continue-on-error        false})]
             (remote-sync.task/update-progress! task-id 0.3)
             (source/store! models source task-id message))
           (doseq [collection collections]
             (lib.events/publish-remote-sync! "export" nil api/*current-user-id*
                                              {:target-branch branch
                                               :collection-id collection
                                               :status  "success"
                                               :message message})))
         {:status :success}

         (catch Exception e
           (analytics/inc! :metabase-remote-sync/imports-failed)
           (remote-sync.task/fail-sync-task! task-id (ex-message e))
           (doseq [collection collections]
             (lib.events/publish-remote-sync! "export" nil api/*current-user-id*
                                              {:target-branch  branch
                                               :collection-id collection
                                               :status  "error"
                                               :message (ex-message e)}))
           {:status  :error
            :message (format "Failed to export to git repository: %s" (ex-message e))})
         (finally
           (analytics/observe! :metabase-remote-sync/export-duration-ms (u/since-ms sync-timestamp)))))
     {:status  :error
      :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."})))

(def cluster-lock
  "Shared cluster lock name for remote-sync tasks"
  ::remote-sync-task)
