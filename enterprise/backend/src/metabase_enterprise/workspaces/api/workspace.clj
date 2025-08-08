
(ns metabase-enterprise.workspaces.api.workspace
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [java-time.api :as t]
   [lambdaisland.deep-diff2 :as ddiff]
   [medley.core :as m]
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment
  m.workspace/keep-me)

(set! *warn-on-reflection* true)

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
  (let [workspace (t2/select-one :model/Workspace :id workspace-id)]
    (api/check-404 workspace)
    (m.workspace/sort-workspace workspace)))

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
  (let [workspace-data {:name name
                        :description description
                        :collection_id collection_id
                        :users []
                        :plans []
                        :transforms []
                        :activity_logs []
                        :permissions []
                        :documents []
                        :data_warehouses []}]
    (m.workspace/sort-workspace
     (t2/insert-returning-instance! :model/Workspace workspace-data))))

(comment

  (doseq [del-id (map :id (rest (t2/select [:model/Collection :id] :name "Workspace Collection")))]
    (t2/delete! :model/Collection :id del-id))

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

;; PUT /api/ee/workspace/:id
(api.macros/defendpoint :put "/:id"
  "Update an existing workspace's name or description.

   Request body:
   - name (required): Updated workspace name  
   - description (optional): Updated workspace description

   Returns the updated workspace."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [name description]} :- [:map
                                  [:name ms/NonBlankString]
                                  [:description {:optional true} [:maybe :string]]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (t2/update! :model/Workspace id {:name name :description description})
  (t2/select-one :model/Workspace :id id))

;; DELETE /api/ee/workspace/:id
(api.macros/defendpoint :delete "/:id"
  "Delete a workspace."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (t2/delete! :model/Workspace :id id)
  api/generic-204-no-content)

;; PUT /api/ee/workspace/:id/plan
(api.macros/defendpoint :put "/:id/plan"
  "Add a plan to the workspace.
   
   Request body:
   - title (required): Plan title
   - description (required): Plan description  
   - content (required): Plan content object"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [title description content]}
   :- [:map
       [:title ms/NonBlankString]
       [:description {:optional true} [:maybe ms/NonBlankString]]
       [:content :map]]]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-plans (or (:plans workspace) [])
        new-plan {:title title
                  :description description
                  :content content
                  :created-at (str (java.time.Instant/now))}
        updated-plans (conj current-plans new-plan)]
    (t2/update! :model/Workspace id {:plans updated-plans})
    (m.workspace/sort-workspace (t2/select-one :model/Workspace :id id))))

#_(let [w (t2/select-one :model/Workspace)
        s (m.workspace/sort-workspace (t2/select-one :model/Workspace))]
    (clojure.data/diff w s))

;; PUT /api/ee/workspace/:id/transform
(api.macros/defendpoint :put "/:id/transform"
  "Add a transform to the workspace.
   
   Request body:
   - name (required): Transform name
   - description (required): Transform description
   - source (required): Source configuration
   - target (required): Target configuration  
   - config (optional): Transform configuration"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [name description source target config]}
   :- [:map
       [:name ms/NonBlankString]
       [:description ms/NonBlankString]
       [:source :map]
       [:target :map]
       [:config {:optional true} [:maybe :map]]]]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-transforms (or (:transforms workspace) [])
        new-transform {:name name
                       :description description
                       :source source
                       :target target
                       :config config
                       :created-at (str (java.time.Instant/now))}
        updated-transforms (conj current-transforms new-transform)]
    (t2/update! :model/Workspace id
                {:transforms updated-transforms})
    (m.workspace/sort-workspace (t2/select-one :model/Workspace :id id))))

;; PUT /api/ee/workspace/:id/document
(api.macros/defendpoint :put "/:id/document"
  "Add a document to the workspace.
   
   Request body:
   - document_id (required): ID of the document to link"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [document_id]} :- [:map [:document_id ms/PositiveInt]]]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-docs (or (:documents workspace) [])
        updated-docs (distinct (conj current-docs document_id))]
    (t2/update! :model/Workspace id {:documents updated-docs})
    (m.workspace/sort-workspace (t2/select-one :model/Workspace :id id))))

;; PUT /api/ee/workspace/:id/data_warehouse
(api.macros/defendpoint :put "/:id/data_warehouse"
  "Add a data warehouse to the workspace.
   
   Request body:
   - dwh_id (required): ID of the data warehouse
   - name (required): Name of the data warehouse
   - type (required): Access type (read-only or read-write)
   - credentials (required): Credentials object"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [data_warehouses_id name
           type credentials]} :- [:map
                                  [:data_warehouses_id ms/PositiveInt]
                                  [:name ms/NonBlankString]
                                  [:type [:enum "read-only" "read-write"]]
                                  [:credentials :map]]]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-dwh (or (:data_warehouses workspace) [])
        new-dwh {:id data_warehouses_id
                 :name name
                 :type (keyword type)
                 :credentials credentials
                 :created-at (str (java.time.Instant/now))}
        updated-dwh (conj current-dwh new-dwh)]
    (t2/update! :model/Workspace id
                {:data_warehouses updated-dwh})
    (m.workspace/sort-workspace (t2/select-one :model/Workspace :id id))))

(defn- add-user! [workspace user]
  (let [current-users (or (:users workspace) [])
        new-user (assoc user :created-at (str (java.time.Instant/now)))
        updated-users (conj current-users new-user)]
    (t2/update! :model/Workspace (:id workspace) {:users updated-users})))

;; PUT /api/ee/workspace/:id/user
(api.macros/defendpoint :put "/:workspace-id/user"
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
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id workspace-id))]
    (add-user! workspace user)
    (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id))))

;; PUT /api/ee/workspace/:id/permission
(api.macros/defendpoint :put "/:id/permission"
  "Add a permission to the workspace.
   
   Request body:
   - table (required): Table name
   - permission (required): Permission type (read or write)"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [table permission]}
   :- [:map
       [:table ms/NonBlankString]
       [:permission [:enum "read" "write"]]]]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-permissions (or (:permissions workspace) [])
        new-permission {:table table
                        :permission (keyword permission)
                        :created-at (str (java.time.Instant/now))}
        updated-permissions (conj current-permissions new-permission)]
    (t2/update! :model/Workspace id
                {:permissions updated-permissions})
    (t2/select-one :model/Workspace :id id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes for workspace management"
  (api.macros/ns-handler *ns* +auth))
