(ns metabase-enterprise.workspaces.api.workspace
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; API endpoints for workspace management
;; Implements the tech spec requirements:
;; - POST /api/ee/workspace
;; - PUT /api/ee/workspace/:id
;; - DELETE /api/ee/workspace/:id
;; - PUT /api/ee/workspace/:id/plan
;; - PUT /api/ee/workspace/:id/transform
;; - PUT /api/ee/workspace/:id/document
;; - PUT /api/ee/workspace/:id/dwh

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
  (let [workspace-data {:name name
                        :description description
                        :created_at (str (java.time.Instant/now))
                        :updated_at (str (java.time.Instant/now))
                        :plans {}
                        :transforms {}
                        :activity_log {}
                        :permissions []
                        :user nil
                        :documents []}]
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
  "Add or update a plan in the workspace.
   
   Request body:
   - plan_id (required): Unique identifier for the plan
   - details (required): Plan details object"
  [id
   _route-params
   _query-params
   {:keys [plan_id details]}
   :- [:map
       [:plan_id ms/NonBlankString]
       [:details :map]]]
  {id ms/PositiveInt}
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-plans (or (:plans workspace) {})
        updated-plans (assoc current-plans plan_id details)]
    (t2/update! :model/Workspace id
                {:plans updated-plans
                 :updated_at (str (java.time.Instant/now))})
    (t2/select-one :model/Workspace :id id)))

(api.macros/defendpoint :put "/:id/transform"
  "Add or update a transform in the workspace.
   
   Request body:
   - transform_path (required): Path/filename for the transform
   - transform_data (required): Transform configuration object"
  [id
   _route-params
   _query-params
   {:keys [transform_path transform_data]}
   :- [:map
       [:transform_path ms/NonBlankString]
       [:transform_data :map]]]
  {id ms/PositiveInt}
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        current-transforms (or (:transforms workspace) {})
        updated-transforms (assoc current-transforms transform_path transform_data)]
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
  "Attach a data warehouse to the workspace.
   
   Request body:
   - database_id (required): ID of the database
   - database_name (required): Name of the database  
   - database_user (optional): Database user info
   - schema_details (optional): Schema configuration
   - tables (optional): Table permissions"
  [id
   _route-params
   _query-params
   {:keys [database_id database_name database_user schema_details tables]}
   :- [:map
       [:database_id ms/PositiveInt]
       [:database_name ms/NonBlankString]
       [:database_user {:optional true} [:maybe :map]]
       [:schema_details {:optional true} [:maybe :map]]
       [:tables {:optional true} [:maybe [:sequential :string]]]]]
  {id ms/PositiveInt}
  (let [_workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        dwh-config {:id database_id
                    :name database_name
                    :user database_user
                    :schema_details schema_details
                    :tables tables}]
    (t2/update! :model/Workspace id
                {:database dwh-config
                 :updated_at (str (java.time.Instant/now))})
    (t2/select-one :model/Workspace :id id)))

(def ^{:arglists '([request respond raise])} routes
  "API routes for workspace management"
  +auth)
