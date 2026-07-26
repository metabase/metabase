(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.impl :as impl]
   [metabase-enterprise.workspaces.models.workspace :as models.workspace]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment models.workspace/keep-me)

(def ^:private Workspace
  "Schema for a workspace object."
  [:map
   [:id pos-int?]
   [:branch :string]
   [:creator_id {:optional true} [:maybe pos-int?]]
   [:created_at {:optional true} :any]
   [:updated_at {:optional true} :any]
   [:creator {:optional true} [:maybe :map]]
   [:users {:optional true} [:sequential :map]]])

(def ^:private WorkspaceList
  "Schema for GET / response."
  [:sequential Workspace])

(api.macros/defendpoint :get "/" :- WorkspaceList
  "List all workspaces. Requires superuser permissions."
  []
  (api/check-superuser)
  (-> (t2/select :model/Workspace {:order-by [[:id :asc]]})
      (t2/hydrate :creator :users)))

(api.macros/defendpoint :get "/:id" :- Workspace
  "Get a single workspace by id. Requires superuser permissions."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (-> (t2/select-one :model/Workspace :id id)
                     (t2/hydrate :creator :users))))

(api.macros/defendpoint :post "/" :- Workspace
  "Create a workspace for `branch`. The branch is not created or switched to here — it is expected to
  already exist on the source, and its content is materialized into the workspace by a subsequent pull. Requires
  superuser permissions."
  [_route
   _query
   {:keys [branch]} :- [:map [:branch ms/NonBlankString]]]
  (api/check-superuser)
  (api/check-400 (not (t2/exists? :model/Workspace :branch branch))
                 (format "A workspace for branch '%s' already exists." branch))
  (let [id (t2/insert-returning-pk! :model/Workspace
                                    {:branch branch :creator_id api/*current-user-id*})]
    (-> (t2/select-one :model/Workspace :id id)
        (t2/hydrate :creator :users))))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a workspace: removes all of its materialized content and clears it from any users pointing
  at it. Requires superuser permissions."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/Workspace :id id))
  (impl/delete-workspace! id)
  nil)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes."
  (api.macros/ns-handler *ns* +auth))
