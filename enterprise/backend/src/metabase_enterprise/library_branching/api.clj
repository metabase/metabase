(ns metabase-enterprise.library-branching.api
  (:require
   [metabase-enterprise.library-branching.manifest :as manifest]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/count" :- [:map-of (into [:enum] (sort scope/kinds)) nat-int?]
  "The number of items that library branching syncs, by kind. Superuser only."
  []
  (api/check-superuser)
  (scope/scope-count))

(api.macros/defendpoint :get "/manifest" :- [:map
                                             [:status [:= 200]]
                                             [:headers [:map-of :string :string]]
                                             [:body :string]]
  "The manifest of this instance as the YAML file that CI reads: its databases, schemas, tables and fields, with
  their types. No data and no connection details. Superuser only."
  []
  (api/check-superuser)
  {:status  200
   :headers {"Content-Type" "application/yaml; charset=utf-8"}
   :body    (String. (manifest/manifest-yaml) java.nio.charset.StandardCharsets/UTF_8)})

(api.macros/defendpoint :get "/current-task" :- [:maybe ::tasks/task]
  "The newest library branching task, open or ended, with its initiating user; no content when there is no task. A
  stale open task is ended as interrupted first. Superuser only."
  []
  (api/check-superuser)
  (when-let [task (tasks/newest-task)]
    (if (tasks/stale? task)
      (do (tasks/supersede-stale!)
          (tasks/newest-task))
      task)))

(api.macros/defendpoint :post "/current-task/cancel" :- ::tasks/task
  "Cancels the newest library branching task, and returns it. 400 when it is not running: it ended, or a push is past
  its commit point. Superuser only."
  []
  (api/check-superuser)
  (let [task (tasks/newest-task)]
    (api/check-400 (tasks/open? task) (tru "No active task to cancel"))
    (let [{:keys [ok refused]} (tasks/cancel! (:id task))]
      (api/check-400 (not= "committing" refused)
                     (tru "The task is past its commit point, so it can no longer be cancelled."))
      (api/check-400 ok (tru "No active task to cancel"))
      ok)))

(api.macros/defendpoint :post "/test-connection" :- [:map [:status [:= "success"]]]
  "Tests whether the repository URL and the access token reach the repository, with a fresh remote call. A URL or a
  token in the body overrides the saved one; the obfuscated saved token means the saved token. 400 with the message
  for the person when no URL is given or saved, and when the call fails. Superuser only."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:remote-sync-url {:optional true} [:maybe :string]]
            [:remote-sync-token {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (repository/test-connection! body)
  {:status "success"})

(api.macros/defendpoint :put "/settings" :- [:map
                                             [:success [:= true]]
                                             [:task_id {:optional true} pos-int?]]
  "Saves the repository settings that library branching shares with remote sync. A blank URL turns library branching
  off. The obfuscated saved token keeps the saved token, and a value from an environment variable stays. A change of
  the URL, the token, the type or the branch is checked against the repository first. After the save, a consumption
  instance with a branch starts a deploy, and the response has its task id. 400 while a task runs, and when the check
  fails. Superuser only."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:remote-sync-url {:optional true} [:maybe :string]]
            [:remote-sync-token {:optional true} [:maybe :string]]
            [:remote-sync-type {:optional true} [:maybe [:enum :read-only :read-write]]]
            [:remote-sync-branch {:optional true} [:maybe :string]]
            [:remote-sync-auto-import {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (repository/save-settings! body api/*current-user-id*)
  (if-let [task (operations/start-deploy-after-save! api/*current-user-id*)]
    {:success true :task_id (:id task)}
    {:success true}))

(api.macros/defendpoint :get "/branches" :- [:map [:items [:sequential :string]]]
  "The names of the branches of the repository now, with a fresh remote call. 400 when no repository is configured,
  and with the message for the person when the call fails. Superuser only."
  []
  (api/check-superuser)
  (api/check-400 (repository/configured?) (tru "Library branching is not configured."))
  {:items (vec (try
                 (repository/do-with-store store/branches)
                 (catch Exception e
                   (throw (ex-info (repository/failure-message e) {:status-code 400} e)))))})

(defn- task-response [{:keys [id]}]
  {:task_id id})

(api.macros/defendpoint :post "/push" :- [:map [:task_id pos-int?]]
  "Starts a push of the synced snapshot to the configured branch, as a task, and returns its id. 400 when library
  branching is off or not configured, on a read-only instance, and while a task runs. Superuser only."
  [_route-params
   _query-params
   {:keys [message]} :- [:map {:closed true}
                         [:message {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (task-response (operations/start-push! api/*current-user-id* message)))

(api.macros/defendpoint :post "/pull" :- [:map [:task_id pos-int?]]
  "Starts a pull of the configured branch into the instance, as a task, and returns its id. 400 as for a push.
  Superuser only."
  []
  (api/check-superuser)
  (task-response (operations/start-pull! api/*current-user-id*)))

(api.macros/defendpoint :post "/merge-branch" :- [:map [:task_id pos-int?]]
  "Starts a merge of branch `from` into branch `into` (default: the configured branch) in the repository, as a task,
  and returns its id. 400 as for a push. Superuser only."
  [_route-params
   _query-params
   {:keys [from into]} :- [:map {:closed true}
                           [:from ms/NonBlankString]
                           [:into {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (task-response (operations/start-merge-branch! api/*current-user-id* into from)))

(api.macros/defendpoint :post "/deploy" :- [:map [:task_id pos-int?]]
  "Starts a deploy of the configured branch onto this consumption instance, as a task, and returns its id. 400 when
  library branching is off or not configured, on a creation instance, and while a task runs. Superuser only."
  []
  (api/check-superuser)
  (task-response (operations/start-deploy! api/*current-user-id*)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library-branching` routes."
  (api.macros/ns-handler *ns* +auth))
