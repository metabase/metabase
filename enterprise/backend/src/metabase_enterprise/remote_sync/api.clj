(ns metabase-enterprise.remote-sync.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  (when-not (settings/remote-sync-enabled)
    (throw (ex-info "Git sync is paused. Please resume it to perform import operations."
                    {:status-code 400})))
  (let [result (impl/import! branch)]
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
  "Does this Metabase Remote Sync collection contain unsynced changes?"
  []
  (api/check-superuser)
  (if-let [remote-sync-collection (t2/select-one :model/Collection :entity_id collection/library-entity-id)]
    (let [most-recent-sync (t2/select-one [:model/RemoteSyncChangeLog :created_at]
                                          :sync_type "import"
                                          :status "success"
                                          {:order-by [[:created_at :desc]]})
          last-sync-time (:created_at most-recent-sync)
          remote-sync-collection-ids (collection/collection->descendant-ids remote-sync-collection)
          all-remote-sync-collection-ids (cons (u/the-id remote-sync-collection) remote-sync-collection-ids)]
      (if last-sync-time
        (let [unsynced-collections (t2/select [:model/Collection :id :name :created_at :authority_level]
                                              {:where
                                               [:and
                                                [:in :id all-remote-sync-collection-ids]
                                                [:> :created_at last-sync-time]]})
              unsynced-cards (t2/select [:model/Card :id :name :description :created_at :updated_at :collection_id :display :query_type]
                                        {:where
                                         [:and
                                          [:in :collection_id all-remote-sync-collection-ids]
                                          [:or
                                           [:> :created_at last-sync-time]
                                           [:> :updated_at last-sync-time]]]})
              unsynced-dashboards (t2/select [:model/Dashboard :id :name :description :created_at :updated_at :collection_id]
                                             {:where
                                              [:and
                                               [:in :collection_id all-remote-sync-collection-ids]
                                               [:or
                                                [:> :created_at last-sync-time]
                                                [:> :updated_at last-sync-time]]]})
              unsynced-snippets (t2/select [:model/NativeQuerySnippet :id :name :created_at :updated_at :collection_id]
                                           {:where
                                            [:and
                                             [:in :collection_id all-remote-sync-collection-ids]
                                             [:or
                                              [:> :created_at last-sync-time]
                                              [:> :updated_at last-sync-time]]]})
              unsynced-timelines (t2/select [:model/Timeline :id :name :created_at :updated_at :collection_id]
                                            {:where
                                             [:and
                                              [:in :collection_id all-remote-sync-collection-ids]
                                              [:or
                                               [:> :created_at last-sync-time]
                                               [:> :updated_at last-sync-time]]]})
              unsynced-documents (t2/select [:model/Document :id :name :created_at :updated_at :collection_id]
                                            {:where
                                             [:and
                                              [:in :collection_id all-remote-sync-collection-ids]
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
         :message "No successful sync found - all remote sync content is unsynced"}))
    ;; No library collection found
    {:has_unsynced_changes false
     :message "Remote Sync collection not found"}))

(api.macros/defendpoint :post "/export"
  "Export the current state of the Remote Sync collection to a Source
  This endpoint will:
  1. Fetch the latest changes from the source
  2. Create a branch or subdirectory -- depending on source support
     If no branch is supplied use the configured export branch.
  3. Export the Remote Sync collection via serialization to the branch or subdirectory
  4. If possible commit the changes
  5. If possible sync to the source.

  Requires superuser permissions."
  [_route
   _query
   {:keys [message branch collection]}] :- [:map
                                            [:message {:optional true} ms/NonBlankString]
                                            [:branch {:optional true} ms/NonBlankString]
                                            [:collection {:optional true} ms/NonBlankString]]
  (api/check-superuser)
  (when-not (settings/remote-sync-enabled)
    (throw (ex-info "Git sync is paused. Please resume it to perform export operations."
                    {:status-code 400})))
  (let [result (impl/export! (or branch (settings/remote-sync-branch))
                             (or message "Exported from Metabase")
                             (if (some? collection) (t2/select :entity-id collection) nil))]
    (case (:status result)
      :success "Success"

      :error
      {:status 400
       :body {:status "error"
              :message (:message result)}}

      {:status 500
       :body {:status "error"
              :message "Unexpected error occurred during export"}})))

(api.macros/defendpoint :put "/settings"
  "Update Git Sync related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   settings
   :- [:map
       [:remote-sync-configured {:optional true} [:maybe :boolean]]
       [:remote-sync-enabled {:optional true} [:maybe :boolean]]
       [:remote-sync-url {:optional true} [:maybe :string]]
       [:remote-sync-token {:optional true} [:maybe :string]]
       [:remote-sync-type {:optional true} [:maybe [:enum "import" "export"]]]
       [:remote-sync-branch {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (try
    (settings/check-and-update-remote-settings! settings)
    (when (and (settings/remote-sync-enabled)
               (= "import" (settings/remote-sync-type)))
      (impl/import! (settings/remote-sync-branch)))
    (catch Exception e
      (throw (ex-info "Invalid git settings"
                      {:error (.getMessage e)
                       :status-code  400}))))
  {:success true})

(api.macros/defendpoint :get "/branches"
  "Get list of branches from the configured git source.

  Returns a JSON object with branch names under the :items key.

  Requires superuser permissions."
  []
  (api/check-superuser)
  (if-let [source (source/source-from-settings)]
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
            :message "Git source not configured. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/remote-sync` routes."
  (api.macros/ns-handler *ns* +auth))
