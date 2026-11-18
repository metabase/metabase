(ns metabase.server.middleware.workspace
  "Runs a request in the workspace its `X-Metabase-Workspace-Id` header names, which only superusers can send. In a
  workspace, a request's queries and transforms use the workspace's warehouse login, output schemas and table
  remappings ([[metabase.workspaces.core/current-workspace-id]])."
  (:require
   [metabase.api.common :as api]
   [metabase.util.i18n :refer [tru]]
   [metabase.workspaces.core :as workspaces]))

(set! *warn-on-reflection* true)

(defn- text-response
  "A plain text response with `status` and `body`."
  [status body]
  {:status  status
   :headers {"Content-Type" "text/plain"}
   :body    body})

(defn- header-problem
  "The error response for the `X-Metabase-Workspace-Id` header `value`, or nil when the request can work in the
  workspace it names."
  [value workspace-id]
  (cond
    (not api/*is-superuser?*)
    (text-response 403 (tru "Only admins can choose a workspace."))

    (not (pos-int? workspace-id))
    (text-response 400 (tru "There is no workspace {0}." (pr-str value)))

    :else
    (some->> (workspaces/request-workspace-problem workspace-id)
             (text-response 400))))

(defn wrap-workspace
  "Middleware that runs a request in the workspace its `X-Metabase-Workspace-Id` header names, which only superusers
  can send. A request with no header works in no workspace."
  [handler]
  (fn [request respond raise]
    (if-let [value (get-in request [:headers "x-metabase-workspace-id"])]
      (let [workspace-id (parse-long value)]
        (if-let [response (header-problem value workspace-id)]
          (respond response)
          (workspaces/with-workspace-id workspace-id
            (handler request respond raise))))
      (handler request respond raise))))
