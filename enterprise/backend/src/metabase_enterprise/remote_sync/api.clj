(ns metabase-enterprise.remote-sync.api
  "`/api/ee/remote-sync` endpoints."
  (:require
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.core :as remote-sync]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.merge :as remote-sync.merge]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.sync :as sync]
   [metabase-enterprise.remote-sync.tasks :as tasks]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.serialization.core :as serialization]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-configured!
  "The remote sync context, throwing a 400 when remote sync is not configured."
  []
  (api/check-400 (remote-sync/context) "Remote sync is not configured."))

(defn- check-branch!
  "Throws a 409 when `branch`, the branch the client believes is synced, is not the synced branch."
  [branch]
  (let [current (setting/get :remote-sync-branch)]
    (when-not (= branch current)
      (throw (ex-info (format "The sync branch changed to '%s' in another session. Refresh and try again." current)
                      {:status-code     409
                       :branch_mismatch true
                       :current_branch  current
                       :response/keys   #{:branch_mismatch :current_branch}})))))

(defn- check-read-write!
  "Throws a 400 unless this instance pushes to the remote."
  [action]
  (api/check-400 (= :read-write (setting/get :remote-sync-type))
                 (format "%s is only allowed when remote-sync-type is set to 'read-write'" action)))

(defn- started
  "`task`, throwing a 400 when it is nil because another task is running."
  [task]
  (api/check-400 task "Remote sync in progress"))

(defn- local-changes
  "The changes to the synced content of the app DB since the last sync."
  [ctx]
  (let [repo         (remote-sync.settings/repository)
        base-version (tasks/base-version)]
    (when (and base-version (not (protocol/has-version? repo base-version)))
      (protocol/fetch! repo))
    (sync/local-changes (content/tree-documents ctx repo base-version)
                        (content/local-documents ctx))))

(defn- dirty-item
  "The change `change` as the client lists it."
  [{:keys [key status doc]}]
  (let [[model]      key
        [_ id]       (:row doc)
        row          (when id (remote-sync.db/row model id))
        removed-row  (when-not row (first (serialization/local-rows model [(:entity doc)])))
        current      (or row removed-row)]
    (cond-> {:id          (or (some-> current (get (first (t2/primary-keys model)))) 0)
             :name        (remote-sync.merge/label key doc)
             :model       (u/lower-case-en (name model))
             :sync_status (if (and (= "delete" status) removed-row) "removed" status)}
      (:collection_id current) (assoc :collection_id (:collection_id current))
      (:display current)       (assoc :display (name (:display current)))
      (:table_id current)      (assoc :table_id (:table_id current))
      (contains? current :model_id) (assoc :card_id (:model_id current)))))

(api.macros/defendpoint :post "/import" :- remote-sync.schema/ImportResponse
  "Pull the synced content of the remote branch, or of `branch` to switch to it, into this instance, keeping its local
  changes when `merge`, discarding them when `force`, and refusing when it has some otherwise."
  [_route
   _query
   {:keys [branch force merge expected_branch]}
   :- [:map {:closed true}
       [:branch {:optional true} ms/NonBlankString]
       [:force {:optional true} :boolean]
       [:merge {:optional true} :boolean]
       [:expected_branch {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (let [ctx    (check-configured!)
        branch (or branch (setting/get :remote-sync-branch))
        user   api/*current-user-id*]
    (some-> expected_branch check-branch!)
    (when-not (or force merge)
      (when-let [changes (seq (local-changes ctx))]
        (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                        {:status-code   400
                         :conflicts     true
                         :dirty_objects (mapv dirty-item changes)
                         :response/keys #{:conflicts :dirty_objects}}))))
    (let [task (started (tasks/start! {:type "import" :branch branch :user-id user :event :event/remote-sync-import}
                                      (fn [_report]
                                        (sync/pull! (remote-sync.settings/repository) branch ctx (tasks/base-version)
                                                    {:force? force}))))]
      {:status :success :task_id (:id task)})))

(api.macros/defendpoint :get "/is-dirty" :- remote-sync.schema/IsDirtyResponse
  "Whether the synced content of this instance changed since the last sync."
  []
  (api/check-superuser)
  {:is_dirty (boolean (some-> (remote-sync/context) local-changes seq))})

(api.macros/defendpoint :get "/dirty" :- remote-sync.schema/DirtyResponse
  "The synced content of this instance that changed since the last sync."
  []
  (api/check-superuser)
  {:dirty (mapv dirty-item (some-> (remote-sync/context) local-changes))})

(api.macros/defendpoint :get "/has-remote-changes" :- remote-sync.schema/HasRemoteChangesResponse
  "Whether the remote branch moved on since the last sync."
  [_route-params
   _query :- [:map {:closed true} [:force-refresh {:optional true} :boolean]]
   _body]
  (api/check-superuser)
  (check-configured!)
  (let [repo  (remote-sync.settings/repository)
        _     (protocol/fetch! repo)
        tip   (protocol/version repo (setting/get :remote-sync-branch))
        local (tasks/base-version)]
    (cond-> {:has_changes    (and (some? tip) (not= tip local))
             :remote_version tip
             :local_version  local
             :cached         false}
      (nil? tip) (assoc :branch_missing true))))

(api.macros/defendpoint :post "/export" :- remote-sync.schema/ExportResponse
  "Push the synced content of this instance to `branch`, the synced branch, overwriting the changes of the remote since
  the last sync when `force`, merging them in when `merge`, and stopping otherwise."
  [_route
   _query
   {:keys [message branch force merge]} :- [:map {:closed true}
                                            [:message {:optional true} ms/NonBlankString]
                                            [:branch ms/NonBlankString]
                                            [:force {:optional true} :boolean]
                                            [:merge {:optional true} :boolean]]]
  (api/check-superuser)
  (let [ctx  (check-configured!)
        user api/*current-user-id*]
    (check-read-write! "Exports")
    (check-branch! branch)
    (let [task (started (tasks/start! {:type "export" :branch branch :user-id user :event :event/remote-sync-export}
                                      (fn [_report]
                                        (sync/push! (remote-sync.settings/repository) branch ctx (tasks/base-version)
                                                    {:force?  force
                                                     :merge?  merge
                                                     :message (or message "Exported from Metabase")}))))]
      {:message "Export task started" :task_id (:id task)})))

(api.macros/defendpoint :get "/export-preflight" :- remote-sync.schema/ExportPreflightResponse
  "What a push to `branch`, the synced branch, would do: whether the remote changed since the last sync, and what a
  merge would conflict on, merge in, and what a force push would discard."
  [_route
   {:keys [branch]} :- [:map {:closed true} [:branch ms/NonBlankString]]]
  (api/check-superuser)
  (let [ctx (check-configured!)]
    (check-branch! branch)
    (let [{:keys [base ours theirs remote-changed? history-rewritten?]}
          (sync/state (remote-sync.settings/repository) branch ctx (tasks/base-version))
          {:keys [conflicts summary casualties]} (remote-sync.merge/merge-documents base ours theirs)]
      {:has_changes           remote-changed?
       :clean                 (empty? conflicts)
       :conflicts             conflicts
       :summary               summary
       :force_push_casualties casualties
       :reason                (when history-rewritten? "history-rewritten")})))

(defn- present-task
  "`task` as the client shows it."
  [task]
  (-> (t2/hydrate task :status :initiated_by_user)
      (update :initiated_by_user #(some-> % (select-keys [:id :first_name :last_name :email])))))

(api.macros/defendpoint :get "/current-task" :- [:maybe remote-sync.schema/SyncTask]
  "The most recent task."
  []
  (api/check-superuser)
  (remote-sync.task/supersede-stale-tasks!)
  (some-> (remote-sync.task/most-recent-task) present-task))

(api.macros/defendpoint :post "/current-task/cancel" :- remote-sync.schema/SyncTask
  "Cancel the running task."
  []
  (api/check-superuser)
  (let [task (remote-sync.task/most-recent-task)]
    (api/check-400 (some-> task remote-sync.task/running?) "No active task to cancel")
    (remote-sync.task/cancel-sync-task! (:id task))
    (present-task (remote-sync.task/most-recent-task))))

(api.macros/defendpoint :post "/test-connection" :- remote-sync.schema/TestConnectionResponse
  "Check that the saved repository, or the one of `remote-sync-url` and `remote-sync-token`, can be reached."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:remote-sync-url {:optional true} [:maybe :string]]
            [:remote-sync-token {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (try
    (remote-sync.settings/check-repository! body)
    {:status :success}
    (catch Exception e
      (throw (ex-info (tasks/error-message e) {:status-code 400} e)))))

(api.macros/defendpoint :put "/settings" :- remote-sync.schema/SettingsUpdateResponse
  "Update the remote sync settings, and which collections are synced."
  [_route-params
   _query-params
   {:keys [collections] :as settings}
   :- [:map {:closed true}
       [:remote-sync-url {:optional true} [:maybe :string]]
       [:remote-sync-token {:optional true} [:maybe :string]]
       [:remote-sync-type {:optional true} [:maybe [:enum :read-only :read-write]]]
       [:remote-sync-branch {:optional true} [:maybe :string]]
       [:remote-sync-auto-import {:optional true} [:maybe :boolean]]
       [:remote-sync-transforms {:optional true} [:maybe :boolean]]
       [:collections {:optional true} [:maybe [:map-of pos-int? :boolean]]]]]
  (api/check-superuser)
  (api/check-400 (nil? (remote-sync.task/current-task)) "Remote sync in progress")
  (try
    (remote-sync.settings/save! (dissoc settings :collections))
    (remote-sync.settings/set-synced-collections! collections)
    (catch clojure.lang.ExceptionInfo e
      (throw (ex-info (ex-message e) (merge {:status-code 400} (ex-data e)) e))))
  (events/publish-event! :event/remote-sync-settings-update
                         {:details {:remote-sync-type (:remote-sync-type settings)}
                          :user-id api/*current-user-id*})
  (if-let [ctx (when (= :read-only (setting/get :remote-sync-type)) (remote-sync/context))]
    (let [branch (setting/get :remote-sync-branch)
          task   (tasks/start! {:type "import" :branch branch :user-id api/*current-user-id*}
                               (fn [_report]
                                 (sync/pull! (remote-sync.settings/repository) branch ctx (tasks/base-version)
                                             {:force? true})))]
      (cond-> {:success true} task (assoc :task_id (:id task))))
    {:success true}))

(api.macros/defendpoint :get "/branches" :- remote-sync.schema/BranchesResponse
  "The branches of the repository."
  []
  (api/check-superuser)
  (check-configured!)
  (try
    {:items (protocol/branches (remote-sync.settings/repository))}
    (catch Exception e
      (throw (ex-info (tasks/error-message e) {:status-code 400} e)))))

(api.macros/defendpoint :post "/create-branch" :- remote-sync.schema/CreateBranchResponse
  "Create the branch `name` at the version of the last sync, and sync with it."
  [_route
   _query
   {:keys [name]} :- [:map {:closed true} [:name ms/NonBlankString]]]
  (api/check-superuser)
  (check-configured!)
  (let [repo (remote-sync.settings/repository)
        base (or (tasks/base-version)
                 (do (protocol/fetch! repo) (protocol/version repo (setting/get :remote-sync-branch))))]
    (api/check-400 base "Base commit not found")
    (try
      (protocol/create-branch! repo name base)
      (setting/set! :remote-sync-branch name)
      (events/publish-event! :event/remote-sync-create-branch {:details {:branch_name name :base_branch base}
                                                               :user-id api/*current-user-id*})
      {:status "success" :message (format "Branch '%s' created from '%s'" name base)}
      (catch Exception e
        (throw (ex-info (format "Failed to create branch: %s" (ex-message e)) {:status-code 400} e))))))

(api.macros/defendpoint :post "/stash" :- remote-sync.schema/StashResponse
  "Push the synced content of this instance to the new branch `new_branch`, created at the version of the last sync,
  and sync with it."
  [_route
   _query
   {new-branch :new_branch message :message} :- [:map {:closed true}
                                                 [:new_branch ms/NonBlankString]
                                                 [:message ms/NonBlankString]]]
  (api/check-superuser)
  (let [ctx  (check-configured!)
        user api/*current-user-id*]
    (check-read-write! "Stash")
    (let [task (started (tasks/start! {:type "export" :branch new-branch :user-id user :event :event/remote-sync-stash}
                                      (fn [_report]
                                        (let [repo (remote-sync.settings/repository)
                                              base (or (tasks/base-version)
                                                       (do (protocol/fetch! repo)
                                                           (protocol/version repo (setting/get :remote-sync-branch))))]
                                          (protocol/create-branch! repo new-branch base)
                                          (sync/push! repo new-branch ctx base {:message message})))))]
      {:status "success" :message (str "Stashing to " new-branch) :task_id (:id task)})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/remote-sync` routes."
  (api.macros/ns-handler *ns* +auth))
