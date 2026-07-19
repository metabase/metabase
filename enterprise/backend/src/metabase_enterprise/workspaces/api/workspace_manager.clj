(ns metabase-enterprise.workspaces.api.workspace-manager
  "EE API endpoints for managing workspaces, served under `/api/ee/workspace-manager`.
   Validation and presentation only — domain logic lives in the workspace models
   and [[metabase-enterprise.workspaces.provisioning]]; permission predicates live
   on `:model/Workspace` and `:model/WorkspaceDatabase` (see
   `mi/can-read?`/`can-write?`/`can-create?`).

   Creating a workspace only inserts `:unprovisioned` rows; provisioning is
   started explicitly via `POST /:id/provision` and runs in the background —
   clients poll `GET /:id` and follow the workspace's `:status`."
  (:require
   [medley.core :as m]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.provisioning :as ws.provisioning]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private CreateWorkspaceParams
  [:map {:closed true}
   [:name         ms/NonBlankString]
   [:database_ids [:sequential {:min 1} ::lib.schema.id/database]]])

(def ^:private UpdateWorkspaceParams
  [:map {:closed true}
   [:name {:optional true} ms/NonBlankString]])

(def ^:private WorkspaceDatabaseResponse
  [:map {:closed true}
   [:database_id      ::lib.schema.id/database]
   [:input_schemas    [:sequential ms/NonBlankString]]
   [:output_namespace :string]
   [:status           ::ws.schema/workspace-database-status]
   [:status_details   [:maybe :string]]
   [:database         {:optional true} [:maybe :map]]])

(def ^:private CreatorResponse
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:first_name  [:maybe :string]]
   [:last_name   [:maybe :string]]
   [:email       ms/NonBlankString]
   [:common_name {:optional true} [:maybe :string]]])

(def ^:private DateTimeWithTimeZone
  "An instant with explicit time-zone info. `Timestamp` would be ambiguous --
   `TIMESTAMP` in most SQL databases is short for `TIMESTAMP WITHOUT TIME ZONE`."
  [:or
   (ms/InstanceOfClass java.time.OffsetDateTime)
   (ms/InstanceOfClass java.time.ZonedDateTime)])

(def ^:private WorkspaceResponse
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:name           ms/NonBlankString]
   [:status         ::ws.schema/workspace-status]
   [:status_details [:maybe :string]]
   [:instance_id    [:maybe :string]]
   [:instance_url   [:maybe :string]]
   [:creator        [:maybe CreatorResponse]]
   [:created_at     DateTimeWithTimeZone]
   [:updated_at     DateTimeWithTimeZone]
   ;; Both the list and GET /:id endpoints hydrate `:databases`; it stays
   ;; optional so clients treat a missing array as `[]`.
   [:databases      {:optional true} [:sequential WorkspaceDatabaseResponse]]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-workspace-database [wsd]
  (-> wsd
      (select-keys [:database_id :input_schemas :output_namespace :status :status_details :database])
      ;; never expose connection credentials
      (m/update-existing :database #(some-> % (dissoc :details)))))

(defn- present-creator [creator]
  (when creator
    (select-keys creator [:id :first_name :last_name :email :common_name])))

(defn- present-workspace [workspace]
  (some-> workspace
          (select-keys [:id :name :status :status_details :instance_id :instance_url :creator :created_at :updated_at :databases])
          (update :creator present-creator)
          (m/update-existing :databases #(mapv present-workspace-database %))))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/" :- [:sequential WorkspaceResponse]
  "List all Workspaces."
  []
  (api/check-superuser)
  (into [] (comp (filter mi/can-read?)
                 (map present-workspace))
        (-> (t2/select :model/Workspace {:order-by [[:id :asc]]})
            (t2/hydrate :creator [:databases :database]))))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [ws (api/read-check :model/Workspace id)]
    (-> ws
        (t2/hydrate :creator [:databases :database])
        present-workspace)))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace attached to the given databases (each must be eligible
   for workspaces). The workspace and its databases start `:unprovisioned` —
   start provisioning explicitly via `POST /:id/provision`."
  [_route-params _query-params {:keys [database_ids] :as params} :- CreateWorkspaceParams]
  (api/create-check :model/Workspace params)
  (-> (workspace/create-workspace! {:name       (:name params)
                                    :creator_id api/*current-user-id*
                                    :databases  (workspace/workspace-databases database_ids)})
      (t2/hydrate :creator [:databases :database])
      present-workspace))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update a workspace's name."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateWorkspaceParams]
  (let [ws (api/write-check :model/Workspace id)
        ws (if-let [new-name (:name params)]
             (do (t2/update! :model/Workspace :id id {:name new-name})
                 (assoc ws :name new-name))
             ws)]
    (-> ws
        (t2/hydrate :creator [:databases :database])
        present-workspace)))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a Workspace. Refuses with a 400 unless the workspace is strictly
  `:unprovisioned` — deprovision it first (`POST /:id/deprovision`). The status
  condition sits on the DELETE itself, closing the race with a concurrently
  started run. The workspace_database rows are cascade-deleted with the
  workspace. 204 on success, no response body."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/Workspace id)
  (api/check-400 (pos? (t2/delete! :model/Workspace :id id :status :unprovisioned)))
  nil)

(api.macros/defendpoint :post "/:id/provision" :- WorkspaceResponse
  "Start provisioning the workspace in the background and return immediately.
  Retryable from any settled status; 400 while a provision or deprovision run
  is already in flight. Poll `GET /:id` to follow the workspace's `:status`;
  the response reflects the just-started run (`:database-provisioning`)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [ws       (api/write-check :model/Workspace id)
        _        (api/check-400 (not (contains? ws.schema/in-flight-statuses (:status ws))))
        ws       (ws.provisioning/set-workspace-provisioning-status! ws)
        response (-> ws
                     (t2/hydrate :creator [:databases :database])
                     present-workspace)]
    (ws.execute/execute-async! #(ws.provisioning/provision-workspace! ws))
    response))

(api.macros/defendpoint :post "/:id/deprovision" :- WorkspaceResponse
  "Start deprovisioning the workspace in the background and return immediately.
  Retryable from any settled status; 400 while a provision or deprovision run
  is already in flight. Poll `GET /:id` to follow the workspace's `:status`;
  the response reflects the just-started run (`:instance-deprovisioning`)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [ws       (api/write-check :model/Workspace id)
        _        (api/check-400 (not (contains? ws.schema/in-flight-statuses (:status ws))))
        ws       (ws.provisioning/set-workspace-deprovisioning-status! ws)
        response (-> ws
                     (t2/hydrate :creator [:databases :database])
                     present-workspace)]
    (ws.execute/execute-async! #(ws.provisioning/deprovision-workspace! ws))
    response))
