(ns metabase.server.middleware.worktree
  "Runs a request in a remote sync worktree: across every worktree while none but the default one exists and the
  instance is no workspace, else in the worktree its `X-Metabase-Worktree-Id` header names, which only superusers can
  send, else in the one a superuser checked out, else in the main app."
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
      worktree                  {:scope (id-scope (:id worktree))}
      :else                     {:response (text-response 400 (tru "There is no worktree {0}." value))})))

(defn- views-used?
  "Whether the worktree views show something other than the stored Tables and Fields: a worktree other than the default
  one exists, or the instance is a workspace, whose table remappings they apply."
  []
  (or (remote-sync/non-default-worktree-exists?)
      (workspaces/workspace-mode?)))

(defn- request-scope
  "The scope a request with the `X-Metabase-Worktree-Id` header `value`, or none, runs in, or an error response."
  [value]
  (cond
    (not (views-used?)) (if value (header-scope value) {:scope {:type :all}})
    value               (header-scope value)
    api/*is-superuser?* {:scope (id-scope (remote-sync/user-worktree-id api/*current-user-id*))}
    :else               {:scope {:type :main}}))

(defn wrap-worktree
  "Middleware that runs a request in the remote sync worktree it works in."
  [handler]
  (fn [request respond raise]
    (let [{:keys [scope response]} (request-scope (get-in request [:headers "x-metabase-worktree-id"]))]
      (if response
        (respond response)
        (mdb/with-worktree-scope scope
          (handler request respond raise))))))
