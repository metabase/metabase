(ns metabase-enterprise.remote-sync.api
  (:require
   [clojure.string :as str]
   [diehard.core :as dh]
   [medley.core :as m]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.ingestable :as source.ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.collections.models.collection :as collection]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- run-async!
  [task-type branch f]
  (let [{task-id :id
         existing? :existing?}
        (cluster-lock/with-cluster-lock impl/cluster-lock
          (if-let [{id :id} (remote-sync.task/current-task)]
            {:existing? true :id id}
            (remote-sync.task/create-sync-task! task-type api/*current-user-id*)))]
    (api/check-400 (not existing?) "Remote sync in progress")
    (u.jvm/in-virtual-thread*
     (dh/with-timeout {:interrupt? true
                       :timeout-ms (settings/remote-sync-task-time-limit-ms)}
       (let [result (f task-id)]
         (case (:status result)
           :success (t2/with-transaction [_conn]
                      (settings/remote-sync-branch! branch)
                      (remote-sync.task/complete-sync-task! task-id))
           :error (remote-sync.task/fail-sync-task! task-id (:message result))
           (remote-sync.task/fail-sync-task! task-id "Unexpected Error")))))
    task-id))

(defn- async-import!
  [branch force? import-args]
  (let [ingestable-source (source.p/->ingestable (source/source-from-settings branch) {:path-filters [#"collections/.*"]})
        source-version (source.ingestable/ingestable-version ingestable-source)
        last-imported-version (remote-sync.task/last-import-version)
        has-dirty? (remote-sync.object/dirty-global?)]
    (when (and has-dirty? (not force?))
      (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                      {:status-code 400
                       :conflicts true})))
    (if (and (not force?) (= last-imported-version source-version))
      (do (log/infof "Skipping import: source version %s matches last imported version" source-version)
          (settings/remote-sync-branch! branch)
          nil)
      (run-async! "import" branch (fn [task-id] (impl/import! ingestable-source task-id import-args))))))

(defn- async-export!
  [branch force? message]
  (let [source (source/source-from-settings branch)
        last-task-version (remote-sync.task/last-version)
        current-source-version (source.ingestable/ingestable-version (source.p/->ingestable source {}))]
    (when (and (not force?) (some? last-task-version) (not= last-task-version current-source-version))
      (throw (ex-info "Cannot export changes that will overwrite new changes in the branch."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "export" branch (fn [task-id] (impl/export! source
                                                            task-id
                                                            message)))))

(api.macros/defendpoint :post "/import" :- remote-sync.schema/ImportResponse
  "Reload Metabase content from Git repository source of truth.

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
    (throw (ex-info "Git sync is paused. Please resume it to perform import operations."
                    {:status-code 400})))
  (let [task-id (async-import! (or branch (settings/remote-sync-branch)) force {})]
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
    (throw (ex-info "Git sync is paused. Please resume it to perform export operations."
                    {:status-code 400})))
  (when (= (settings/remote-sync-type) :production)
    (throw (ex-info "Exports are only allowed when remote-sync-type is set to 'development'" {:status-code 400})))
  {:message "Export task started"
   :task_id (async-export! (or branch (settings/remote-sync-branch))
                           (or force false)
                           (or message "Exported from Metabase"))})

(defn- task-with-status
  "Returns the status of a sync task.
  
  Args:
    task (map): A remote sync task record
  
  Returns:
    map: The task record with a :status field added, which can be:
         :errored - Task failed with an error
         :successful - Task completed successfully
         :cancelled - Task was cancelled by user
         :timed-out - Task exceeded time limit
         :running - Task is currently executing"
  [task]
  (assoc task :status (cond
                        (remote-sync.task/failed? task) :errored
                        (remote-sync.task/successful? task) :successful
                        (remote-sync.task/cancelled? task) :cancelled
                        (remote-sync.task/timed-out? task) :timed-out
                        :else :running)))

(api.macros/defendpoint :get "/current-task" :- [:maybe remote-sync.schema/SyncTask]
  "Get the current sync task"
  []
  (when-let [task (remote-sync.task/most-recent-task)]
    (task-with-status task)))

(api.macros/defendpoint :post "/current-task/cancel" :- remote-sync.schema/SyncTask
  "Cancels the current task if one is running"
  []
  (let [task (remote-sync.task/most-recent-task)]
    (api/check-400 (and (some? task) (remote-sync.task/running? task)) "No active task to cancel")
    (remote-sync.task/cancel-sync-task! (:id task))
    (task-with-status (remote-sync.task/most-recent-task))))

(api.macros/defendpoint :put "/settings" :- remote-sync.schema/SettingsUpdateResponse
  "Update Git Sync related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   {:keys [remote-sync-type] :as settings}
   :- [:map
       [:remote-sync-enabled {:optional true} [:maybe :boolean]]
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
         :task_id (async-import! (settings/remote-sync-branch) true {})}

        (and (settings/remote-sync-enabled)
             (= :development (settings/remote-sync-type))
             (nil? (collection/remote-synced-collection)))
        {:success true
         :task_id (async-import! (settings/remote-sync-branch) false {:create-collection? true})}

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
        (let [error-msg (cond
                          (instance? java.net.UnknownHostException e)
                          "Network error: Unable to reach git repository host"

                          (str/includes? (ex-message e) "Authentication failed")
                          "Authentication failed: Please check your git credentials"

                          (str/includes? (ex-message e) "Repository not found")
                          "Repository not found: Please check the repository URL"

                          :else
                          (format "Failed to get branches from git source: %s" (ex-message e)))]
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
   {:keys [new_branch message]} :- [:map
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
      (source.p/create-branch source new_branch (settings/remote-sync-branch))
      {:status "success"
       :message (str "Stashing to " new_branch)
       :task_id (async-export! new_branch false message)}
      (catch Exception e
        (throw (ex-info (format "Failed to stash changes to branch: %s" (ex-message e))
                        {:status-code 400}))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/remote-sync` routes."
  (api.macros/ns-handler *ns* +auth))
