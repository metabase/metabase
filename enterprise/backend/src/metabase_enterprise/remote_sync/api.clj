(ns metabase-enterprise.remote-sync.api
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.remote-sync.core :as remote-sync.core]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.git :as source.git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.settings.core :as setting]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-branch-matches-setting!
  "Compare-and-swap guard against the multi-tab staleness hole: the client sends the branch it
  believes it is operating on, and we reject the request when that disagrees with the authoritative
  `remote-sync-branch` setting — e.g. another session switched branches since this client last loaded
  its settings. The setting stays the source of truth; `requested-branch` is only an assertion.

  Throws a 409 carrying `:branch_mismatch true` and the current `:current_branch` so the client can
  refresh its view and retry. Returns the (now-validated) branch on success."
  [requested-branch]
  (let [current (settings/remote-sync-branch)]
    (when-not (= requested-branch current)
      (throw (ex-info (format "The sync branch changed to '%s' in another session. Refresh and try again."
                              current)
                      {:status-code     409
                       :branch_mismatch true
                       :current_branch  current})))
    requested-branch))

(api.macros/defendpoint :post "/import" :- remote-sync.schema/ImportResponse
  "Import Metabase content from configured Remote Sync source.

  This endpoint will:
  - Fetch the latest changes from the configured source
  - Load the updated content using the serialization/deserialization system

  If `force=false` (default) and there are unsaved changes in the Remote Sync collection,
  the import returns a 400 response.

  Requires superuser permissions."
  [_route
   _query
   {:keys [branch force merge expected_branch]}
   :- [:map [:branch {:optional true} ms/NonBlankString]
       [:force {:optional true} :boolean]
       [:merge {:optional true} :boolean]
       ;; the branch the client believes is currently active; rejected if it disagrees with the
       ;; remote-sync-branch setting (a pull/switch from a stale tab). `branch` is the operational
       ;; target (it differs from this on a branch switch); `expected_branch` is only the assertion.
       [:expected_branch ms/NonBlankString]]]
  (api/check-superuser)
  (api/check-400 (settings/remote-sync-enabled) "Remote sync is not configured.")
  (check-branch-matches-setting! expected_branch)
  (let [branch-name (or branch (settings/remote-sync-branch))
        user-id     api/*current-user-id*
        {task-id :id}
        (impl/async-import!
         branch-name force {}
         :merge?     (or merge false)
         :on-success (fn [task-id _result]
                       (impl/publish-sync-event! :event/remote-sync-import task-id {:branch branch-name} user-id)))]
    {:status :success
     :task_id task-id
     :message (when-not task-id "No changes since last import")}))

(api.macros/defendpoint :get "/is-dirty" :- remote-sync.schema/IsDirtyResponse
  "Check if any remote-synced collection or collection item has local changes that have not been pushed
  to the remote sync source."
  []
  (api/check-superuser)
  {:is_dirty (remote-sync.object/dirty?)})

(api.macros/defendpoint :get "/has-remote-changes" :- remote-sync.schema/HasRemoteChangesResponse
  "Check if there are new changes on the remote branch that can be pulled.
   Uses in-memory caching (configurable TTL via remote-sync-check-changes-cache-ttl-seconds setting).

   Returns:
   - has_changes: true if remote version differs from last imported version, or if never imported
   - remote_version: current Git SHA on remote branch
   - local_version: Git SHA of last successful import (nil if never imported)
   - cached: true if result was served from cache"
  [_route-params
   {:keys [force-refresh]} :- [:map [:force-refresh {:optional true} :boolean]]
   _body]
  (api/check-superuser)
  (api/check-400 (settings/remote-sync-enabled) "Remote sync is not configured.")
  (let [result (impl/has-remote-changes? {:force-refresh? force-refresh})]
    (cond-> {:has_changes (:has-changes? result)
             :remote_version (:remote-version result)
             :local_version (:local-version result)
             :cached (:cached? result)}
      (:branch-missing? result) (assoc :branch_missing true))))

(api.macros/defendpoint :get "/dirty" :- remote-sync.schema/DirtyResponse
  "Return all models with changes that have not been pushed to the remote sync source in any
  remote-synced collection."
  []
  (api/check-superuser)
  {:dirty (into []
                (m/distinct-by (juxt :id :model))
                (remote-sync.object/dirty-objects))})

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
   {:keys [message branch force merge]} :- [:map
                                            [:message {:optional true} ms/NonBlankString]
                                            [:branch ms/NonBlankString]
                                            [:force {:optional true} :boolean]
                                            [:merge {:optional true} :boolean]]]
  (api/check-superuser)
  (api/check-400 (settings/remote-sync-enabled) "Remote sync is not configured.")
  (api/check-400 (= (settings/remote-sync-type) :read-write) "Exports are only allowed when remote-sync-type is set to 'read-write'")
  (let [branch-name (check-branch-matches-setting! branch)
        user-id     api/*current-user-id*
        {task-id :id}
        (impl/async-export!
         branch-name
         (or force false)
         (or message "Exported from Metabase")
         :merge?     (or merge false)
         :on-success (fn [task-id _result]
                       (impl/publish-sync-event! :event/remote-sync-export task-id {:branch branch-name} user-id)))]
    {:message "Export task started"
     :task_id task-id}))

(api.macros/defendpoint :get "/export-preflight" :- remote-sync.schema/ExportPreflightResponse
  "Dry-run preview of what pushing the current state would do given the live remote branch, without
  writing anything. Drives the UI's push decision (force / new branch / merge).

  Returns:
  - has_changes: whether the remote branch has advanced beyond the last synced version
  - clean: whether a 3-way merge would apply with no conflicts
  - conflicts: human-readable labels of the entities that conflict (empty when clean)
  - summary: counts of remote changes a merge would fold in
  - force_push_casualties: remote content a force push (rather than a merge) would discard, as
    `{:deleted [labels] :overwritten [labels]}`
  - reason: \"history-rewritten\" when the remote was force-pushed/rebased so no merge base exists

  Requires superuser permissions."
  [_route
   {:keys [branch]} :- [:map [:branch ms/NonBlankString]]]
  (api/check-superuser)
  (api/check-400 (settings/remote-sync-enabled) "Remote sync is not configured.")
  (let [branch-name (check-branch-matches-setting! branch)
        {:keys [diverged? clean? conflicts summary force-push-casualties reason]}
        (impl/preview-export-merge branch-name)]
    {:has_changes            diverged?
     :clean                  clean?
     :conflicts              conflicts
     :summary                summary
     :force_push_casualties  force-push-casualties
     :reason                 (some-> reason name)}))

(api.macros/defendpoint :get "/current-task" :- [:maybe remote-sync.schema/SyncTask]
  "Get the current sync task"
  []
  (api/check-superuser)
  (when-let [task (remote-sync.task/most-recent-task)]
    (t2/hydrate task :status)))

(api.macros/defendpoint :post "/current-task/cancel" :- remote-sync.schema/SyncTask
  "Cancels the current task if one is running"
  []
  (api/check-superuser)
  (let [task (remote-sync.task/most-recent-task)]
    (api/check-400 (and (some? task) (remote-sync.task/running? task)) "No active task to cancel")
    (remote-sync.task/cancel-sync-task! (:id task))
    (t2/hydrate (remote-sync.task/most-recent-task) :status)))

(api.macros/defendpoint :post "/test-connection" :- remote-sync.schema/TestConnectionResponse
  "Test whether the Remote Sync credentials can reach the git repository.

  When called with an empty body, validates the currently saved URL and token. When the body provides
  `remote-sync-url` or `remote-sync-token`, those override the saved values — useful for verifying a
  new Personal Access Token before saving. An obfuscated token (matching the existing token's masked
  representation) is treated as \"unchanged\" and the stored token value is used for the test.

  Only validates connection and authentication; branch existence is not checked here.

  Returns `{:status :success}` on success. On failure, returns a 400 with a user-friendly error
  message describing the connection problem.

  Requires superuser permissions."
  [_route-params
   _query-params
   {:keys [remote-sync-url remote-sync-token] :as body}
   :- [:map
       [:remote-sync-url {:optional true} [:maybe :string]]
       [:remote-sync-token {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (let [current-token   (settings/remote-sync-token)
        obfuscated?     (and remote-sync-token
                             (= remote-sync-token (setting/obfuscate-value current-token)))
        effective-token (if (or obfuscated? (not (contains? body :remote-sync-token)))
                          current-token
                          remote-sync-token)
        effective-url   (or remote-sync-url (settings/remote-sync-url))]
    (api/check-400 (not (str/blank? effective-url)) "Remote sync is not configured.")
    (try
      ;; Runs the URL protocol check; branch/type omitted so the branch-existence path is skipped.
      (settings/check-git-settings! {:remote-sync-url   effective-url
                                     :remote-sync-token effective-token})
      ;; Force a fresh lsRemote so a rotated token is detected on every click, even when the
      ;; cached JGit instance would otherwise short-circuit.
      (-> (source.git/git-source effective-url "HEAD" effective-token nil)
          source.git/branches)
      {:status :success}
      (catch Exception e
        (throw (ex-info (impl/source-error-message e)
                        {:status-code 400} e))))))

(api.macros/defendpoint :put "/settings" :- remote-sync.schema/SettingsUpdateResponse
  "Update Remote Sync related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   {:keys [remote-sync-type collections] :as settings}
   :- [:map
       [:remote-sync-url {:optional true} [:maybe :string]]
       [:remote-sync-token {:optional true} [:maybe :string]]
       [:remote-sync-type {:optional true} [:maybe [:enum :read-only :read-write]]]
       [:remote-sync-branch {:optional true} [:maybe :string]]
       [:remote-sync-auto-import {:optional true} [:maybe :boolean]]
       [:remote-sync-transforms {:optional true} [:maybe :boolean]]
       [:collections {:optional true} [:maybe [:map-of pos-int? :boolean]]]]]
  (api/check-superuser)
  (api/check-400 (not (and (remote-sync.object/dirty?) (= :read-only remote-sync-type)))
                 "There are unsaved changes in the Remote Sync collection which will be overwritten switching to read-only mode.")
  ;; Filter out no-op collection changes before checking read-only mode or running bulk-set
  (let [collections (when (seq collections)
                      (let [current-states (into {}
                                                 (map (juxt :id :is_remote_synced))
                                                 (t2/select [:model/Collection :id :is_remote_synced]
                                                            :id [:in (keys collections)]))]
                        (not-empty
                         (into {}
                               (filter (fn [[id desired]]
                                         (not= (boolean desired)
                                               (boolean (get current-states id)))))
                               collections))))]
    ;; Check if trying to change collections while in read-only mode
    (let [effective-type (or remote-sync-type (settings/remote-sync-type))]
      (api/check-400 (not (and (seq collections) (= :read-only effective-type)))
                     "Cannot change synced collections when remote-sync-type is read-only."))
    (try
      (settings/check-and-update-remote-settings! (dissoc settings :collections))
      (catch Exception e
        (throw (ex-info (or (ex-message e) "Invalid settings")
                        {:error       (ex-message e)
                         :status-code 400} e))))
    (when (seq collections)
      (try
        (remote-sync.core/bulk-set-remote-sync collections)
        (catch Exception e
          (throw (ex-info (or (ex-message e) "Invalid collection settings")
                          {:error       (ex-message e)
                           :status-code 400} e)))))
    (events/publish-event! :event/remote-sync-settings-update
                           {:details {:remote-sync-type remote-sync-type}
                            :user-id api/*current-user-id*})
    (if-let [task-id (impl/finish-remote-config!)]
      {:success true
       :task_id task-id}
      {:success true})))

(api.macros/defendpoint :get "/branches" :- remote-sync.schema/BranchesResponse
  "Get list of branches from the configured source.

  Returns a JSON object with branch names under the :items key.

  Requires superuser permissions."
  []
  (api/check-superuser)
  (let [source (source/source-from-settings)]
    (api/check-400 source "Source not configured. Please configure MB_GIT_SOURCE_REPO_URL environment variable.")
    (try
      (let [branch-list (source.p/branches source)]
        {:items branch-list})
      (catch Exception e
        (log/errorf e "Failed to get branches from source: %s" (ex-message e))
        (let [error-msg (impl/source-error-message e)]
          (throw (ex-info error-msg {:status-code 400}
                          e)))))))

(api.macros/defendpoint :post "/create-branch" :- remote-sync.schema/CreateBranchResponse
  "Create a new branch from the current remote-sync branch and switches the current remote-sync branch to it.
  Requires superuser permissions."
  [_route
   _query
   {:keys [name]} :- [:map [:name ms/NonBlankString]]]
  (api/check-superuser)
  (let [base-branch (or (remote-sync.task/last-version) (settings/remote-sync-branch))]
    (api/check-400 (source/source-from-settings) "Source not configured")
    (api/check-400 base-branch "Base commit not found")
    (try
      (impl/create-branch! name base-branch)
      (events/publish-event! :event/remote-sync-create-branch
                             {:details {:branch_name name
                                        :base_branch base-branch}
                              :user-id api/*current-user-id*})
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
  (api/check-400 (= (settings/remote-sync-type) :read-write) "Stash is only allowed when remote-sync-type is set to 'read-write'")
  (api/check-400 (source/source-from-settings) "Source not configured")
  (try
    (let [user-id       api/*current-user-id*
          {task-id :id} (impl/stash! new-branch message
                                     :on-success (fn [task-id _result]
                                                   (impl/publish-sync-event! :event/remote-sync-stash task-id {:branch new-branch} user-id)))]
      {:status "success"
       :message (str "Stashing to " new-branch)
       :task_id task-id})
    (catch Exception e
      (throw (ex-info (format "Failed to stash changes to branch: %s" (ex-message e))
                      {:status-code 400})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/remote-sync` routes."
  (api.macros/ns-handler *ns* +auth))
