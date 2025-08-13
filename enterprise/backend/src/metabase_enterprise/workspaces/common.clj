(ns metabase-enterprise.workspaces.common
  (:require
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.api.common :as api]
   [metabase.collections.common :as c.common]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn create-workspace!
  "Creates a workspace"
  ;; TODO: workspaces create their own collections
  [name description]
  (let [containing-coll (c.common/create-collection!
                         {:name name
                          :description description
                          :namespace "workspaces"})
        workspace-data {:name name
                        :description description
                        :collection_id (:id containing-coll)
                        :users []
                        :plans []
                        :transforms []
                        :activity_logs []
                        :permissions []
                        :documents []
                        :data_warehouses []}]
    (m.workspace/sort-workspace
     (t2/insert-returning-instance! :model/Workspace workspace-data))))

(defn delete-workspace! [workspace-id]
  ;; TODO: tear down the entire workspace, including its collection
  (t2/delete! :model/Workspace :id workspace-id))

(mu/defn add-workspace-entity
  "Adds a workspace entity, such as a plan or transform, to the workspace.

   Args:
   - workspace-id: The workspace ID
   - entity-key: The key in the workspace map (:plans, :transforms, etc.)
   - new-entity: The new entity to add, which should be a map with the necessary fields"
  [workspace-id
   entity-key :- ::m.workspace/entity-column
   new-entity :- :map]
  (let [workspace (t2/select-one :model/Workspace :id workspace-id)
        _ (when-not workspace (throw (ex-info "Workspace not found" {:error :no-workspace})))
        current-entities (vec (or (get workspace entity-key) []))
        entity-with-created-at (assoc new-entity :created_at (str (java.time.Instant/now)))
        updated-entities (conj current-entities entity-with-created-at)]
    (t2/update! :model/Workspace workspace-id {entity-key updated-entities})))

(defn update-workspace-entity-at-index
  "Updates an entity at a specific index in the workspace's entity collection.

   Args:
   - workspace-id: The workspace ID
   - entity-key: The key in the workspace map (:plans, :transforms, etc.)
   - index: The 0-based index of the entity to update
   - update-fn: Function that takes the current entity and returns the updated entity"
  [workspace-id entity-key index update-fn]
  (let [workspace (t2/select-one :model/Workspace :id workspace-id)
        _ (when-not workspace (throw (ex-info "Workspace not found" {:error :no-workspace})))
        current-items (vec (get workspace entity-key []))
        item-count (count current-items)
        _ (when (or (nil? index) (>= index item-count))
            (throw (ex-info "Index out of bounds" {:error :no-index
                                                   :item-count item-count})))
        current-item (nth current-items index nil)
        new-item (update-fn current-item)
        updated-items (assoc current-items index new-item)]
    (t2/update! :model/Workspace workspace-id {entity-key updated-items})))

(mu/defn- drop-index
  "Note, the insertion order only works when current-items is a vector.
   Drops the item at the specified index from the vector of current items."
  [current-items :- [:vector :any] index]
  (into (subvec current-items 0 index)
        (subvec current-items (inc index))))

(comment
  (mapv #(drop-index [:a :b :c] %)
        [0 1 2])
  ;; => [[:b :c] [:a :c] [:a :b]]
  )

(defn delete-workspace-entity-at-index
  "Deletes an entity at a specific index in the workspace's entity collection.

   Args:
   - workspace-id: The workspace ID
   - entity-key: The key in the workspace map (:plans, :transforms, etc.)
   - index: The 0-based index of the entity to delete"
  [workspace-id entity-key index]
  (let [workspace (t2/select-one :model/Workspace :id workspace-id)
        _ (when-not workspace (throw (ex-info "Workspace not found" {:error :no-workspace})))
        current-items (vec (get workspace entity-key []))
        _ (when (or (nil? index) (>= index (count current-items)))
            (throw (ex-info "Index out of bounds" {:error :no-index
                                                   :item-count (count current-items)})))
        updated-items (drop-index current-items index)]
    (t2/update! :model/Workspace workspace-id {entity-key updated-items})
    (m.workspace/sort-workspace (t2/select-one :model/Workspace :id workspace-id))))

(comment

  (binding [api/*current-user-permissions-set* (atom #{"/"})]
    (let [w (create-workspace! "repl workspace" nil)]
      (def w w)
      w))

  (add-workspace-entity (:id w)
                        :plans
                        {:name "Test Plan 1"
                         :description "This is a test plan"
                         :content {}})
  (add-workspace-entity (:id w)
                        :plans
                        {:name "Test Plan 2"
                         :description "This is another test plan"
                         :content {}})
  (:plans (t2/select-one :model/Workspace :id (:id w)))
  ;; => ({:name "Test Plan 1", :description "This is a test plan", :content {}, :created_at "2025-08-13T15:50:20.203613Z"}
  ;;     {:name "Test Plan 2",
  ;;      :description "This is another test plan",
  ;;      :content {},
  ;;      :created_at "2025-08-13T15:50:21.296516Z"})

  (update-workspace-entity-at-index
   (:id w)
   :plans
   0
   (fn [plan]
     (assoc plan :name "Super Test Plan 1")))
  ;; => 1

  (:plans (t2/select-one :model/Workspace :id (:id w)))
  ;; => ({:name "Super Test Plan 1",
  ;;      :description "This is a test plan",
  ;;      :content {},
  ;;      :created_at "2025-08-13T15:50:20.203613Z"}
  ;;     {:name "Test Plan 2",
  ;;      :description "This is another test plan",
  ;;      :content {},
  ;;      :created_at "2025-08-13T15:50:21.296516Z"})

  (delete-workspace-entity-at-index (:id w) :plans 1)

  (:plans (t2/select-one :model/Workspace :id (:id w)))
  ;; => ({:name "Super Test Plan 1",
  ;;      :description "This is a test plan",
  ;;      :content {},
  ;;      :created_at "2025-08-13T15:50:20.203613Z"})
  )
