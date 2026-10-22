(ns metabase-enterprise.workspaces.api.workspace-manager
  "EE API endpoints for managing workspaces, served under `/api/ee/workspace-manager`.
   Validation and presentation only — domain logic lives in
   [[metabase-enterprise.workspaces.core]] and permission predicates live on
   `:model/Workspace` and `:model/WorkspaceDatabase` (see `mi/can-read?`/`can-write?`/`can-create?`)."
  (:require
   [medley.core :as m]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.metadata :as ws.metadata]
   [metabase-enterprise.workspaces.models.workspace-database :as workspace-database]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli.schema :as ms]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum {:decode/api keyword}
   :unprovisioned :provisioning :provisioned :deprovisioning])

(def ^:private CreateWorkspaceParams
  [:map {:closed true}
   [:name         ms/NonBlankString]
   ;; when omitted, the workspace gets every database with workspaces enabled
   [:database_ids {:optional true} [:sequential {:min 1} ::lib.schema.id/database]]])

(def ^:private UpdateWorkspaceParams
  [:map {:closed true}
   [:name {:optional true} ms/NonBlankString]])

(def ^:private WorkspaceDatabaseResponse
  [:map {:closed true}
   [:database_id      ::lib.schema.id/database]
   [:input_schemas    [:sequential ms/NonBlankString]]
   [:output_namespace :string]
   [:status           WorkspaceStatus]
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
   [:id          ms/PositiveInt]
   [:name        ms/NonBlankString]
   [:creator     [:maybe CreatorResponse]]
   [:created_at  DateTimeWithTimeZone]
   [:updated_at  DateTimeWithTimeZone]
   ;; Both the list and GET /:id endpoints hydrate `:databases`; it stays
   ;; optional so clients treat a missing array as `[]`.
   [:databases   {:optional true} [:sequential WorkspaceDatabaseResponse]]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-workspace-database [wsd]
  (-> wsd
      (select-keys [:database_id :input_schemas :output_namespace :status :database])
      ;; never expose connection credentials
      (m/update-existing :database #(some-> % (dissoc :details)))))

(defn- present-creator [creator]
  (when creator
    (select-keys creator [:id :first_name :last_name :email :common_name])))

(defn- present-workspace [workspace]
  (some-> workspace
          (select-keys [:id :name :creator :created_at :updated_at :databases])
          (update :creator present-creator)
          (m/update-existing :databases #(mapv present-workspace-database %))))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/" :- [:sequential WorkspaceResponse]
  "List all Workspaces."
  []
  (api/check-superuser)
  (into [] (comp (filter mi/can-read?)
                 (map present-workspace))
        (ws/list-workspaces)))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/read-check :model/Workspace id)
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace attached to the given databases (each must be eligible
   for workspaces) — or, when `database_ids` is omitted, to every database with
   workspaces enabled — and provision it (blocking)."
  [_route-params _query-params params :- CreateWorkspaceParams]
  (api/create-check :model/Workspace params)
  (let [database-ids (or (:database_ids params)
                         (workspace-database/workspaces-enabled-database-ids))]
    (api/check-400 (seq database-ids) "No databases have workspaces enabled.")
    (present-workspace
     (ws/create-workspace!
      (assoc params
             :database_ids database-ids
             :creator_id   api/*current-user-id*)))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update a workspace's name."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   params :- UpdateWorkspaceParams]
  (api/write-check :model/Workspace id)
  (when (:name params)
    (ws.db/update-workspace-name! id (:name params)))
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a Workspace. Tears down every database's warehouse isolation first
  (blocking, any state). Each database is either fully torn down (its row is
  deleted) or kept; when any teardown fails the workspace is kept too — with the
  failed rows, so the delete can be retried — and the combined failure is
  returned as the error. 204 on success, no response body."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/write-check :model/Workspace id)
  (ws/delete-workspace! id)
  nil)

;;; ------------------------------------------- Metadata download ------------------------------------------------

(def ^:private MetadataResponse
  [:map {:closed true}
   [:databases [:sequential [:map {:closed true}
                             [:id     ::lib.schema.id/database]
                             [:name   :string]
                             [:engine :string]]]]
   [:tables    [:sequential [:map {:closed true}
                             [:id          ::lib.schema.id/table]
                             [:db_id       ::lib.schema.id/database]
                             [:name        :string]
                             [:schema      {:optional true} :string]
                             [:description {:optional true} :string]]]]
   [:fields    [:sequential [:map {:closed true}
                             [:id                 ::lib.schema.id/field]
                             [:table_id           ::lib.schema.id/table]
                             [:name               :string]
                             [:base_type          :string]
                             [:description        {:optional true} :string]
                             [:database_type      {:optional true} :string]
                             [:effective_type     {:optional true} :string]
                             [:semantic_type      {:optional true} :string]
                             [:coercion_strategy  {:optional true} :string]
                             [:nfc_path           {:optional true} [:sequential :string]]
                             [:parent_id          {:optional true} ::lib.schema.id/field]
                             [:fk_target_field_id {:optional true} ::lib.schema.id/field]]]]])

(api.macros/defendpoint :get "/:id/metadata" :- MetadataResponse
  "The workspace databases' metadata as `table_metadata.json` (the input of the `@metabase/database-metadata`
  extractor): their tables in the workspace's input schemas and those tables' fields, with this instance's curated
  descriptions and semantic types, referencing each other by this instance's ids."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/write-check :model/Workspace id)
  (api/check-404 (ws.metadata/build-workspace-metadata id)))

;;; ------------------------------------------- Config download --------------------------------------------------

(api.macros/defendpoint :get "/:id/config"
  :- [:map {:closed true}
      [:status  [:= 200]]
      [:headers [:map-of :string :string]]
      [:body    :string]]
  "Download the workspace's developer-instance config as a YAML file. 409 if any
  of the workspace's databases is not `:provisioned`."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/write-check :model/Workspace id)
  (let [config (api/check-404 (ws.config/build-workspace-config id))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))
