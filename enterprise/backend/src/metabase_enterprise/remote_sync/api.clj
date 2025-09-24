(ns metabase-enterprise.remote-sync.api
  (:require
   [clojure.string :as str]
   [diehard.core :as dh]
   [medley.core :as m]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-change-log :as change-log]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def cluster-lock ::remote-sync-task)

(defn- run-async!
  [ttype f]
  (let [{task-id :id
         existing? :existing?}
        (cluster-lock/with-cluster-lock cluster-lock
          (if-let [{id :id} (remote-sync.task/current-task)]
            {:existing? true :id id}
            (remote-sync.task/create-sync-task! ttype api/*current-user-id*)))]
    (api/check-400 (not existing?) "Remote sync in progress")
    (u.jvm/in-virtual-thread*
     (dh/with-timeout {:interrupt? true
                       :timeout-ms (settings/remote-sync-task-time-limit-ms)}
       (let [result (f task-id)]
         (case (:status result)
           :success (remote-sync.task/complete-sync-task! task-id)
           :error (remote-sync.task/fail-sync-task! task-id (:message result))
           (remote-sync.task/fail-sync-task! task-id "Unexpected Error")))))
    task-id))

(defn- async-import!
  [branch]
  (run-async! "import" (fn [task-id] (impl/import! (source/source-from-settings) task-id branch))))

(defn- async-export!
  [branch message collection]
  (run-async! "export" (fn [task-id] (impl/export! (source/source-from-settings)
                                                   task-id
                                                   branch
                                                   message
                                                   collection))))

(api.macros/defendpoint :post "/import"
  "Reload Metabase content from Git repository source of truth.

  This endpoint will:
  1. Fetch the latest changes from the configured git repository
  2. Load the updated content using the serialization/deserialization system

  Requires superuser permissions."
  [_route
   _query
   {:keys [branch]} :- [:map [:branch {:optional true} ms/NonBlankString]
                        [:collection_id {:optional true} pos-int?]]]
  (api/check-superuser)
  (when-not (settings/remote-sync-enabled)
    (throw (ex-info "Git sync is paused. Please resume it to perform import operations."
                    {:status-code 400})))
  {:status :success
   :task_id (async-import! (or branch (settings/remote-sync-branch)))})

(api.macros/defendpoint :get "/:collection-id/is-dirty"
  "Check if this instance or a specific collection has remote sync changes that are not saved."
  [{:keys [collection-id]} :- [:map
                               [:collection-id {:optional true} pos-int?]]]
  (api/check-superuser)
  {:is_dirty (change-log/dirty-collection? collection-id)})

(api.macros/defendpoint :get "/:collection-id/dirty"
  "Return dirty models from a given collection"
  [{:keys [collection-id]} :- [:map
                               [:collection-id {:optional true} pos-int?]]]
  (api/check-superuser)
  {:dirty (into []
                (m/distinct-by (juxt :id :model))
                (change-log/dirty-for-collection collection-id))})

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
   {:keys [message branch collection_id _force-sync]}] :- [:map
                                                           [:message {:optional true} ms/NonBlankString]
                                                           [:branch {:optional true} ms/NonBlankString]
                                                           [:collection_id {:optional true} pos-int?]
                                                           [:force-sync {:optional true} :boolean]]
  (api/check-superuser)
  (when-not (settings/remote-sync-enabled)
    (throw (ex-info "Git sync is paused. Please resume it to perform export operations."
                    {:status-code 400})))
  {:message "Export task started"
   :task_id (async-export! (or branch (settings/remote-sync-branch))
                           (or message "Exported from Metabase")
                           (if (some? collection_id) [(t2/select-one-fn :entity_id [:model/Collection :entity_id] :id collection_id)] nil))})

(api.macros/defendpoint :get "/current-task"
  "Get the current sync task"
  []
  (remote-sync.task/most-recent-task))

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
      {:success true
       :task_id (async-import! (settings/remote-sync-branch))})
    (catch Exception e
      (throw (ex-info "Invalid git settings"
                      {:error (.getMessage e)
                       :status-code 400})))))

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
