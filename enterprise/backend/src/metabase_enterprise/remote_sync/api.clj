(ns metabase-enterprise.remote-sync.api
  (:require
   [medley.core :as m]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/import" :- remote-sync.schema/ImportResponse
  "Import Metabase content from Git repository source of truth.

  This endpoint will:
  - Fetch the latest changes from the configured git repository
  - Load the updated content using the serialization/deserialization system

  If `force=false` (default) and there are unsaved changes in the Remote Sync collection,
  the import returns a 400 response.

  Requires superuser permissions."
  [_route
   _query
   {:keys [branch force]} :- [:map [:branch {:optional true} ms/NonBlankString]
                              [:force {:optional true} :boolean]]]
  (api/check-superuser)
  (when-not (settings/remote-sync-enabled)
    (throw (ex-info "Remote sync is not configured."
                    {:status-code 400})))
  (let [task-id (impl/async-import! (or branch (settings/remote-sync-branch)) force {})]
    {:status :success
     :task_id task-id
     :message (when-not task-id "No changes since last import")}))

(api.macros/defendpoint :get "/is-dirty" :- remote-sync.schema/IsDirtyResponse
  "Check if any remote-synced collection has remote sync changes that are not saved."
  []
  (api/check-superuser)
  {:is_dirty (remote-sync.object/dirty-global?)})

(api.macros/defendpoint :get "/dirty" :- remote-sync.schema/DirtyResponse
  "Return dirty models from any remote-synced collection"
  []
  (api/check-superuser)
  {:dirty (into []
                (m/distinct-by (juxt :id :model))
                (remote-sync.object/dirty-for-global))})

(api.macros/defendpoint :post "/export" :- remote-sync.schema/ExportResponse
  "Export the current state of the Remote Sync collection to a Source.

  This endpoint will:
  - Fetch the latest changes from the source
  - Create a branch or subdirectory (depending on source support)
    If no branch is supplied, use the configured export branch
  - Export the Remote Sync collection via serialization to the branch or subdirectory
  - Commit the changes if possible
  - Sync to the source if possible

  Requires superuser permissions."
  [_route
   _query
   {:keys [message branch force]}] :- [:map
                                       [:message {:optional true} ms/NonBlankString]
                                       [:branch {:optional true} ms/NonBlankString]
                                       [:force {:optional true} :boolean]]
  (api/check-superuser)
  (when-not (settings/remote-sync-enabled)
    (throw (ex-info "Remote sync is not configured."
                    {:status-code 400})))
  (when (= (settings/remote-sync-type) :production)
    (throw (ex-info "Exports are only allowed when remote-sync-type is set to 'development'" {:status-code 400})))
  {:message "Export task started"
   :task_id (impl/async-export! (or branch (settings/remote-sync-branch))
                                (or force false)
                                (or message "Exported from Metabase"))})

(api.macros/defendpoint :get "/current-task" :- [:maybe remote-sync.schema/SyncTask]
  "Get the current sync task"
  []
  (when-let [task (remote-sync.task/most-recent-task)]
    (t2/hydrate task :status)))

(api.macros/defendpoint :post "/current-task/cancel" :- remote-sync.schema/SyncTask
  "Cancels the current task if one is running"
  []
  (let [task (remote-sync.task/most-recent-task)]
    (api/check-400 (and (some? task) (remote-sync.task/running? task)) "No active task to cancel")
    (remote-sync.task/cancel-sync-task! (:id task))
    (t2/hydrate (remote-sync.task/most-recent-task) :status)))

(api.macros/defendpoint :put "/settings" :- remote-sync.schema/SettingsUpdateResponse
  "Update Git Sync related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   {:keys [remote-sync-type] :as settings}
   :- [:map
       [:remote-sync-url {:optional true} [:maybe :string]]
       [:remote-sync-token {:optional true} [:maybe :string]]
       [:remote-sync-type {:optional true} [:maybe [:enum :production :development]]]
       [:remote-sync-branch {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (when (and (remote-sync.object/dirty-global?) (= :production remote-sync-type))
    (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten switching to production mode."
                    {:status-code 400})))
  (try
    (settings/check-and-update-remote-settings! settings)
    (catch Exception e
      (throw (ex-info "Invalid git settings"
                      {:error (ex-message e)
                       :status-code 400} e))))
  (cond (and (settings/remote-sync-enabled)
             (= :production (settings/remote-sync-type)))
        {:success true
         :task_id (impl/async-import! (settings/remote-sync-branch) true {})}

        (and (settings/remote-sync-enabled)
             (= :development (settings/remote-sync-type))
             (nil? (collection/remote-synced-collection)))
        {:success true
         :task_id (impl/async-import! (settings/remote-sync-branch) false {:create-collection? true})}

        :else
        {:success true}))

(api.macros/defendpoint :get "/branches" :- remote-sync.schema/BranchesResponse
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
        (log/errorf e "Failed to get branches from git source: %s" (ex-message e))
        (let [error-msg (impl/source-error-message e)]
          (throw (ex-info error-msg {:status-code 400}
                          e)))))
    (throw (ex-info "Git source not configured. Please configure MB_GIT_SOURCE_REPO_URL environment variable."
                    {:status-code 400}))))

(api.macros/defendpoint :post "/create-branch" :- remote-sync.schema/CreateBranchResponse
  "Create a new branch from the current remote-sync branch and switches the current remote-sync branch to it.
  Requires superuser permissions."
  [_route
   _query
   {:keys [name]} :- [:map [:name ms/NonBlankString]]]
  (api/check-superuser)
  (let [base-branch (or (remote-sync.task/last-version) (settings/remote-sync-branch))
        source (source/source-from-settings)]
    (when-not source
      (throw (ex-info "Git source not configured"
                      {:status-code 400})))
    (when-not base-branch
      (throw (ex-info "Base commit not found"
                      {:status-code 400})))
    (try
      (source.p/create-branch source name base-branch)
      (settings/remote-sync-branch! name)
      {:status "success"
       :message (format "Branch '%s' created from '%s'" name base-branch)}
      (catch Exception e
        (throw (ex-info (format "Failed to create branch: %s" (ex-message e))
                        {:status-code 400} e))))))

(api.macros/defendpoint :post "/stash" :- remote-sync.schema/StashResponse
  "Stashes changes to a new branch, and changes the current branch to it.
  Requires superuser permissions."
  [_route
   _query
   {new-branch :new_branch message :message} :- [:map
                                                 [:new_branch ms/NonBlankString]
                                                 [:message ms/NonBlankString]]]
  (api/check-superuser)
  (when (not= (settings/remote-sync-type) :development)
    (throw (ex-info "Stash is only allowed when remote-sync-type is set to 'development'" {:status-code 400})))
  (let [source (source/source-from-settings)]
    (when (nil? source)
      (throw (ex-info "Git source not configured"
                      {:status-code 400})))
    (try
      (source.p/create-branch source new-branch (settings/remote-sync-branch))
      {:status "success"
       :message (str "Stashing to " new-branch)
       :task_id (impl/async-export! new-branch false message)}
      (catch Exception e
        (throw (ex-info (format "Failed to stash changes to branch: %s" (ex-message e))
                        {:status-code 400}))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/remote-sync` routes."
  (api.macros/ns-handler *ns* +auth))
