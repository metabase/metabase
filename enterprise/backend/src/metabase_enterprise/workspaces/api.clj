(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace` — CRUD for workspaces. Premium-gated on the `:workspaces` feature by
  the route mount in [[metabase-enterprise.api-routes.routes]]. Admin-only for now: the
  endpoints check-superuser, and the model's `can-read?`/`can-write?`/`can-create?` are
  superuser-gated too (activating a workspace via `PUT /api/user/:id` read-checks it, so
  non-admins cannot enter workspaces either)."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [metabase.workspaces.schema :as workspaces.schema]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/" :- [:sequential ::workspaces.schema/workspace]
  "Fetch all workspaces."
  []
  (api/check-superuser)
  (filterv mi/can-read? (t2/select :model/Workspace {:order-by [[:id :asc]]})))

(api.macros/defendpoint :get "/:id" :- ::workspaces.schema/workspace
  "Fetch a single workspace."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/read-check :model/Workspace id))

(api.macros/defendpoint :post "/" :- ::workspaces.schema/workspace
  "Create a new workspace."
  [_route-params
   _query-params
   {:keys [branch]} :- [:map [:branch ms/NonBlankString]]]
  (api/check-superuser)
  (api/create-check :model/Workspace {:branch branch})
  (api/check-400 (not (t2/exists? :model/Workspace :branch branch))
                 (tru "A workspace for branch {0} already exists." branch))
  (t2/insert-returning-instance! :model/Workspace
                                 {:branch     branch
                                  :creator_id api/*current-user-id*}))

(api.macros/defendpoint :put "/:id" :- ::workspaces.schema/workspace
  "Update a workspace."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [branch]} :- [:map [:branch {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (api/write-check :model/Workspace id)
  (when branch
    (api/check-400 (not (t2/exists? :model/Workspace :branch branch :id [:not= id]))
                   (tru "A workspace for branch {0} already exists." branch))
    (t2/update! :model/Workspace id {:branch branch}))
  (t2/select-one :model/Workspace :id id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a workspace. Remappings cascade; users who had it active fall back to no workspace
  (`core_user.workspace_id` is set to null by the FK)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/write-check :model/Workspace id)
  (t2/delete! :model/Workspace :id id)
  nil)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
