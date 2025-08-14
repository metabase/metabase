(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [metabase-enterprise.workspaces.common :as w.common]
   [metabase-enterprise.workspaces.isolation-manager :as isolation-manager]
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment
  isolation-manager/keep-me ;;temp
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
   {:keys [name description]}
   :- [:map
       [:name ms/NonBlankString]
       [:description {:optional true} [:maybe :string]]]]
  {:status 200 :body (w.common/create-workspace! name description)})

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

(api.macros/defendpoint :delete "/:workspace-id"
  "Delete a workspace."
  [{:keys [workspace-id]} :- [:map
                              [:workspace-id ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (w.common/delete-workspace! workspace-id)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes for workspace management"
  (api.macros/ns-handler *ns* +auth))
