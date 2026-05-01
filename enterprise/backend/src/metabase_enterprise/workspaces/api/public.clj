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
  "Look up a workspace by the plaintext of one of its access keys. Because the
   stored `key` column is encrypted with a non-deterministic cipher, we can't
   query by ciphertext — we fetch every row and let toucan decrypt them in-process,
   then match against `plaintext`. This is O(n) over the whole `workspace_access_key`
   table; if traffic grows, consider adding a deterministic `key_hash` column."
  [plaintext]
  (when-let [ak (->> (t2/select :model/WorkspaceAccessKey)
                     (filter #(= plaintext (:key %)))
                     first)]
    (when-let [ws (t2/select-one :model/Workspace :id (:workspace_id ak))]
      (t2/hydrate ws :creator :databases))))

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
