(ns metabase-enterprise.library.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.library.settings :as settings]
   [metabase-enterprise.library.source :as source]
   [metabase-enterprise.library.source.git :as git]
   [metabase-enterprise.mbml.core :as mbml]
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
   [toucan2.core :as t2])
  (:import (java.io File)
           (java.nio.file Files)
           (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- log-sync-event!
  "Log a sync event to the library_sync_log table."
  [sync-type status & {:keys [source-branch target-branch message]}]
  (t2/insert! :model/LibrarySyncLog
              {:sync_type sync-type
               :source_branch source-branch
               :target_branch target-branch
               :status status
               :message message}))

(defn- reload-from-git!
  "Reloads the Metabase entities from the "
  [branch]
  (if-let [source (source/get-source)]
    (let [library-collection (t2/select-one :model/Collection :entity_id collection/library-entity-id)]
      (try
        (git/fetch! source)
        ;; Load all entities from Git first - this handles creates/updates via entity_id matching
        (let [load-result #p (serdes/with-cache
                               (v2.load/load-metabase! (source/ingestable-source source (or branch (settings/git-sync-import-branch)))
                                                       :root-dependency-path [{:id collection/library-entity-id
                                                                               :model "Collection"}]))
              ;; Extract entity_ids by model from the :seen paths
              imported-entities #p (->> (:seen load-result)
                                        (map last) ; Get the last element of each path (the entity itself)
                                        (group-by :model)
                                        (map (fn [[model entities]]
                                               [model (set (map :id entities))]))
                                        (into {}))
              affected-collection-ids (collection/collection->descendant-ids library-collection)]
          ;; Now delete any library content that was NOT part of the import
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
                            ;; if we didn't sync any, then delete all collections in the library
                            :entity_id (if (seq entity-ids)
                                         [:not-in entity-ids]
                                         :entity_id)))
              (t2/delete! model
                          :collection_id [:in (cons (u/the-id library-collection) affected-collection-ids)]
                          :entity_id (if (seq entity-ids)
                                       [:not-in entity-ids]
                                       :entity_id)))))
        (log-sync-event! "import" "success"
                         :source-branch (:source-branch source))
        (log/info "Successfully reloaded entities from git repository")
        {:status :success
         :message "Successfully reloaded from git repository"}

        (catch Exception e
          (log/errorf e "Failed to reload from git repository: %s" (.getMessage e))
          (let [error-msg (cond
                            (instance? java.net.UnknownHostException e)
                            "Network error: Unable to reach git repository host"

                            (str/includes? (.getMessage e) "Authentication failed")
                            "Authentication failed: Please check your git credentials"

                            (str/includes? (.getMessage e) "Repository not found")
                            "Repository not found: Please check the repository URL"

                            (str/includes? (.getMessage e) "branch")
                            "Branch error: Please check the specified branch exists"

                            :else
                            (format "Failed to reload from git repository: %s" (.getMessage e)))]
            (log-sync-event! "import" "error"
                             :source-branch (:source-branch source)
                             :message (.getMessage e))
            {:status :error
             :message error-msg
             :details {:error-type (type e)}}))))
    {:status :error
     :message "Library source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(api.macros/defendpoint :post "/import"
  "Reload Metabase content from Git repository source of truth.

  This endpoint will:
  1. Fetch the latest changes from the configured git repository
  2. Load the updated content using the serialization/deserialization system

  Requires superuser permissions."
  [_route
   _query
   {:keys [branch]} :- [:map [:branch {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (let [result (source/with-source [_source] (reload-from-git! branch))]
    (case (:status result)
      :success
      "Success"

      :error
      {:status 400
       :body {:status "error"
              :message (:message result)}}

      ;; Fallback for unexpected result format
      {:status 500
       :body {:status "error"
              :message "Unexpected error occurred during reload"}})))

(api.macros/defendpoint :get "/unsynced-changes"
  "Does this Metabase Library contain unsynced changes?"
  []
  (api/check-superuser)
  (if-let [library-collection (t2/select-one :model/Collection :entity_id collection/library-entity-id)]
    (let [most-recent-sync (t2/select-one [:model/LibrarySyncLog :created_at]
                                          :sync_type "import"
                                          :status "success"
                                          {:order-by [[:created_at :desc]]})
          last-sync-time (:created_at most-recent-sync)
          ;; Get all descendant collection IDs
          library-collection-ids (collection/collection->descendant-ids library-collection)
          all-library-collection-ids (cons (u/the-id library-collection) library-collection-ids)]
      (if last-sync-time
        ;; Check if any library content was created/updated after last sync
        (let [unsynced-collections (t2/count :model/Collection
                                             {:where
                                              [:and
                                               [:in :id all-library-collection-ids]
                                               ;; Collections don't have an `updated_at` so we'll need a different approach here, or add it :facepalm:
                                               [:> :created_at last-sync-time]]})
              unsynced-cards (t2/count :model/Card
                                       {:where
                                        [:and
                                         [:in :collection_id all-library-collection-ids]
                                         [:or
                                          [:> :created_at last-sync-time]
                                          [:> :updated_at last-sync-time]]]})
              unsynced-dashboards (t2/count :model/Dashboard
                                            {:where
                                             [:and
                                              [:in :collection_id all-library-collection-ids]
                                              [:or
                                               [:> :created_at last-sync-time]
                                               [:> :updated_at last-sync-time]]]})
              unsynced-snippets (t2/count :model/NativeQuerySnippet
                                          {:where
                                           [:and
                                            [:in :collection_id all-library-collection-ids]
                                            [:or
                                             [:> :created_at last-sync-time]
                                             [:> :updated_at last-sync-time]]]})
              unsynced-timelines (t2/count :model/Timeline
                                           {:where
                                            [:and
                                             [:in :collection_id all-library-collection-ids]
                                             [:or
                                              [:> :created_at last-sync-time]
                                              [:> :updated_at last-sync-time]]]})
              unsynced-documents (t2/count :model/Document
                                           {:where
                                            [:and
                                             [:in :collection_id all-library-collection-ids]
                                             [:or
                                              [:> :created_at last-sync-time]
                                              [:> :updated_at last-sync-time]]]})
              total-unsynced (+ unsynced-collections unsynced-cards unsynced-dashboards
                                unsynced-snippets unsynced-timelines unsynced-documents)]
          {:has_unsynced_changes (> total-unsynced 0)
           :last_sync_at last-sync-time
           :unsynced_counts {:collections unsynced-collections
                             :cards unsynced-cards
                             :dashboards unsynced-dashboards
                             :snippets unsynced-snippets
                             :timelines unsynced-timelines
                             :documents unsynced-documents
                             :total total-unsynced}})
        ;; No successful sync found - everything is unsynced
        {:has_unsynced_changes true
         :last_sync_at nil
         :message "No successful sync found - all library content is unsynced"}))
    ;; No library collection found
    {:has_unsynced_changes false
     :message "Library collection not found"}))

(defn save-to-git!
  [branch message]
  (source/with-source [source]
    (if source
      (do
        (serdes/with-cache
          (-> (v2.extract/extract {:targets [["Collection" collection/library-entity-id]]
                                   :no-collections false
                                   :no-data-model true
                                   :no-settings true
                                   :include-field-values :false
                                   :include-database-secrets :false
                                   :continue-on-error false})
              (source/store! source branch message)))
        {:status :success})
      {:status :error
       :message "Library source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."})))

(api.macros/defendpoint :post "/export"
  "Export the current state of the Library collection to a Source
  This endpoint will:
  1. Fetch the latest changes from the source
  2. Create a branch or subdirectory -- depending on source support
     If no branch is supplied use the configured export branch.
  3. Export the Library collection via serialization to the branch or subdirectory
  4. If possible commit the changes
  5. If possible sync to the source.

  Requires superuser permissions."
  [_route
   _query
   {:keys [message branch force-sync]}] :- [:map
                                            [:message {:optional true} ms/NonBlankString]
                                            [:branch {:optional true} ms/NonBlankString]
                                            [:force-sync {:optional true} :boolean]]
  (api/check-superuser)
  (let [result (save-to-git! (or branch (settings/git-sync-export-branch))
                             (or message "test-commit"))]
    (case (:status result)
      :success "Success"

      :error
      {:status 400
       :body {:status "error"
              :message (:message result)}}

      {:status 500
       :body {:status "error"
              :message "Unexpected error occurred during export"}})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library` routes."
  (api.macros/ns-handler *ns* +auth))
