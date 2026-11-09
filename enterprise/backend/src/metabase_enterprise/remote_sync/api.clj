(ns metabase-enterprise.remote-sync.api
  "`/api/ee/remote-sync` endpoints."
  (:require
   [metabase-enterprise.remote-sync.content :as content]
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
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-configured!
  "Throws a 400 when remote sync is not configured."
  []
  (api/check-400 (remote-sync.settings/remote-sync-enabled) (tru "Remote sync isn''t set up.")))

(defn- check-branch!
  "Throws a 409 when `branch`, the branch the client believes is synced, is not the synced branch."
  [branch]
  (let [current (setting/get :remote-sync-branch)]
    (when-not (= branch current)
      (throw (ex-info (tru "The branch changed to {0} in another session. Refresh the page and try again." current)
                      {:status-code     409
                       :branch_mismatch true
                       :current_branch  current
                       :response/keys   #{:branch_mismatch :current_branch}})))))

(defn- check-read-write!
  "Throws a 400 unless this instance pushes to the remote."
  []
  (api/check-400 (= :read-write (setting/get :remote-sync-type))
                 (tru "You can only push from a read-write instance.")))

(defn- started
  "`task`, throwing a 400 when it is nil because another task is running."
  [task]
  (api/check-400 task (tru "A sync is already running. Try again when it finishes.")))

(defn- local-changes
  "The changes to the synced content of the app DB since the last sync, all of it when the repository lacks the version
  of the last sync."
  []
  (let [repo         (remote-sync.settings/repository)
        base-version (tasks/base-version)
        known?       #(protocol/has-version? repo base-version)]
    (when (and base-version (not (known?)))
      (protocol/fetch! repo))
    (sync/local-changes (content/tree-documents repo (when (and base-version (known?)) base-version))
                        (content/local-documents))))

(defn- dirty-item
  "The change `change` as the client lists it."
  [{:keys [key status doc]}]
  (let [[model]      key
        [_ id]       (:row doc)
        row          (when id (remote-sync.db/row model id))
        removed-row  (when-not row (first (serialization/local-rows model [(:entity doc)])))
        current      (or row removed-row)
        collection-id (some->> current (remote-sync/synced-collection-id model))]
    (cond-> {:id          (or (some-> current (get (first (t2/primary-keys model)))) 0)
             :name        (remote-sync.merge/label key doc)
             :model       (u/lower-case-en (name model))
             :sync_status (if (and (= "delete" status) removed-row) "removed" status)}
      collection-id                 (assoc :collection_id collection-id)
      (contains? current :model_id) (assoc :model_id (:model_id current)))))

(defn- with-collections
  "The `items` with the collection each change belongs to, the entity itself for a collection, with its effective
  ancestors in place of its id."
  [items]
  (let [ids     (into [] (comp (keep :collection_id) (distinct)) items)
        by-id   (when (seq ids)
                  (into {}
                        (map (juxt :id (fn [collection]
                                         (-> (select-keys collection [:id :name :type :effective_ancestors])
                                             (update :effective_ancestors #(filterv (comp pos-int? :id) %))))))
                        (t2/hydrate (remote-sync.db/collections ids) :effective_ancestors)))]
    (mapv (fn [{:keys [collection_id] :as item}]
            (cond-> (dissoc item :collection_id)
              (get by-id collection_id) (assoc :collection (get by-id collection_id))))
          items)))

(defn- entity-ref
  "The `row` of `model` as the client names it."
  [model row]
  {:id    (get row (first (t2/primary-keys model)))
   :name  (or (remote-sync/synced-label model row) "")
   :model (u/lower-case-en (name model))})

(defn- unsynced-dependency
  "The unsynced dependency `dependency` as the client lists it."
  [{:keys [model row used-by]}]
  (assoc (entity-ref model row)
         :collection_id (remote-sync/synced-collection-id model row)
         :used_by       (mapv #(apply entity-ref %) used-by)))

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
  (check-configured!)
  (let [branch (or branch (setting/get :remote-sync-branch))
        user   api/*current-user-id*]
    (some-> expected_branch check-branch!)
    (when-not (or force merge)
      (when-let [changes (seq (local-changes))]
        (throw (ex-info (tru "You have changes that aren''t pushed yet. Pull again to keep or discard them.")
                        {:status-code   400
                         :conflicts     true
                         :dirty_objects (with-collections (map dirty-item changes))
                         :response/keys #{:conflicts :dirty_objects}}))))
    (let [task (started (tasks/start! {:type "import" :branch branch :user-id user :event :event/remote-sync-import}
                                      (fn [report]
                                        (sync/pull! (remote-sync.settings/repository) branch (tasks/base-version)
                                                    {:force? force :report report}))))]
      {:status :success :task_id (:id task)})))

(api.macros/defendpoint :get "/is-dirty" :- remote-sync.schema/IsDirtyResponse
  "Whether the synced content of this instance changed since the last sync."
  []
  (api/check-superuser)
  {:is_dirty (boolean (and (remote-sync.settings/remote-sync-enabled) (seq (local-changes))))})

(api.macros/defendpoint :get "/dirty" :- remote-sync.schema/DirtyResponse
  "The synced content of this instance that changed since the last sync."
  []
  (api/check-superuser)
  {:dirty (if (remote-sync.settings/remote-sync-enabled) (with-collections (map dirty-item (local-changes))) [])})

(api.macros/defendpoint :get "/has-remote-changes" :- remote-sync.schema/HasRemoteChangesResponse
  "Whether the remote branch moved on since the last sync."
  []
  (api/check-superuser)
  (check-configured!)
  (let [repo  (remote-sync.settings/repository)
        _     (protocol/fetch! repo)
        tip   (protocol/version repo (setting/get :remote-sync-branch))
        local (tasks/base-version)]
    (cond-> {:has_changes    (and (some? tip) (not= tip local))
             :remote_version tip
             :local_version  local}
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
  (check-configured!)
  (let [user api/*current-user-id*]
    (check-read-write!)
    (check-branch! branch)
    (let [task (started (tasks/start! {:type "export" :branch branch :user-id user :event :event/remote-sync-export}
                                      (fn [report]
                                        (sync/push! (remote-sync.settings/repository) branch (tasks/base-version)
                                                    {:force?  force
                                                     :merge?  merge
                                                     :message (or message "Exported from Metabase")
                                                     :report  report}))))]
      {:message (tru "Pushing changes") :task_id (:id task)})))

(api.macros/defendpoint :get "/export-preflight" :- remote-sync.schema/ExportPreflightResponse
  "What a push to `branch`, the synced branch, would do: whether the remote changed since the last sync, and what a
  merge would conflict on, merge in, and what a force push would discard."
  [_route
   {:keys [branch]} :- [:map {:closed true} [:branch ms/NonBlankString]]]
  (api/check-superuser)
  (check-configured!)
  (check-branch! branch)
  (let [{:keys [base ours theirs remote-changed? history-rewritten?]}
        (sync/state (remote-sync.settings/repository) branch (tasks/base-version))
        {:keys [conflicts summary casualties]} (remote-sync.merge/merge-documents base ours theirs)]
    {:has_changes           remote-changed?
     :clean                 (empty? conflicts)
     :conflicts             conflicts
     :summary               summary
     :force_push_casualties casualties
     :reason                (when history-rewritten? "history-rewritten")}))

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
    (api/check-400 (some-> task remote-sync.task/running?) (tru "No sync is running."))
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
       [:collections {:optional true} [:maybe [:map-of pos-int? :boolean]]]]]
  (api/check-superuser)
  (api/check-400 (nil? (remote-sync.task/current-task)) (tru "A sync is already running. Try again when it finishes."))
  (try
    (remote-sync.settings/save! (dissoc settings :collections))
    (remote-sync.settings/set-synced-collections! collections)
    (catch clojure.lang.ExceptionInfo e
      (throw (ex-info (ex-message e)
                      (if-let [dependencies (:unsynced-dependencies (ex-data e))]
                        {:status-code           400
                         :error-code            "unsynced-dependencies"
                         :unsynced_dependencies (with-collections (map unsynced-dependency dependencies))
                         :response/keys         #{:unsynced_dependencies}}
                        (merge {:status-code 400} (ex-data e)))
                      e))))
  (events/publish-event! :event/remote-sync-settings-update
                         {:details {:remote-sync-type (:remote-sync-type settings)}
                          :user-id api/*current-user-id*})
  (if (remote-sync/read-only?)
    (let [branch (setting/get :remote-sync-branch)
          task   (tasks/start! {:type "import" :branch branch :user-id api/*current-user-id*}
                               (fn [report]
                                 (sync/pull! (remote-sync.settings/repository) branch (tasks/base-version)
                                             {:force? true :report report})))]
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

(api.macros/defendpoint :post "/stash" :- remote-sync.schema/StashResponse
  "Push the synced content of this instance to the new branch `new_branch`, created at the version of the last sync,
  and sync with it."
  [_route
   _query
   {new-branch :new_branch message :message} :- [:map {:closed true}
                                                 [:new_branch ms/NonBlankString]
                                                 [:message ms/NonBlankString]]]
  (api/check-superuser)
  (check-configured!)
  (let [user api/*current-user-id*]
    (check-read-write!)
    (let [task (started (tasks/start! {:type "export" :branch new-branch :user-id user :event :event/remote-sync-stash}
                                      (fn [report]
                                        (let [repo (remote-sync.settings/repository)
                                              base (or (tasks/base-version)
                                                       (do (protocol/fetch! repo)
                                                           (protocol/version repo (setting/get :remote-sync-branch))))]
                                          (protocol/create-branch! repo new-branch base)
                                          (sync/push! repo new-branch base {:message message :report report})))))]
      {:status "success" :message (tru "Pushing changes to {0}" new-branch) :task_id (:id task)})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/remote-sync` routes."
  (api.macros/ns-handler *ns* +auth))
