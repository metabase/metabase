(ns metabase-enterprise.library.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.library.events :as lib.events]
   [metabase-enterprise.library.models.library-change-log]
   [metabase-enterprise.library.settings :as settings]
   [metabase-enterprise.library.source :as source]
   [metabase-enterprise.library.source.git :as git]
   [metabase-enterprise.library.source.protocol :as source.p]
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

(defn- reload-from-git!
  "Reloads the Metabase entities from the "
  [branch]
  (if-let [source (source/get-source)]
    (let [library-collection (t2/select-one :model/Collection :entity_id collection/library-entity-id)]
      (try
        (git/fetch! source)
        ;; Load all entities from Git first - this handles creates/updates via entity_id matching
        (let [load-result (serdes/with-cache
                            (v2.load/load-metabase! (source/ingestable-source source (or branch (settings/git-sync-import-branch)))
                                                    :root-dependency-path [{:id collection/library-entity-id
                                                                            :model "Collection"}]))
              ;; Extract entity_ids by model from the :seen paths
              imported-entities (->> (:seen load-result)
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
        (lib.events/publish-library-sync! "import" nil api/*current-user-id*
                                          {:branch (or branch (:source-branch source))
                                           :status "success"})
        (log/info "Successfully reloaded entities from git repository")
        {:status :success
         :message "Successfully reloaded from git repository"}

        (catch Exception e
          (log/errorf e "Failed to reload from git repository: %s" (ex-message e))
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
            (lib.events/publish-library-sync! "import" nil api/*current-user-id*
                                              {:branch (or branch (:source-branch source))
                                               :status "error"
                                               :message (.getMessage e)})
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
    (let [most-recent-sync (t2/select-one [:model/LibraryChangeLog :created_at]
                                          :sync_type "import"
                                          :status "success"
                                          {:order-by [[:created_at :desc]]})
          last-sync-time (:created_at most-recent-sync)
          library-collection-ids (collection/collection->descendant-ids library-collection)
          all-library-collection-ids (cons (u/the-id library-collection) library-collection-ids)]
      (if last-sync-time
        (let [unsynced-collections (t2/select [:model/Collection :id :name :created_at :authority_level]
                                              {:where
                                               [:and
                                                [:in :id all-library-collection-ids]
                                                [:> :created_at last-sync-time]]})
              unsynced-cards (t2/select [:model/Card :id :name :description :created_at :updated_at :collection_id :display :query_type]
                                        {:where
                                         [:and
                                          [:in :collection_id all-library-collection-ids]
                                          [:or
                                           [:> :created_at last-sync-time]
                                           [:> :updated_at last-sync-time]]]})
              unsynced-dashboards (t2/select [:model/Dashboard :id :name :description :created_at :updated_at :collection_id]
                                             {:where
                                              [:and
                                               [:in :collection_id all-library-collection-ids]
                                               [:or
                                                [:> :created_at last-sync-time]
                                                [:> :updated_at last-sync-time]]]})
              unsynced-snippets (t2/select [:model/NativeQuerySnippet :id :name :created_at :updated_at :collection_id]
                                           {:where
                                            [:and
                                             [:in :collection_id all-library-collection-ids]
                                             [:or
                                              [:> :created_at last-sync-time]
                                              [:> :updated_at last-sync-time]]]})
              unsynced-timelines (t2/select [:model/Timeline :id :name :created_at :updated_at :collection_id]
                                            {:where
                                             [:and
                                              [:in :collection_id all-library-collection-ids]
                                              [:or
                                               [:> :created_at last-sync-time]
                                               [:> :updated_at last-sync-time]]]})
              unsynced-documents (t2/select [:model/Document :id :name :created_at :updated_at :collection_id]
                                            {:where
                                             [:and
                                              [:in :collection_id all-library-collection-ids]
                                              [:or
                                               [:> :created_at last-sync-time]
                                               [:> :updated_at last-sync-time]]]})
              enriched-collections (map #(assoc % :model "collection" :updated_at nil :description nil) unsynced-collections)
              enriched-cards (map #(assoc % :model "card") unsynced-cards)
              enriched-dashboards (map #(assoc % :model "dashboard") unsynced-dashboards)
              enriched-snippets (map #(assoc % :model "snippet" :description nil) unsynced-snippets)
              enriched-timelines (map #(assoc % :model "timeline" :description nil) unsynced-timelines)
              enriched-documents (map #(assoc % :model "document" :description nil) unsynced-documents)
              all-entities (concat enriched-collections enriched-cards enriched-dashboards
                                   enriched-snippets enriched-timelines enriched-documents)
              sorted-entities (sort-by #(or (:updated_at %) (:created_at %)) #(compare %2 %1) all-entities)
              total-unsynced (count all-entities)]
          {:has_unsynced_changes (> total-unsynced 0)
           :last_sync_at last-sync-time
           :unsynced_counts {:collections (count unsynced-collections)
                             :cards (count unsynced-cards)
                             :dashboards (count unsynced-dashboards)
                             :snippets (count unsynced-snippets)
                             :timelines (count unsynced-timelines)
                             :documents (count unsynced-documents)
                             :total total-unsynced}
           :entities sorted-entities})
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
      (try
        (serdes/with-cache
          (-> (v2.extract/extract {:targets [["Collection" collection/library-entity-id]]
                                   :no-collections false
                                   :no-data-model true
                                   :no-settings true
                                   :include-field-values :false
                                   :include-database-secrets :false
                                   :continue-on-error false})
              (source/store! source branch message)))
        (lib.events/publish-library-sync! "export" nil api/*current-user-id*
                                          {:branch branch
                                           :status "success"
                                           :message message})
        {:status :success}

        (catch Exception e
          (lib.events/publish-library-sync! "export" nil api/*current-user-id*
                                            {:branch branch
                                             :status "error"
                                             :message (ex-message e)})
          {:status :error
           :message (format "Failed to export to git repository: %s" (.getMessage e))}))
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

(api.macros/defendpoint :get "/branches"
  "Get list of branches from the configured git source.

  Returns a JSON object with branch names under the :items key.

  Requires superuser permissions."
  []
  (api/check-superuser)
  (source/with-source [source]
    (if source
      (try
        (let [branch-list (source.p/branches source)]
          {:items branch-list})
        (catch Exception e
          (log/errorf e "Failed to get branches from git source: %s" (.getMessage e))
          (let [error-msg (cond
                            (instance? java.net.UnknownHostException e)
                            "Network error: Unable to reach git repository host"

                            (str/includes? (.getMessage e) "Authentication failed")
                            "Authentication failed: Please check your git credentials"

                            (str/includes? (.getMessage e) "Repository not found")
                            "Repository not found: Please check the repository URL"

                            :else
                            (format "Failed to get branches from git source: %s" (.getMessage e)))]
            {:status 400
             :body {:status "error"
                    :message error-msg}})))
      {:status 400
       :body {:status "error"
              :message "Git source not configured. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library` routes."
  (api.macros/ns-handler *ns* +auth))
