(ns metabase.server.middleware.worktree
  "Runs a request in a remote sync worktree: across every worktree while none but the default one exists, else in the
  worktree its `X-Metabase-Worktree-Id` header names, which only superusers can send, else in the one a superuser
  checked out, else in the main app. A request in a worktree that names a workspace also works in that workspace
  ([[metabase.workspaces.core/current-workspace-id]]): its queries and transforms use the workspace's warehouse logins,
  output schemas and table remappings."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util.i18n :refer [tru]]
   [metabase.workspaces.core :as workspaces]))

(set! *warn-on-reflection* true)

(defn- text-response
  "A plain text response with `status` and `body`."
  [status body]
  {:status  status
   :headers {"Content-Type" "text/plain"}
   :body    body})

(defn- id-scope
  "The scope of the worktree with `worktree-id`, the main app's when it is nil."
  [worktree-id]
  (if worktree-id
    {:type :worktree :worktree-id worktree-id}
    {:type :main}))

(defn- header-scope
  "The scope the `X-Metabase-Worktree-Id` header `value` names, `0` naming the main app, or an error response."
  [value]
  (let [worktree (some-> value parse-long remote-sync/worktree-by-id)
        worktree (when-not (:is_default worktree) worktree)]
    (cond
      (not api/*is-superuser?*) {:response (text-response 403 (tru "Only admins can choose a worktree."))}
      (= "0" value)             {:scope {:type :main}}
      worktree                  {:scope (id-scope (:id worktree)) :worktree worktree}
      :else                     {:response (text-response 400 (tru "There is no worktree {0}." value))})))

(defn- request-scope
  "The scope a request with the `X-Metabase-Worktree-Id` header `value`, or none, runs in, or an error response."
  [value]
  (cond
    (not (remote-sync/non-default-worktree-exists?)) (if value (header-scope value) {:scope {:type :all}})
    value                                            (header-scope value)
    api/*is-superuser?*                              {:scope (id-scope (remote-sync/user-worktree-id
                                                                        api/*current-user-id*))}
    :else                                            {:scope {:type :main}}))

(defn- workspace-of
  "The workspace and error response of a request in `scope`, `worktree` being its worktree when the caller read it: the
  id of the workspace its worktree names, or a 400 response when requests can't work in that workspace, as while the
  `request-workspaces-enabled` setting is off. Such a request is refused, never run in no workspace: its transforms
  would write production's tables."
  [{:keys [type worktree-id]} worktree]
  (when-let [workspace-id (when (= :worktree type)
                            (:workspace_id (or worktree (remote-sync/worktree-by-id worktree-id))))]
    (if-let [problem (workspaces/request-workspace-problem workspace-id)]
      {:response (text-response 400 problem)}
      {:workspace-id workspace-id})))

(defn wrap-worktree
  "Middleware that runs a request in the remote sync worktree it works in, and in the workspace that worktree names."
  [handler]
  (fn [request respond raise]
    (let [{:keys [scope response worktree]} (request-scope (get-in request [:headers "x-metabase-worktree-id"]))
          {:keys [workspace-id] :as workspace} (when-not response (workspace-of scope worktree))]
      (if-let [response (or response (:response workspace))]
        (respond response)
        (mdb/with-worktree-scope scope
          (workspaces/with-workspace-id workspace-id
            (handler request respond raise)))))))
