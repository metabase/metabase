(ns metabase-enterprise.workspaces.api.workspace-instance
  "EE API endpoints for the workspace loaded on this (child) instance, served under
   `/api/ee/workspace-instance`. See [[metabase-enterprise.workspaces.api.workspace-manager]]
   for the manager-side admin operations."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.schema :as ms]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceInstance
  "The parent workspace this instance serves (its id and the parent's site URL), and
  each database with a `database-workspace-schema`. The databases are a vector of
  closed maps, not a `:map-of`: request decoding silently drops `:map-of` entries that
  fail validation, which would turn a malformed body into a workspace with no databases."
  [:map {:closed true}
   [:workspace_id {:optional true} [:maybe ms/PositiveInt]]
   [:parent_url   {:optional true} [:maybe ms/NonBlankString]]
   [:databases    [:sequential [:map {:closed true}
                                [:database_id ::lib.schema.id/database]
                                [:schema      ms/NonBlankString]]]]])

(defn- present-workspace-instance [{:keys [workspace-id parent-url databases]}]
  {:workspace_id workspace-id
   :parent_url   parent-url
   :databases    (vec (for [[database-id schema] (sort databases)]
                        {:database_id database-id :schema schema}))})

(def ^:private TableRemapping
  [:map
   [:id              ms/PositiveInt]
   [:database_id     ::lib.schema.id/database]
   [:from_db         [:maybe :string]]
   [:from_schema     [:maybe :string]]
   [:from_table_name ms/NonBlankString]
   [:to_db           [:maybe :string]]
   [:to_schema       [:maybe :string]]
   [:to_table_name   ms/NonBlankString]
   [:created_at      :any]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-remapping [row]
  (select-keys row [:id :database_id
                    :from_db :from_schema :from_table_name
                    :to_db :to_schema :to_table_name
                    :created_at]))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/current" :- [:map [:data [:maybe WorkspaceInstance]]]
  "The workspace this instance is, wrapped in a `{:data ...}` envelope: `{:workspace_id
  :parent_url :databases [{:database_id :schema}]}`. `:workspace_id` and `:parent_url`
  name the parent workspace this instance serves, `null` when nothing set them;
  `:databases` lists each database that has a `database-workspace-schema`. `:data` is
  `null` when the `workspaces-enabled` setting is off. The envelope avoids an empty
  JSON body for the `nil` case."
  []
  (api/check-superuser)
  {:data (some-> (ws/instance-workspace) present-workspace-instance)})

(api.macros/defendpoint :post "/current" :- WorkspaceInstance
  "Make this instance a workspace: turn `workspaces-enabled` on and set each listed
  database's `database-workspace-schema`, clearing it on every other database. Sets the
  parent identity from `:workspace_id` and `:parent_url`, clearing whichever is absent;
  400 when `MB_WORKSPACE_ID` or `MB_WORKSPACE_PARENT_URL` sets either to another value.
  The same settings can be set through the settings API, env vars, or `config.yml`."
  [_route-params
   _query-params
   body :- WorkspaceInstance]
  (api/check-superuser)
  (ws/check-identity-not-set-by-env-var! (:workspace_id body) (:parent_url body))
  (ws/set-instance-workspace! (into {} (map (juxt :database_id :schema)) (:databases body)))
  (ws/set-instance-identity! (:workspace_id body) (:parent_url body))
  (present-workspace-instance (ws/instance-workspace)))

(api.macros/defendpoint :delete "/current" :- :nil
  "Turn `workspaces-enabled` off. After this returns, the instance is not a workspace
  and `GET /current` returns `nil`. Also drops every `TableRemapping` row, since stale
  mappings would otherwise keep rewriting queries once the instance is a workspace
  again."
  []
  (api/check-superuser)
  (ws/clear-instance-workspace!)
  nil)

(api.macros/defendpoint :get "/table-remappings" :- [:sequential TableRemapping]
  "Return all table remappings, ordered by id."
  []
  (api/check-superuser)
  (mapv present-remapping (ws/list-remappings)))
