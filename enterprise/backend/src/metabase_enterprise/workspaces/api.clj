(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [clj-yaml.core :as yaml]
   [metabase-enterprise.workspaces.common :as w.common]
   [metabase-enterprise.workspaces.isolation-manager :as isolation-manager]
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment
  isolation-manager/keep-me ;;temp
  m.workspace/keep-me)

(set! *warn-on-reflection* true)

(mu/defn- add-workspace-entity!
  "Adds a workspace entity, such as a plan or transform, to the workspace.

   Args:
   - workspace-id: The workspace ID
   - entity-key: The key in the workspace map (:plans, :transforms, etc.)
   - new-entity: The new entity to add, which should be a map with the necessary fields"
  [workspace-id
   entity-key :- ::m.workspace/entity-column
   new-entity]
  (try (w.common/add-workspace-entity! workspace-id entity-key new-entity)
       (catch Exception e
         (case (:error (ex-data e))
           :no-workspace (throw (ex-info "Workspace not found" {:status-code 404
                                                                :error :no-workspace}))
           (throw e)))))

(defn update-workspace-entity-at-index!
  [workspace-id entity-key index update-fn]
  (try (w.common/update-workspace-entity-at-index! workspace-id entity-key index update-fn)
       (catch Exception e
         (case (:error (ex-data e))
           :no-workspace [404 "Workspace not found"]
           :no-index [404 (str "No " entity-key " found at index " index " there are only " (:item-count (ex-data e)))]
           (throw e)))))

(defn- delete-workspace-entity-at-index!
  "Deletes an entity at a specific index in the workspace's entity collection.

   Args:
   - workspace-id: The workspace ID
   - entity-key: The key in the workspace map (:plans, :transforms, etc.)
   - index: The 0-based index of the entity to delete"
  [workspace-id entity-key index]
  (try (w.common/delete-workspace-entity-at-index! workspace-id entity-key index)
       (catch Exception e
         (case (:error (ex-data e))
           :no-workspace (#'api/generic-404 "Workspace not found")
           :no-index (#'api/generic-404 (str "No " entity-key " found at index " index " there are only " (:item-count (ex-data e))))
           (throw e)))))

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
  {:status 200
   :body (w.common/create-workspace! name description api/*current-user-id*)})

(defn- init-and-run-workspace! [plan]
  (let [workspace (w.common/create-workspace! "name" "description" api/*current-user-id*)
        plan-data (into {} (yaml/parse-string plan))]
    (when-not (mr/validate ::m.workspace/plan plan-data)
      (log/info "Invalid plan data!"))
    (w.common/init-workspace workspace plan-data)
    (w.common/run-steps workspace plan-data)
    {:collection-id (:collection_id workspace)}))

(comment
  (require '[metabase.test :as mt])

  (def pd {:transforms [{:name "transform_api_key",
                         :description nil
                         :source {:type "query", :query {:database 2, :type "query", :query {:source-table 33}}}
                         :target {:type "table", :name "transform_api_key_table", :schema "public"}}
                        {:name "transform_user",
                         :description nil,
                         :source {:type "query", :query {:database 2, :type "query", :query {:source-table 144}}},
                         :target {:type "table", :name "transform_user_table", :schema "public"}}]
           :steps [{:type :run-transform :name "transform_api_key"}
                   {:type :run-transform :name "transform_user"}
                   {:type :create-model :transform-name "transform_api_key"}
                   {:type :create-model :transform-name "transform_user"}]})

  (do   (binding [api/*current-user-id* (mt/user->id :crowberto)
                  api/*current-user-permissions-set* (atom #{"/"})]
          (def w (:workspace (w.common/create-workspace! "name" "description" api/*current-user-id*))))

        (w.common/init-workspace w pd)

        (t2/select-one :model/Workspace :id (:id w))
        (binding [api/*current-user-id* (mt/user->id :crowberto)]
          (w.common/run-steps
           (t2/select-one :model/Workspace :id (:id w))
           pd))

        (:data_warehouses (t2/select-one :model/Workspace :id (:id w)))

        (:collection_id (t2/select-one :model/Workspace :id (:id w))))

  (t2/select :model/Card 124))

;; POST /api/ee/workspace/create
(api.macros/defendpoint :post "/create"
  "Create a new workspace.

   Request body:
   - name (required): Workspace name
   - description (optional): Workspace description"
  [_route-params
   _query-params
   {:keys [plan]}]
  (init-and-run-workspace! plan))

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
