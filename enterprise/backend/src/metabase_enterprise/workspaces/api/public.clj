(ns metabase-enterprise.workspaces.api.public
  "Unauthenticated workspace endpoints powered by an access key (UUID).
   The key is passed in the `x-workspace-access-key` request header — never
   in the URL — so it doesn't end up in HTTP access logs."
  (:require
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.workspace-access-key :as ws.access-key]
   [metabase-enterprise.workspaces.models.workspace-access-key-log :as ws.access-key-log]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]))

(set! *warn-on-reflection* true)

(def ^:private access-key-header "x-workspace-access-key")

(defn- request->access-key
  "Extract the workspace access key from the request header. 401 if missing."
  [request]
  (let [raw (get-in request [:headers access-key-header])]
    (api/check raw 401 "Unauthorized")
    raw))

(defn- request->workspace
  "Authorize the request via the `x-workspace-access-key` header, log the
  usage with `context`, and return the workspace the key grants access to.
  401 if the header is missing, 404 if the key or workspace doesn't exist."
  [request context]
  (let [raw-key    (request->access-key request)
        access-key (api/check-404 (ws.access-key/get-access-key raw-key))
        workspace  (api/check-404 (ws/get-workspace (:workspace_id access-key)))]
    (ws.access-key-log/log-access-key-usage! access-key context)
    workspace))

(api.macros/defendpoint :get "/config"
  "Download workspace config as YAML. Authenticated via the
  `x-workspace-access-key` header (UUID)."
  [_route-params _query-params _body-params request]
  (let [workspace (request->workspace request :config)
        config    (ws.config/build-workspace-config (:id workspace))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))
