(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace` — CRUD for workspaces. Premium-gated on the `:workspaces` feature by
  the route mount in [[metabase-enterprise.api-routes.routes]]."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.malli.schema :as ms]
   [metabase.workspaces.schema :as workspaces.schema]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/" :- [:sequential ::workspaces.schema/workspace]
  "Fetch all workspaces."
  []
  (t2/select :model/Workspace {:order-by [[:id :asc]]}))

(api.macros/defendpoint :get "/:id" :- ::workspaces.schema/workspace
  "Fetch a single workspace."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Workspace :id id)))

(api.macros/defendpoint :post "/" :- ::workspaces.schema/workspace
  "Create a new workspace."
  [_route-params
   _query-params
   {:keys [name]} :- [:map [:name ms/NonBlankString]]]
  (t2/insert-returning-instance! :model/Workspace
                                 {:name       name
                                  :creator_id api/*current-user-id*}))

(api.macros/defendpoint :put "/:id" :- ::workspaces.schema/workspace
  "Update a workspace."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [name]} :- [:map [:name {:optional true} ms/NonBlankString]]]
  (api/check-404 (t2/exists? :model/Workspace :id id))
  (when name
    (t2/update! :model/Workspace id {:name name}))
  (t2/select-one :model/Workspace :id id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a workspace. Remappings cascade; users who had it active fall back to no workspace
  (`core_user.workspace_id` is set to null by the FK)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (t2/exists? :model/Workspace :id id))
  (t2/delete! :model/Workspace :id id)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
