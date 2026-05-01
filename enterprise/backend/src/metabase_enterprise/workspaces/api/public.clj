(ns metabase-enterprise.workspaces.api.public
  "Unauthenticated workspace endpoints powered by an access key (UUID).
   These follow the same pattern as public card/dashboard sharing —
   the UUID acts as the authorization token."
  (:require
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.workspace-access-key :as ws.access-key]
   [metabase-enterprise.workspaces.models.workspace-access-key-log :as ws.access-key-log]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/:access-key/config"
  "Download workspace config as YAML via access key. No authentication required."
  [{raw-access-key :access-key} :- [:map [:access-key ms/UUIDString]]]
  (let [access-key (api/check-404 (ws.access-key/get-access-key raw-access-key))
        workspace  (api/check-404 (ws/get-workspace (:workspace_id access-key)))
        _          (ws.access-key-log/log-access-key-usage! access-key "config")
        config     (ws.config/build-workspace-config (:id workspace))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))
