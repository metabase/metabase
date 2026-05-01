(ns metabase-enterprise.workspaces.api.manager
  "EE API endpoints for managing workspaces (admin), served under `/api/ee/workspace-manager`.
   Validation, auth, and presentation only — all logic lives in
   [[metabase-enterprise.workspaces.core]]."
  (:require
   [malli.util :as mut]
   [medley.core :as m]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.workspace-access-key :as ws.access-key]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum "unprovisioned" "provisioning" "provisioned" "deprovisioning"])

(def ^:private AddDatabaseParams
  [:map {:closed true}
   [:database_id   ms/PositiveInt]
   [:input_schemas [:sequential ms/NonBlankString]]])

(def ^:private UpdateDatabaseParams
  [:map {:closed true}
   [:input_schemas [:sequential ms/NonBlankString]]])

(def ^:private CreateWorkspaceParams
  [:map {:closed true}
   [:name ms/NonBlankString]])

(def ^:private UpdateWorkspaceParams
  [:map {:closed true}
   [:name {:optional true} ms/NonBlankString]])

(def ^:private WorkspaceDatabaseResponse
  [:map {:closed true}
   [:database_id      ms/PositiveInt]
   [:database_details :map]
   [:output_schema    :string]
   [:input_schemas    [:sequential ms/NonBlankString]]
   [:status           WorkspaceStatus]])

(def ^:private CreatorResponse
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:first_name  [:maybe :string]]
   [:last_name   [:maybe :string]]
   [:email       ms/NonBlankString]
   [:common_name {:optional true} [:maybe :string]]])

(def ^:private Timestamp
  [:or
   (ms/InstanceOfClass java.time.OffsetDateTime)
   (ms/InstanceOfClass java.time.ZonedDateTime)])

(def ^:private AccessKeyResponse
  "Access key as exposed to the API — never includes the plaintext `:key`. The
  plaintext is only returned by the create endpoint, in a separate
  `AccessKeyWithSecretResponse` that wraps this one."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:workspace_id ms/PositiveInt]
   [:name         ms/NonBlankString]
   [:creator      [:maybe CreatorResponse]]
   [:created_at   Timestamp]
   [:updated_at   Timestamp]])

(def ^:private WorkspaceResponse
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:name        ms/NonBlankString]
   [:creator     [:maybe CreatorResponse]]
   [:created_at  Timestamp]
   [:updated_at  Timestamp]
   ;; `:databases` and `:access_keys` are only included when hydrated (i.e. the
   ;; GET /:id endpoint). The list endpoint omits them — clients should treat a
   ;; missing array as `[]`.
   [:databases   {:optional true} [:sequential WorkspaceDatabaseResponse]]
   [:access_keys {:optional true} [:sequential AccessKeyResponse]]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-workspace-database [wsd]
  (-> (select-keys wsd [:database_id :database_details :output_schema :input_schemas :status])
      (update :status name)))

(defn- present-creator [creator]
  (when creator
    (select-keys creator [:id :first_name :last_name :email :common_name])))

(defn- present-access-key
  "Strip the stored `key_hash` from an access-key row, exposing only safe fields.
  The plaintext only escapes via [[present-access-key-with-secret]], which is
  reserved for the create endpoint."
  [access-key]
  (some-> access-key
          (select-keys [:id :workspace_id :name :creator :created_at :updated_at])
          (update :creator present-creator)))

(defn- present-access-key-with-secret
  "Like [[present-access-key]] but adds the plaintext `:key`. Used **only** by
  the create endpoint so the caller can capture the key once; subsequent reads
  never expose it (we don't store it)."
  [access-key plaintext]
  (-> (present-access-key access-key)
      (assoc :key plaintext)))

(defn- present-workspace [workspace]
  (some-> workspace
          (select-keys [:id :name :creator :created_at :updated_at :databases :access_keys])
          (update :creator present-creator)
          (m/update-existing :databases   #(mapv present-workspace-database %))
          (m/update-existing :access_keys #(mapv present-access-key %))))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/" :- [:sequential WorkspaceResponse]
  "List all Workspaces."
  []
  (api/check-superuser)
  (mapv present-workspace (ws/list-workspaces)))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace (name only, no databases)."
  [_route-params _query-params params :- CreateWorkspaceParams]
  (api/check-superuser)
  (present-workspace
   (ws/create-workspace!
    (assoc params :creator_id api/*current-user-id*))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update a workspace's name."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateWorkspaceParams]
  (api/check-superuser)
  ;; For now just name updates — structural changes go through the database sub-endpoints
  (when (:name params)
    (t2/update! :model/Workspace :id id {:name (:name params)}))
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :delete "/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Delete a Workspace. Deprovisions all databases first (blocking)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (ws/delete-workspace! id)
  {:id id :deleted true})

;;; ---------------------------------------- Database sub-endpoints --------------------------------------------

(api.macros/defendpoint :post "/:id/database" :- WorkspaceResponse
  "Add a database to a workspace and provision it immediately (blocking)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- AddDatabaseParams]
  (api/check-superuser)
  (present-workspace
   (ws/add-database! id (:database_id params) (:input_schemas params))))

(api.macros/defendpoint :put "/:id/database/:db-id" :- WorkspaceResponse
  "Update a database's input schemas. Deprovisions the old config and reprovisions
   with the new one (blocking)."
  [{:keys [id db-id]} :- [:map [:id ms/PositiveInt] [:db-id ms/PositiveInt]]
   _query-params
   params :- UpdateDatabaseParams]
  (api/check-superuser)
  (present-workspace
   (ws/update-database! id db-id (:input_schemas params))))

(api.macros/defendpoint :delete "/:id/database/:db-id"
  :- WorkspaceResponse
  "Deprovision and remove a database from a workspace (blocking)."
  [{:keys [id db-id]} :- [:map [:id ms/PositiveInt] [:db-id ms/PositiveInt]]]
  (api/check-superuser)
  (present-workspace
   (ws/remove-database! id db-id)))

;;; ------------------------------------------ Access key endpoints ---------------------------------------------

(def ^:private CreateAccessKeyParams
  [:map {:closed true}
   [:name ms/NonBlankString]])

(def ^:private UpdateAccessKeyParams
  [:map {:closed true}
   [:name ms/NonBlankString]])

(def ^:private AccessKeyWithSecretResponse
  "Create-only response: `AccessKeyResponse` plus the plaintext UUID `:key`,
  exposed once at creation."
  (mut/merge AccessKeyResponse
             [:map [:key ms/UUIDString]]))

(api.macros/defendpoint :post "/:id/access-key"
  :- AccessKeyWithSecretResponse
  "Create a new access key for a workspace. **The returned `:key` is the only
  time the plaintext is exposed** — store it immediately, the API never returns it
  again. Only the SHA-256 hex hash of the UUID is kept at rest in `key_hash`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- CreateAccessKeyParams]
  (api/check-superuser)
  (api/check-404 (ws/get-workspace id))
  (let [plaintext     (str (random-uuid))
        access-key-id (t2/insert-returning-pk! :model/WorkspaceAccessKey
                                               {:workspace_id id
                                                :name         (:name params)
                                                :key_hash     (ws.access-key/key-hash plaintext)
                                                :creator_id   api/*current-user-id*})
        access-key    (t2/hydrate (t2/select-one :model/WorkspaceAccessKey :id access-key-id) :creator)]
    (present-access-key-with-secret access-key plaintext)))

(api.macros/defendpoint :put "/:id/access-key/:key-id"
  :- AccessKeyResponse
  "Rename an existing access key. Cannot rotate the key itself — to change the
  underlying secret, delete this row and create a new one."
  [{:keys [id key-id]} :- [:map [:id ms/PositiveInt] [:key-id ms/PositiveInt]]
   _query-params
   params :- UpdateAccessKeyParams]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/WorkspaceAccessKey :id key-id :workspace_id id))
  (t2/update! :model/WorkspaceAccessKey :id key-id {:name (:name params)})
  (present-access-key (t2/hydrate (t2/select-one :model/WorkspaceAccessKey :id key-id) :creator)))

(api.macros/defendpoint :delete "/:id/access-key/:key-id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Delete an access key by id. Future requests using this key will 404."
  [{:keys [id key-id]} :- [:map [:id ms/PositiveInt] [:key-id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/WorkspaceAccessKey :id key-id :workspace_id id))
  (t2/delete! :model/WorkspaceAccessKey :id key-id)
  {:id key-id :deleted true})

;;; --------------------------------------- Access key log endpoint ----------------------------------------------

(defn- present-access-key-log [log]
  (-> log
      (select-keys [:id :workspace_id :workspace_access_key_id :context :timestamp
                    :workspace :workspace_access_key])
      (m/update-existing :workspace #(some-> % (select-keys [:id :name])))
      (m/update-existing :workspace_access_key
                         #(some-> % (select-keys [:id :workspace_id :name :created_at :updated_at :creator])))))

(api.macros/defendpoint :get "/:id/access-key-log"
  :- [:map {:closed true}
      [:data   [:sequential :map]]
      [:limit  pos-int?]
      [:offset :int]
      [:total  :int]]
  "Paginated access-key usage log for the workspace, newest first. Rows whose
  `workspace_id` was SET NULL by a workspace delete are not returned here."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (ws/get-workspace id))
  (let [offset (request/offset)
        limit  (request/limit)
        where  [:= :workspace_id id]
        total  (t2/count :model/WorkspaceAccessKeyLog {:where where})
        rows   (-> (t2/select :model/WorkspaceAccessKeyLog
                              {:where    where
                               :order-by [[:timestamp :desc] [:id :desc]]
                               :limit    limit
                               :offset   offset})
                   (t2/hydrate :workspace :workspace_access_key))]
    {:data   (mapv present-access-key-log rows)
     :limit  limit
     :offset offset
     :total  total}))

;;; ------------------------------------------- Config download --------------------------------------------------

(api.macros/defendpoint :get "/:id/config"
  :- [:map
      [:status  [:= 200]]
      [:headers [:map-of :string :string]]
      [:body    :string]]
  "Download the workspace's developer-instance config as a YAML file. 409 if any
  of the workspace's databases is not `:provisioned`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [config (api/check-404 (ws.config/build-workspace-config id))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))
