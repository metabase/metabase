(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [metabase-enterprise.workspaces.common :as w.common]
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment
  m.workspace/keep-me)

(set! *warn-on-reflection* true)

(mu/defn- add-workspace-entity
  "Adds a workspace entity, such as a plan or transform, to the workspace.

   Args:
   - workspace-id: The workspace ID
   - entity-key: The key in the workspace map (:plans, :transforms, etc.)
   - new-entity: The new entity to add, which should be a map with the necessary fields"
  [workspace-id
   entity-key :- ::m.workspace/entity-column
   new-entity]
  (try (w.common/add-workspace-entity workspace-id entity-key new-entity)
       (catch Exception e
         (case (:error (ex-data e))
           :no-workspace (throw (ex-info "Workspace not found" {:status-code 404
                                                                :error :no-workspace}))
           (throw e)))))

(defn update-workspace-entity-at-index
  [workspace-id entity-key index update-fn]
  (try (w.common/update-workspace-entity-at-index workspace-id entity-key index update-fn)
       (catch Exception e
         (case (:error (ex-data e))
           :no-workspace [404 "Workspace not found"]
           :no-index [404 (str "No " entity-key " found at index " index " there are only " (:item-count (ex-data e)))]
           (throw e)))))

(defn- delete-workspace-entity-at-index
  "Deletes an entity at a specific index in the workspace's entity collection.

   Args:
   - workspace-id: The workspace ID
   - entity-key: The key in the workspace map (:plans, :transforms, etc.)
   - index: The 0-based index of the entity to delete"
  [workspace-id entity-key index]
  (try (w.common/delete-workspace-entity-at-index workspace-id entity-key index)
       (catch Exception e
         (case (:error (ex-data e))
           :no-workspace (#'api/generic-404 "Workspace not found")
           :no-index (#'api/generic-404 (str "No " entity-key " found at index " index " there are only " (:item-count (ex-data e))))
           (throw e)))))

;; GET /api/ee/workspace
(api.macros/defendpoint :get "/"
  "List all workspaces for the current user"
  []
  (mapv m.workspace/sort-workspace
        (t2/select :model/Workspace {:order-by [[:created_at :desc]]})))

;; GET /api/ee/workspace/:workspace-id
(api.macros/defendpoint :get "/:workspace-id"
  "Get a workspace by ID"
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]]
  (-> (t2/select-one :model/Workspace :id workspace-id)
      api/check-404
      m.workspace/sort-workspace))

;; POST /api/ee/workspace
(api.macros/defendpoint :post "/"
  "Create a new workspace.

   Request body:
   - name (required): Workspace name
   - description (optional): Workspace description"
  [_route-params
   _query-params
   {:keys [name description collection_id]}
   :- [:map
       [:name ms/NonBlankString]
       [:collection_id ms/PositiveInt]
       [:description {:optional true} [:maybe :string]]]]
  (w.common/create-workspace! name description collection_id))

(comment

;; delete all but 1 Workspace Collection:
  (doseq [ids (rest (map :id (t2/select [:model/Collection :id] :name "Workspace Collection")))]
    (t2/delete! :model/Collection :id ids))

  #_:clj-kondo/ignore
  (require '[metabase.test :as mt]
           '[toucan2.core :as t2])

  (mt/user-http-request :crowberto :post 200 "collection/" {:name "Workspace Collection"
                                                            :slug "workspace_collection"})

  (t2/select [:model/Collection :id :name] :name "Workspace Collection")

  (mt/user-http-request
   :crowberto :post 200 (format "ee/workspace/%s/plan" (:id (t2/select [:model/Collection :id :name] :name "Workspace Collection")))
   {:name "New Plan"
    :collection_id (:id (t2/select-one [:model/Collection :id] :name "Workspace Collection"))
    :description "This is a new plan"
    :content {:steps ["Step 1" "Step 2"]}})

  (t2/select-one [:model/Workspace :id :name :description] :name "New Plan")
  ;; => (toucan2.instance/instance :model/Workspace {:id 1, :name "New Plan", :description "This is a new plan"})
  )

(defn- update-workspace [workspace-id name description]
  (t2/update! :model/Workspace workspace-id {:name name :description description}))

;; PUT /api/ee/workspace/:workspace-id
(api.macros/defendpoint :put "/:workspace-id"
  "Update an existing workspace's name or description.

   Request body:
   - name (required): Updated workspace name
   - description (optional): Updated workspace description

   Returns the updated workspace."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   {:keys [name description]} :- [:map
                                  [:name ms/NonBlankString]
                                  [:description {:optional true} [:maybe :string]]]]
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (update-workspace workspace-id name description)
  (t2/select-one :model/Workspace :id workspace-id))

;; DELETE /api/ee/workspace/:workspace-id
(api.macros/defendpoint :delete "/:workspace-id"
  "Delete a workspace."
  [{:keys [workspace-id]} :- [:map
                              [:workspace-id ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (w.common/delete-workspace! workspace-id)
  api/generic-204-no-content)

;; POST /api/ee/workspace/:workspace-id/plan
(api.macros/defendpoint :post "/:workspace-id/plan"
  "Add a plan to the workspace.

   Request body:
   - title (required): Plan title
   - description (required): Plan description
   - content (required): Plan content object"
  [{:keys [workspace-id]} :- [:map
                              [:workspace-id ms/PositiveInt]]
   _query-params
   {:keys [title description content]} :- ::m.workspace/plan]
  (add-workspace-entity workspace-id :plans {:title title :description description :content content})
  (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id)))

(api.macros/defendpoint :put "/:workspace-id/plan/:index"
  "Replace a plan in the workspace, by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the plan to replace (0-based)

   Request body:
   - title (required): Plan title
   - description (required): Plan description
   - content (required): Plan content object"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index ms/Int]]
   _query-params
   {:keys [title description content]}
   :- [:map
       [:title ms/NonBlankString]
       [:description {:optional true} [:maybe ms/NonBlankString]]
       [:content :map]]]
  (update-workspace-entity-at-index
   workspace-id :plans index
   (fn [current-plan]
     {:title (or title (:title current-plan))
      :description (or description (:description current-plan))
      :content (or content (:content current-plan))}))
  (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id)))

(api.macros/defendpoint :delete "/:workspace-id/plan/:index"
  "Delete a plan from the workspace by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the plan to delete (0-based)"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index :int]]
   _query-params]
  (delete-workspace-entity-at-index workspace-id :plans index)
  api/generic-204-no-content)

;; POST /api/ee/workspace/:workspace-id/transform
(api.macros/defendpoint :post "/:workspace-id/transform"
  "Add a transform to the workspace.

   Request body:
   - name (required): Transform name
   - description (required): Transform description
   - source (required): Source configuration
   - target (required): Target configuration
   - config (optional): Transform configuration"
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   {:keys [name description source target config]}
   :- [:map
       [:name ms/NonBlankString]
       [:description ms/NonBlankString]
       [:source :map]
       [:target :map]
       [:config {:optional true} [:maybe :map]]]]
  (add-workspace-entity
   workspace-id :transforms
   {:name name :description description :source source :target target :config config})
  (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id)))

(api.macros/defendpoint :put "/:workspace-id/transform/:index"
  "Replace a transform in the workspace, by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the transform to replace (0-based)

   Request body:
   - name (required): Transform name
   - description (required): Transform description
   - source (required): Source configuration
   - target (required): Target configuration
   - config (optional): Transform configuration"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index :int]]
   _query-params
   {:keys [name description source target config]}
   :- [:map
       [:name ms/NonBlankString]
       [:description ms/NonBlankString]
       [:source :map]
       [:target :map]
       [:config {:optional true} [:maybe :map]]]]
  (update-workspace-entity-at-index
   workspace-id :transforms index
   (fn [current-transform]
     (merge current-transform {:name name
                               :description description
                               :source source
                               :target target
                               :config config
                               :created_at (str (java.time.Instant/now))})))
  (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id)))

(api.macros/defendpoint :delete "/:workspace-id/transform/:index"
  "Delete a transform from the workspace by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the transform to delete (0-based)"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index :int]]
   _query-params]
  (delete-workspace-entity-at-index workspace-id :transforms index)
  api/generic-204-no-content)

(defn- link-transform! [workspace-id transform_id]
  (try (w.common/link-transform! workspace-id transform_id)
       (catch Exception e
         (case (:error (ex-data e))
           :no-workspace (throw (ex-info "Workspace not found" {:status-code 404 :error :no-workspace}))
           :no-transform (throw (ex-info "Transform not found" {:status-code 404 :error :no-transform}))
           (throw e)))))

;; POST /api/ee/workspace/:workspace-id/transform/link
(api.macros/defendpoint :post "/:workspace-id/transform/link"
  "Link an existing transform to the workspace.

   Request body:
   - transform_id (required): ID of the transform to link"
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   {:keys [transform_id]} :- [:map [:transform_id ms/PositiveInt]]]
  (api/check-superuser)
  (link-transform! workspace-id transform_id)
  (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id)))

;; POST /api/ee/workspace/:workspace-id/document
(api.macros/defendpoint :post "/:workspace-id/document"
  "Add a document to the workspace.

   Request body:
   - document_id (required): ID of the document to link"
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   {:keys [document_id]} :- [:map [:document_id ms/PositiveInt]]]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
        current-docs (or (:documents workspace) [])
        updated-docs (distinct (conj current-docs document_id))]
    (t2/update! :model/Workspace workspace-id {:documents updated-docs})
    (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id))))

;; POST /api/ee/workspace/:workspace-id/data_warehouse
(api.macros/defendpoint :post "/:workspace-id/data_warehouse"
  "Add a data warehouse to the workspace.

   Request body:
   - dwh_id (required): ID of the data warehouse
   - name (required): Name of the data warehouse
   - type (required): Access type (read-only or read-write)
   - credentials (required): Credentials object"
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   {:keys [data_warehouses_id name
           type credentials]} :- [:map
                                  [:data_warehouses_id ms/PositiveInt]
                                  [:name ms/NonBlankString]
                                  [:type [:enum "read-only" "read-write"]]
                                  [:credentials :map]]]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
        current-dwh (or (:data_warehouses workspace) [])
        new-dwh {:id data_warehouses_id
                 :name name
                 :type (keyword type)
                 :credentials credentials
                 :created_at (str (java.time.Instant/now))}
        updated-dwh (conj current-dwh new-dwh)]
    (t2/update! :model/Workspace workspace-id
                {:data_warehouses updated-dwh})
    (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id))))

(api.macros/defendpoint :put "/:workspace-id/data_warehouse/:index"
  "Replace a data warehouse in the workspace, by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the data warehouse to replace (0-based)

   Request body:
   - data_warehouses_id (required): ID of the data warehouse
   - name (required): Name of the data warehouse
   - type (required): Access type (read-only or read-write)
   - credentials (required): Credentials object"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index :int]]
   _query-params
   {:keys [data_warehouses_id name type credentials]}
   :- [:map
       [:data_warehouses_id ms/PositiveInt]
       [:name ms/NonBlankString]
       [:type [:enum "read-only" "read-write"]]
       [:credentials :map]]]
  (update-workspace-entity-at-index workspace-id :data_warehouses index
                                    (fn [current-dwh]
                                      (merge current-dwh {:id data_warehouses_id
                                                          :name name
                                                          :type (keyword type)
                                                          :credentials credentials
                                                          :created_at (str (java.time.Instant/now))})))
  (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id)))

(api.macros/defendpoint :delete "/:workspace-id/data_warehouse/:index"
  "Delete a data warehouse from the workspace by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the data warehouse to delete (0-based)"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index :int]]
   _query-params]
  (delete-workspace-entity-at-index workspace-id :data_warehouses index)
  api/generic-204-no-content)

;; POST /api/ee/workspace/:workspace-id/user
(api.macros/defendpoint :post "/:workspace-id/user"
  "Add a user to the workspace.

   Request body:
   - id (required): User ID
   - name (required): User name
   - email (required): User email
   - type (required): User type (e.g., 'workspace-user')"
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   user :- [:map
            [:id ms/PositiveInt]
            [:name ms/NonBlankString]
            [:email ms/NonBlankString]
            [:type ms/NonBlankString]]]
  (add-workspace-entity
   workspace-id :users
   {:id (:id user)
    :name (:name user)
    :email (:email user)
    :type (:type user)
    :created_at (str (java.time.Instant/now))})
  (m.workspace/sort-workspace
   (t2/select-one :model/Workspace :id workspace-id)))

(api.macros/defendpoint :put "/:workspace-id/user/:index"
  "Replace a user in the workspace, by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the user to replace (0-based)

   Request body:
   - id (required): User ID
   - name (required): User name
   - email (required): User email
   - type (required): User type (e.g., 'workspace-user')"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index :int]]
   _query-params
   {:keys [user_id name email type]}
   :- [:map
       [:user_id ms/PositiveInt]
       [:name ms/NonBlankString]
       [:email ms/NonBlankString]
       [:type ms/NonBlankString]]]
  (update-workspace-entity-at-index workspace-id :users index
                                    (fn [current-user]
                                      (merge current-user {:id user_id
                                                           :name name
                                                           :email email
                                                           :type type
                                                           :created_at (str (java.time.Instant/now))}))))

(api.macros/defendpoint :delete "/:workspace-id/user/:index"
  "Delete a user from the workspace by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the user to delete (0-based)"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index :int]]
   _query-params]
  (delete-workspace-entity-at-index workspace-id :users index)
  api/generic-204-no-content)

;; POST /api/ee/workspace/:workspace-id/permission
(api.macros/defendpoint :post "/:workspace-id/permission"
  "Add a permission to the workspace.

   Request body:
   - table (required): Table name
   - permission (required): Permission type (read or write)"
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   {:keys [table permission]}
   :- [:map
       [:table ms/NonBlankString]
       [:permission [:enum "read" "write"]]]]
  (add-workspace-entity
   workspace-id :permissions
   {:table table
    :permission (keyword permission)
    :created_at (str (java.time.Instant/now))})
  (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id)))

(api.macros/defendpoint :put "/:workspace-id/permission/:index"
  "Replace a permission in the workspace, by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the permission to replace (0-based)

   Request body:
   - table (required): Table name
   - permission (required): Permission type (read or write)"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index :int]]
   _query-params
   {:keys [table permission]}
   :- [:map
       [:table ms/NonBlankString]
       [:permission [:enum "read" "write"]]]]
  (update-workspace-entity-at-index
   workspace-id :permissions index
   (fn [current-permission]
     (merge current-permission {:table table
                                :permission (keyword permission)
                                :created_at (str (java.time.Instant/now))})))
  (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id)))

(api.macros/defendpoint :delete "/:workspace-id/permission/:index"
  "Delete a permission from the workspace by index.

   Route Params:
    - id (required): Workspace ID
    - index (required): Index of the permission to delete (0-based)"
  [{:keys [workspace-id index]} :- [:map
                                    [:workspace-id ms/PositiveInt]
                                    [:index :int]]
   _query-params]
  (delete-workspace-entity-at-index workspace-id :permissions index)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes for workspace management"
  (api.macros/ns-handler *ns* +auth))
