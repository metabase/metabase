(ns metabase-enterprise.remote-sync.api
  (:require
   [clojure.string :as str]
   [diehard.core :as dh]
   [medley.core :as m]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.ingestable :as source.ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- run-async!
  [ttype branch f]
  (let [{task-id :id
         existing? :existing?}
        (cluster-lock/with-cluster-lock impl/cluster-lock
          (if-let [{id :id} (remote-sync.task/current-task)]
            {:existing? true :id id}
            (remote-sync.task/create-sync-task! ttype api/*current-user-id*)))]
    (api/check-400 (not existing?) "Remote sync in progress")
    (u.jvm/in-virtual-thread*
     (dh/with-timeout {:interrupt? true
                       :timeout-ms (settings/remote-sync-task-time-limit-ms)}
       (let [result (f task-id)]
         (case (:status result)
           :success (do (remote-sync.task/complete-sync-task! task-id)
                        (settings/remote-sync-branch! branch))
           :error (remote-sync.task/fail-sync-task! task-id (:message result))
           (remote-sync.task/fail-sync-task! task-id "Unexpected Error")))))
    task-id))

(defn- async-import!
  [branch force?]
  (let [ingestable-source (source.p/->ingestable (source/source-from-settings branch) {:path-filters [#"collections/.*"]})
        source-version (source.ingestable/ingestable-version ingestable-source)
        last-imported-version (remote-sync.task/last-import-version)
        has-dirty? (remote-sync.object/dirty-global?)]
    (when (and has-dirty? (not force?))
      (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                      {:status-code 400})))
    (if (and (not force?) (= last-imported-version source-version))
      (do (log/infof "Skipping import: source version %s matches last imported version" source-version)
          (settings/remote-sync-branch! branch)
          nil)
      (run-async! "import" branch (fn [task-id] (impl/import! ingestable-source task-id))))))

(defn- async-export!
  [branch message]
  (run-async! "export" branch (fn [task-id] (impl/export! (source/source-from-settings branch)
                                                          task-id
                                                          message))))

(api.macros/defendpoint :post "/import"
  "Reload Metabase content from Git repository source of truth.

  This endpoint will:
  1. Fetch the latest changes from the configured git repository
  2. Load the updated content using the serialization/deserialization system

  If force=false (default) and there are unsaved changes in the Remote Sync collection, the import return a 400 response.

  Requires superuser permissions."
  [_route
   _query
   {:keys [branch force]} :- [:map [:branch {:optional true} ms/NonBlankString]
                              [:force {:optional true} :boolean]]]
  (api/check-superuser)
  (when-not (settings/remote-sync-enabled)
    (throw (ex-info "Git sync is paused. Please resume it to perform import operations."
                    {:status-code 400})))
  (let [task-id (async-import! (or branch (settings/remote-sync-branch)) force)]
    {:status :success
     :task_id task-id
     :message (when-not task-id "No changes since last import")}))

(api.macros/defendpoint :get "/is-dirty"
  "Check if any collection has remote sync changes that are not saved."
  []
  (api/check-superuser)
  {:is_dirty (remote-sync.object/dirty-global?)})

(api.macros/defendpoint :get "/dirty"
  "Return dirty models from a any remote-sync collection"
  []
  (api/check-superuser)
  {:dirty (into []
                (m/distinct-by (juxt :id :model))
                (remote-sync.object/dirty-for-global))})

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
   {:keys [message branch _force-sync]}] :- [:map
                                             [:message {:optional true} ms/NonBlankString]
                                             [:branch {:optional true} ms/NonBlankString]
                                             [:force-sync {:optional true} :boolean]]
  (api/check-superuser)
  (when-not (settings/remote-sync-enabled)
    (throw (ex-info "Git sync is paused. Please resume it to perform export operations."
                    {:status-code 400})))
  (when (= (settings/remote-sync-type) :production)
    (throw (ex-info "Exports are only allowed when remote-sync-type is set to 'development'" {:status-code 400})))
  {:message "Export task started"
   :task_id (async-export! (or branch (settings/remote-sync-branch))
                           (or message "Exported from Metabase"))})

(defn- task-status [task]
  (assoc task :status (cond
                        (remote-sync.task/failed? task) :errored
                        (remote-sync.task/successful? task) :successful
                        (remote-sync.task/cancelled? task) :cancelled
                        (remote-sync.task/timed-out? task) :timed-out
                        :else :running)))

(api.macros/defendpoint :get "/current-task"
  "Get the current sync task"
  []
  (when-let [task (remote-sync.task/most-recent-task)]
    (task-status task)))

(api.macros/defendpoint :post "/current-task/cancel"
  "Cancels the current task if one is running"
  []
  (let [task (remote-sync.task/most-recent-task)]
    (api/check-400 (and (some? task) (remote-sync.task/running? task)) "No active task to cancel")
    (remote-sync.task/cancel-sync-task! (:id task))
    (task-status (remote-sync.task/most-recent-task))))

(api.macros/defendpoint :put "/settings"
  "Update Git Sync related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   settings
   :- [:map
       [:remote-sync-enabled {:optional true} [:maybe :boolean]]
       [:remote-sync-url {:optional true} [:maybe :string]]
       [:remote-sync-token {:optional true} [:maybe :string]]
       [:remote-sync-type {:optional true} [:maybe [:enum :production :development]]]
       [:remote-sync-branch {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (try
    (settings/check-and-update-remote-settings! settings)
    (if (and (settings/remote-sync-enabled)
             (= :production (settings/remote-sync-type)))
      {:success true
       :task_id (async-import! (settings/remote-sync-branch) true)}
      {:success true})
    (catch Exception e
      (throw (ex-info "Invalid git settings"
                      {:error           (.getMessage e)
                       :status-code 400} e)))))

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

(api.macros/defendpoint :post "/branches"
  "Create a new branch from an existing branch.
  Requires superuser permissions."
  [_route
   _query
   {:keys [name base_branch]} :- [:map
                                  [:name ms/NonBlankString]
                                  [:base_branch {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (if-let [source (source/source-from-settings)]
    (try
      (source.p/create-branch source name (or base_branch "main"))
      (settings/remote-sync-branch! name)
      {:status "success"
       :message (format "Branch '%s' created from '%s'" name (or base_branch "main"))}
      (catch Exception e
        (log/errorf e "Failed to create branch '%s': %s" name (.getMessage e))
        (throw (ex-info (format "Failed to create branch: %s" (.getMessage e))
                        {:status-code 400}))))
    (throw (ex-info "Git source not configured"
                    {:status-code 400}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/remote-sync` routes."
  (api.macros/ns-handler *ns* +auth))
