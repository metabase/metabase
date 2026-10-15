(ns metabase-enterprise.library-branching.api
  (:require
   [metabase-enterprise.library-branching.manifest :as manifest]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.status :as status]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.settings.core :as setting]
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

(defn- status-branch
  "The configured branch of the status routes. Throws 400 when no repository or no branch is configured."
  []
  (api/check-400 (repository/configured?) (tru "Library branching is not configured."))
  (or (repository/branch)
      (throw (ex-info (tru "Library branching has no branch.") {:status-code 400}))))

(defn- with-store
  "`(f store)` with a new store of the configured repository. A failed remote call throws 400 with the message for the
  person."
  [f]
  (try
    (repository/do-with-store f)
    (catch clojure.lang.ExceptionInfo e
      (if (:operation (ex-data e))
        (throw (ex-info (repository/failure-message e) {:status-code 400} e))
        (throw e)))))

(def ^:private Identity
  [:or :string [:sequential [:maybe :string]]])

(def ^:private ChangeSet
  [:map
   [:created [:sequential Identity]]
   [:deleted [:sequential Identity]]
   [:updated [:sequential Identity]]])

(def ^:private Findings
  [:maybe [:sequential :map]])

(defn- change-set-response
  "Change set `changes` with each set of identities as a list in the order of the identities."
  [changes]
  (some-> changes (update-vals #(vec (sort snapshot/compare-identities %)))))

(api.macros/defendpoint :get "/status" :- [:map
                                           [:base [:maybe :string]]
                                           [:head [:maybe :string]]
                                           [:branch_missing :boolean]
                                           [:base_lost :boolean]
                                           [:head_findings Findings]
                                           [:local ChangeSet]
                                           [:remote [:maybe ChangeSet]]
                                           [:shadowed_tables [:sequential [:map
                                                                           [:id pos-int?]
                                                                           [:name :string]
                                                                           [:key Identity]
                                                                           [:message :string]]]]]
  "The status of the instance and the configured branch: the base, the head, whether the branch is missing, whether no
  branch holds the base (then nothing shows as synced), the findings of the head, the local and remote changes as
  identities, and the published tables that do not sync because another published table has their key, each with a
  message for the person. 400 when no repository or branch is configured, and with the message for the person when
  the remote call fails. Superuser only."
  []
  (api/check-superuser)
  (let [branch (status-branch)
        {:keys [base head branch-missing base-lost head-findings local remote shadowed-tables]}
        (with-store #(status/status (operations/instance) % branch {}))]
    {:base           base
     :head           head
     :branch_missing branch-missing
     :base_lost      base-lost
     :head_findings  head-findings
     :local           (change-set-response local)
     :remote          (change-set-response remote)
     :shadowed_tables (mapv (fn [t] (assoc (select-keys t [:id :name :key]) :message (scope/shadowed-message t)))
                            shadowed-tables)}))

(api.macros/defendpoint :get "/is-dirty" :- [:map [:is_dirty :boolean]]
  "Whether the synced content of the instance differs from the content of its base. 400 when no repository or branch
  is configured. Superuser only."
  []
  (api/check-superuser)
  (let [branch (status-branch)]
    {:is_dirty (status/changed? (:changes (status/local-changes (operations/instance) with-store branch {})))}))

(api.macros/defendpoint :get "/dirty" :- [:map [:dirty [:sequential [:map
                                                                     [:id Identity]
                                                                     [:kind [:maybe :string]]
                                                                     [:name [:maybe :string]]
                                                                     [:change [:enum "created" "updated" "deleted"]]]]]]
  "The local changes of the instance: for each changed item, its identity, kind, name and change type (created,
  updated or deleted), in the order of the identities. A deleted item has the kind and the name of the base, or none
  when no branch holds the base. 400 when no repository or branch is configured. Superuser only."
  []
  (api/check-superuser)
  (let [branch (status-branch)
        {:keys [base local changes]} (status/local-changes (operations/instance) with-store branch {})
        base-snapshot (when (seq (:deleted changes))
                        (with-store #(status/base-snapshot % branch base {})))]
    {:dirty (mapv (fn [{:keys [kind change] :as entry}]
                    (assoc entry :kind (some-> kind name) :change (name change)))
                  (status/change-list changes local base-snapshot))}))

(api.macros/defendpoint :get "/has-remote-changes" :- [:map
                                                       [:has_changes :boolean]
                                                       [:remote_version [:maybe :string]]
                                                       [:local_version [:maybe :string]]
                                                       [:cached :boolean]
                                                       [:branch_missing {:optional true} :boolean]]
  "Whether the configured branch has changes of content since the base: a new commit with equal content has none. The
  answer is cached for `remote-sync-check-changes-cache-ttl-seconds`, for the repository, the branch and the base;
  `force-refresh` reads the remote again. A branch that does not exist gives `has_changes` false and `branch_missing`
  true, and is not cached. 400 when no repository or branch is configured, and with the message for the person when the
  remote call fails. Superuser only."
  [_route-params
   {:keys [force-refresh]} :- [:map {:closed true} [:force-refresh {:optional true} :boolean]]]
  (api/check-superuser)
  (let [branch (status-branch)
        {:keys [has-changes remote-version local-version cached branch-missing]}
        (status/has-remote-changes! (operations/instance) with-store
                                    {:url            (repository/url)
                                     :branch         branch
                                     :ttl-seconds    (setting/get :remote-sync-check-changes-cache-ttl-seconds)
                                     :force-refresh? (boolean force-refresh)})]
    (cond-> {:has_changes    has-changes
             :remote_version remote-version
             :local_version  local-version
             :cached         cached}
      branch-missing (assoc :branch_missing true))))

(api.macros/defendpoint :get "/push-preview" :- [:map
                                                 [:has_changes :boolean]
                                                 [:clean :boolean]
                                                 [:conflicts [:sequential [:map
                                                                           [:id Identity]
                                                                           [:kind [:maybe :string]]
                                                                           [:name [:maybe :string]]]]]
                                                 [:violations [:sequential :map]]
                                                 [:summary [:map [:added :int] [:updated :int] [:removed :int]]]
                                                 [:branch_missing :boolean]
                                                 [:base_lost :boolean]
                                                 [:head_findings Findings]]
  "What a push of the instance to the configured branch meets: whether the branch moved since the base
  (`has_changes`), whether a merge of the base, the instance and the head is clean, its conflicts and violations, and
  the numbers of items that the merge takes from the head. Writes nothing. 400 when no repository or branch is
  configured, and with the message for the person when the remote call fails. Superuser only."
  []
  (api/check-superuser)
  (let [branch (status-branch)
        {:keys [diverged clean conflicts violations summary branch-missing base-lost head-findings]}
        (with-store #(status/push-preview (operations/instance) % branch {}))]
    {:has_changes    diverged
     :clean          clean
     :conflicts      (mapv #(update % :kind (fn [k] (some-> k name))) conflicts)
     :violations     violations
     :summary        summary
     :branch_missing branch-missing
     :base_lost      base-lost
     :head_findings  head-findings}))

(defn- task-response [{:keys [id]}]
  {:task_id id})

(api.macros/defendpoint :post "/push" :- [:map [:task_id pos-int?]]
  "Starts a push of the synced snapshot to the configured branch, as a task, and returns its id. With `new_branch`, the
  push creates that branch instead, and the instance uses it after the push. 400 when library branching is off or not
  configured, on a read-only instance, and while a task runs; for a new branch, also for a name that is not a valid
  branch name, and when the branch setting comes from an environment variable. Superuser only."
  [_route-params
   _query-params
   {:keys [message new_branch]} :- [:map {:closed true}
                                    [:message {:optional true} ms/NonBlankString]
                                    [:new_branch {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (task-response (operations/start-push! api/*current-user-id* message new_branch)))

(api.macros/defendpoint :post "/pull" :- [:map [:task_id pos-int?]]
  "Starts a pull of the configured branch into the instance, as a task, and returns its id. A pull of `branch`, another
  branch than the configured one, is a switch to it. 400 as for a push. Superuser only."
  [_route-params
   _query-params
   {:keys [branch]} :- [:maybe [:map {:closed true}
                                [:branch {:optional true} ms/NonBlankString]]]]
  (api/check-superuser)
  (task-response (operations/start-pull! api/*current-user-id* branch)))

(api.macros/defendpoint :post "/create-branch" :- [:map [:task_id pos-int?]]
  "Starts the creation of branch `name` at the head of branch `from` (default: the configured branch), as a task, and
  returns its id. The instance uses the new branch after it, with the same base. 400 as for a push to a new branch.
  Superuser only."
  [_route-params
   _query-params
   {branch-name :name :keys [from]} :- [:map {:closed true}
                                        [:name ms/NonBlankString]
                                        [:from {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (task-response (operations/start-create-branch! api/*current-user-id* branch-name from)))

(api.macros/defendpoint :post "/switch-branch" :- [:map [:task_id pos-int?]]
  "Starts a switch of the instance to branch `branch`, as a task, and returns its id. The switch is a pull of `branch`:
  local changes are kept or are conflicts, and the branch setting changes only when the switch succeeds. 400 when
  library branching is off or not configured, on a read-only instance, while a task runs, and when the branch setting
  comes from an environment variable. Superuser only."
  [_route-params
   _query-params
   {:keys [branch]} :- [:map {:closed true}
                        [:branch ms/NonBlankString]]]
  (api/check-superuser)
  (task-response (operations/start-switch! api/*current-user-id* branch)))

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
