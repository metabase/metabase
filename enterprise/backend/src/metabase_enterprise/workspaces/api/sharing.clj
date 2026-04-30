(ns metabase-enterprise.workspaces.api.sharing
  "Unauthenticated workspace endpoints powered by a sharing key (UUID).
   These follow the same pattern as public card/dashboard sharing —
   the UUID acts as the authorization token."
  (:require
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Helpers -------------------------------------------------------

(defn- workspace-by-sharing-key
  "Look up a workspace by its sharing key. Returns the workspace (hydrated with
   :databases and :creator) or nil."
  [sharing-key]
  (when-let [ws (t2/select-one :model/Workspace :sharing_key sharing-key)]
    (t2/hydrate ws :creator :databases)))

;;; ------------------------------------------------ Endpoints -----------------------------------------------------

(api.macros/defendpoint :get "/:sharing-key/config/yaml"
  "Download workspace config as YAML via sharing key. No authentication required."
  [{:keys [sharing-key]} :- [:map [:sharing-key ms/UUIDString]]]
  (let [ws     (or (workspace-by-sharing-key sharing-key)
                   (throw (ex-info "Not found" {:status-code 404})))
        config (ws.config/build-workspace-config (:id ws))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))
