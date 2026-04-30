(ns metabase-enterprise.workspaces.api.public
  "Unauthenticated workspace endpoints powered by an access key (UUID).
   These follow the same pattern as public card/dashboard sharing —
   the UUID acts as the authorization token."
  (:require
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Helpers -------------------------------------------------------

(defn- workspace-by-access-key
  "Look up a workspace by its access key. Returns the workspace (hydrated with
   :databases and :creator) or nil."
  [access-key]
  (when-let [ws (t2/select-one :model/Workspace :access_key access-key)]
    (t2/hydrate ws :creator :databases)))

;;; ------------------------------------------------ Endpoints -----------------------------------------------------

(api.macros/defendpoint :get "/:access-key/config/yaml"
  "Download workspace config as YAML via access key. No authentication required."
  [{:keys [access-key]} :- [:map [:access-key ms/UUIDString]]]
  (let [ws     (or (workspace-by-access-key access-key)
                   (throw (ex-info "Not found" {:status-code 404})))
        config (ws.config/build-workspace-config (:id ws))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))
