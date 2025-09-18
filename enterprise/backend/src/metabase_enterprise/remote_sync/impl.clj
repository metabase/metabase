(ns metabase-enterprise.remote-sync.impl
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.events :as lib.events]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.v2.extract :as v2.extract]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn import!
  "Reloads the Metabase entities from the git repo"
  [branch & [collections]]
  (log/info "Reloading remote entities from the remote source")
  (if-let [source (source/source-from-settings)]
    (let [remote-sync-collection (t2/select-one :model/Collection :entity_id collection/library-entity-id)]
      (try
        (git/fetch! source)
        ;; Load all entities from Git first - this handles creates/updates via entity_id matching
        (let [load-result (serdes/with-cache
                            (if (seq collections)
                              (v2.load/load-metabase! (source/ingestable-source source (or branch (settings/remote-sync-branch)))
                                                      :root-dependency-path (mapv #(assoc nil :id % :model "Collection") collections))
                              (v2.load/load-metabase! (source/ingestable-source source (or branch (settings/remote-sync-branch))))))
              ;; Extract entity_ids by model from the :seen paths
              imported-entities (->> (:seen load-result)
                                     (map last)                ; Get the last element of each path (the entity itself)
                                     (group-by :model)
                                     (map (fn [[model entities]]
                                            [model (set (map :id entities))]))
                                     (into {}))
              affected-collection-ids (collection/collection->descendant-ids remote-sync-collection)]
          ;; Now delete any remote sync content that was NOT part of the import
          (doseq [model [:model/Collection
                         :model/Card
                         :model/Dashboard
                         :model/NativeQuerySnippet
                         :model/Timeline
                         :model/Document]
                  :let [serdes-model (name model)
                        entity-ids (get imported-entities serdes-model [])]]
            (if (= model :model/Collection)
              (when (seq affected-collection-ids)
                (t2/delete! :model/Collection
                            :id [:in affected-collection-ids]
                            ;; if we didn't sync any, then delete all collections in the remote sync
                            :entity_id (if (seq entity-ids)
                                         [:not-in entity-ids]
                                         :entity_id)))
              (t2/delete! model
                          :collection_id [:in (cons (u/the-id remote-sync-collection) affected-collection-ids)]
                          :entity_id (if (seq entity-ids)
                                       [:not-in entity-ids]
                                       :entity_id)))))
        (lib.events/publish-remote-sync! "import" nil api/*current-user-id*
                                         {:source-branch branch
                                          :status "success"})
        (log/info "Successfully reloaded entities from git repository")
        {:status  :success
         :message "Successfully reloaded from git repository"}

        (catch Exception e
          (log/errorf e "Failed to reload from git repository: %s" (ex-message e))
          (let [error-msg (cond
                            (instance? java.net.UnknownHostException e)
                            "Network error: Unable to reach git repository host"

                            (str/includes? (ex-message e) "Authentication failed")
                            "Authentication failed: Please check your git credentials"

                            (str/includes? (ex-message e) "Repository not found")
                            "Repository not found: Please check the repository URL"

                            (str/includes? (ex-message e) "branch")
                            "Branch error: Please check the specified branch exists"

                            :else
                            (format "Failed to reload from git repository: %s" (ex-message e)))]
            (lib.events/publish-remote-sync! "import" nil api/*current-user-id*
                                             {:source-branch branch
                                              :status  "error"
                                              :message (ex-message e)})
            {:status  :error
             :message error-msg
             :details {:error-type (type e)}}))))
    {:status  :error
     :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(defn export!
  "Exports the synced collections to the source repo"
  ([branch message]
   (export! branch message nil))
  ([branch message collections]
   (if-let [source (source/source-from-settings)]
     (let [collections (or (seq collections) (t2/select-fn-set :entity_id :model/Collection :type "remote-synced"))]
       (try
         (serdes/with-cache
           (-> (v2.extract/extract (cond-> {:targets                  (mapv #(vector "Collection" %) collections)
                                            :no-collections           false
                                            :no-data-model            true
                                            :no-settings              true
                                            :include-field-values     :false
                                            :include-database-secrets :false
                                            :continue-on-error        false}))
               (source/store! source branch message)))
         (lib.events/publish-remote-sync! "export" nil api/*current-user-id*
                                          {:target-branch  branch
                                           :status  "success"
                                           :message message})
         {:status :success}

         (catch Exception e
           (lib.events/publish-remote-sync! "export" nil api/*current-user-id*
                                            {:target-branch  branch
                                             :status  "error"
                                             :message (ex-message e)})
           {:status  :error
            :message (format "Failed to export to git repository: %s" (ex-message e))})))
     {:status  :error
      :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."})))
