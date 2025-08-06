(ns metabase-enterprise.workspaces.api.workspace
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment
  m.workspace/keep-me)

(set! *warn-on-reflection* true)

;; API endpoints for workspace management
;; Implements the tech spec requirements with updated schema:
;; - POST /api/ee/workspace
;; - PUT /api/ee/workspace/:id
;; - DELETE /api/ee/workspace/:id
;; - PUT /api/ee/workspace/:id/plan
;; - PUT /api/ee/workspace/:id/transform
;; - PUT /api/ee/workspace/:id/document
;; - PUT /api/ee/workspace/:id/dwh
;; - PUT /api/ee/workspace/:id/user

(api.macros/defendpoint :get "/"
  "List all workspaces for the current user"
  [_route-params _query-params]
  (t2/select :model/Workspace :archived false))

(api.macros/defendpoint :get "/:id"
  "Get a workspace by ID"
  [id]
  {id ms/PositiveInt}
  (api/check-404 (t2/select-one :model/Workspace :id id)))

(api.macros/defendpoint :post "/"
  "Create a new workspace.

   Request body:
   - name (required): Workspace name
   - description (optional): Workspace description"
  [_route-params
   _query-params
   {:keys [name description]}
   :- [:map
       [:name ms/NonBlankString]
       [:description {:optional true} [:maybe :string]]]]
  (let [now (str (java.time.Instant/now))
        workspace-data {:name name
                        :description description
                        :created_at now
                        :updated_at now
                        :users []
                        :plans []
                        :transforms []
                        :activity_log []
                        :permissions []
                        :documents []
                        :dwh []}]
    (t2/insert-returning-instance! :model/Workspace workspace-data)))

(api.macros/defendpoint :put "/:id"
  "Update an existing workspace.

   Request body:
   - name (required): Updated workspace name  
   - description (optional): Updated workspace description"
  [id
   _route-params
   _query-params
   {:keys [name description]}
   :- [:map
       [:name ms/NonBlankString]
       [:description {:optional true} [:maybe :string]]]]
  {id ms/PositiveInt}
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (t2/update! :model/Workspace id
              {:name name
               :description description
               :updated_at (str (java.time.Instant/now))})
  (t2/select-one :model/Workspace :id id))

(api.macros/defendpoint :delete "/:id"
  "Delete a workspace."
  [id]
  {id ms/PositiveInt}
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (t2/delete! :model/Workspace :id id)
  api/generic-204-no-content)

(api.macros/defendpoint :put "/:id/plan"
  "Add a plan to the workspace.
   
   Request body:
   - title (required): Plan title
   - description (required): Plan description  
   - content (required): Plan content object"
  [id
   _route-params
   _query-params
   {:keys [title description content]}
   :- [:map
       [:title ms/NonBlankString]
       [:description ms/NonBlankString]
       [:content :map]]]
  {id ms/PositiveInt}
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-plans (or (:plans workspace) [])
        new-plan {:title title
                  :description description
                  :content content
                  :created-at (str (java.time.Instant/now))}
        updated-plans (conj current-plans new-plan)]
    (t2/update! :model/Workspace id
                {:plans updated-plans
                 :updated_at (str (java.time.Instant/now))})
    (t2/select-one :model/Workspace :id id)))

(api.macros/defendpoint :put "/:id/transform"
  "Add a transform to the workspace.
   
   Request body:
   - name (required): Transform name
   - description (required): Transform description
   - source (required): Source configuration
   - target (required): Target configuration  
   - config (optional): Transform configuration"
  [id
   _route-params
   _query-params
   {:keys [name description source target config]}
   :- [:map
       [:name ms/NonBlankString]
       [:description ms/NonBlankString]
       [:source :map]
       [:target :map]
       [:config {:optional true} [:maybe :map]]]]
  {id ms/PositiveInt}
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
                {:transforms updated-transforms
                 :updated_at (str (java.time.Instant/now))})
    (t2/select-one :model/Workspace :id id)))

(api.macros/defendpoint :put "/:id/document"
  "Add a document to the workspace.
   
   Request body:
   - document_id (required): ID of the document to link"
  [id
   _route-params
   _query-params
   {:keys [document_id]}
   :- [:map
       [:document_id ms/PositiveInt]]]
  {id ms/PositiveInt}
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-docs (or (:documents workspace) [])
        updated-docs (if (some #{document_id} current-docs)
                       current-docs
                       (conj current-docs document_id))]
    (t2/update! :model/Workspace id
                {:documents updated-docs
                 :updated_at (str (java.time.Instant/now))})
    (t2/select-one :model/Workspace :id id)))

(api.macros/defendpoint :put "/:id/dwh"
  "Add a data warehouse to the workspace.
   
   Request body:
   - dwh_id (required): ID of the data warehouse
   - name (required): Name of the data warehouse
   - type (required): Access type (read-only or read-write)
   - credentials (required): Credentials object"
  [id
   _route-params
   _query-params
   {:keys [dwh_id name type credentials]}
   :- [:map
       [:dwh_id ms/PositiveInt]
       [:name ms/NonBlankString]
       [:type [:enum "read-only" "read-write"]]
       [:credentials :map]]]
  {id ms/PositiveInt}
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-dwh (or (:dwh workspace) [])
        new-dwh {:id dwh_id
                 :name name
                 :type (keyword type)
                 :credentials credentials
                 :created-at (str (java.time.Instant/now))}
        updated-dwh (conj current-dwh new-dwh)]
    (t2/update! :model/Workspace id
                {:dwh updated-dwh
                 :updated_at (str (java.time.Instant/now))})
    (t2/select-one :model/Workspace :id id)))

(api.macros/defendpoint :put "/:id/user"
  "Add a user to the workspace.
   
   Request body:
   - user_id (required): User ID
   - name (required): User name
   - email (required): User email
   - type (required): User type (e.g., 'workspace-user')"
  [id
   _route-params
   _query-params
   {:keys [user_id name email type]}
   :- [:map
       [:user_id ms/PositiveInt]
       [:name ms/NonBlankString]
       [:email ms/NonBlankString]
       [:type ms/NonBlankString]]]
  {id ms/PositiveInt}
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-users (or (:users workspace) [])
        new-user {:id user_id
                  :name name
                  :email email
                  :type type
                  :created-at (str (java.time.Instant/now))}
        updated-users (conj current-users new-user)]
    (t2/update! :model/Workspace id
                {:users updated-users
                 :updated_at (str (java.time.Instant/now))})
    (t2/select-one :model/Workspace :id id)))

(api.macros/defendpoint :put "/:id/permission"
  "Add a permission to the workspace.
   
   Request body:
   - table (required): Table name
   - permission (required): Permission type (read or write)"
  [id
   _route-params
   _query-params
   {:keys [table permission]}
   :- [:map
       [:table ms/NonBlankString]
       [:permission [:enum "read" "write"]]]]
  {id ms/PositiveInt}
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-permissions (or (:permissions workspace) [])
        new-permission {:table table
                        :permission (keyword permission)
                        :created-at (str (java.time.Instant/now))}
        updated-permissions (conj current-permissions new-permission)]
    (t2/update! :model/Workspace id
                {:permissions updated-permissions
                 :updated_at (str (java.time.Instant/now))})
    (t2/select-one :model/Workspace :id id)))

(def ^{:arglists '([request respond raise])} routes
  "API routes for workspace management"
  +auth)

(comment
  ;; Example transform from existing test
  (require '[metabase.test :as mt])
  (defn- make-transform [target-table-name]
    {:name "Gadget Products"
     :description "Desc"
     :source {:type "query"
              :query {:database (mt/id)
                      :type "native"
                      :native {:query "SELECT * FROM products WHERE category = 'Gadget'"
                               :template-tags {}}}}
     :target {:type "table"
              :name target-table-name}})

  (make-transform "my-table"))
