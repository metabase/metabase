(ns metabase-enterprise.workspaces.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :get "/"
  "List all Workspaces."
  []
  [])

(api.macros/defendpoint :get "/:id"
  "Fetch a Workspace by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  {:id         id
   :name       "Workspace"
   :databases  [{:database_id   1
                 :input_schemas ["public"]
                 :output_schema "workspace_1"
                 :status        "provisioned"}
                {:database_id   2
                 :input_schemas ["public" "main"]
                 :status        "unprovisioned"}]
   :creator_id nil
   :creator    nil
   :created_at "2026-04-27T00:00:00Z"
   :updated_at "2026-04-27T00:00:00Z"})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes"
  (api.macros/ns-handler *ns* +auth))
