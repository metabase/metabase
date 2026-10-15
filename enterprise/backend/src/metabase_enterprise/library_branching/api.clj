(ns metabase-enterprise.library-branching.api
  (:require
   [metabase-enterprise.library-branching.manifest :as manifest]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]))

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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library-branching` routes."
  (api.macros/ns-handler *ns* +auth))
