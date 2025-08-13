(ns metabase-enterprise.workspaces.common
  (:require
   [metabase-enterprise.workspaces.isolation-manager :as isolation-manager]
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.api.common :as api]
   [metabase.collections.common :as c.common]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn create-workspace!
  "Creates a workspace, and returns it"
  [name description]
  (let [containing-coll (c.common/create-collection!
                         {:name name
                          :description description
                          :namespace "workspaces"})
        ;; TODO: merge + use: create-single-collection-api-key!
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
  [workspace-id-or-workspace :- [:or :map :int]
   entity-key :- ::m.workspace/entity-column
   new-entity :- :map]
  (let [{workspace-id :id
         :as workspace} (if (map? workspace-id-or-workspace)
                          workspace-id-or-workspace
                          (t2/select-one :model/Workspace :id workspace-id-or-workspace))
        _ (when-not workspace (throw (ex-info "Workspace not found" {:error :no-workspace})))
        current-entities (vec (or (get workspace entity-key) []))
        entity-with-created-at (assoc new-entity :created_at (str (java.time.Instant/now)))
        updated-entities (conj current-entities entity-with-created-at)]
    (t2/update! :model/Workspace workspace-id {entity-key updated-entities})))

(mu/defn add-workspace-entites
  "Adds a workspace entity, such as a plan or transform, to the workspace.

   Args:
   - workspace-id: The workspace ID
   - entity-key: The key in the workspace map (:plans, :transforms, etc.)
   - new-entity: The new entity to add, which should be a map with the necessary fields"
  [workspace-id-or-workspace :- [:or :map :int]
   entity-key :- ::m.workspace/entity-column
   new-entities :- [:sequential :any]]
  (let [{workspace-id :id
         :as workspace} (if (map? workspace-id-or-workspace)
                          workspace-id-or-workspace
                          (t2/select-one :model/Workspace :id workspace-id-or-workspace))
        _ (when-not workspace (throw (ex-info "Workspace not found" {:error :no-workspace})))
        current-entities (vec (or (get workspace entity-key) []))
        entities-with-created-at (map #(assoc % :created_at (str (java.time.Instant/now)))
                                      new-entities)
        updated-entities (into current-entities entities-with-created-at)]
    (t2/update! :model/Workspace workspace-id {entity-key updated-entities})))

(defn divert-transform-target
  "Returns the target schema that a transform should run in when exectued from the workspace."
  [workspace]
  ;; TODO
  (isolation-manager/isolation-schema-name (:slug workspace "demo")))

(defn link-transform! [workspace-id transform-id]
  (let [workspace (t2/select-one :model/Workspace :id workspace-id)
        _ (when-not workspace (throw (ex-info "Workspace not found" {:error :no-workspace})))
        transform (t2/select-one :model/Transform :id transform-id)
        _ (when-not transform (throw (ex-info "Transform not found" {:error :no-transform})))
        copied-transform {:id (:id transform)
                          :name (:name transform)
                          :description (:description transform)
                          :source (:source transform)
                          :target (:target transform)
                          :config (:config transform)
                          :created_at (str (java.time.Instant/now))}]
    (add-workspace-entity workspace :transforms copied-transform)))

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

(defn- source-database
  "Return the `source` table of a transform."
  [transform]
  (-> transform :source :query :database))

#_(defn delete-isolations! [{activity-logs :activity_logs :as workspace}]
    (doseq [isolation-info activity_log]
      (isolation-manager/delete-isolation engine details workspace-id isolation-info))
    output)

;; decision: this is so bespoke to us maybe it goes here now. But perhaps the querying team can help us adjust these
;; things with a proper api in the future
(defn patch-transforms
  "Patch transforms so they point at the new isolation mechanism. Right now, only impelemnted for schema based
  isolations. So clickhouse doesn't yet work. But clickhouse might just work the same because schema and database are
  perhaps the same in the way we compile queries for clickhouse."
  [schema-name transforms]
  (for [t transforms]
    (assoc-in t [:target :schema] schema-name)))

(defn create-isolations!
  "Creates an isolation for each of the workspace's transforms.

   This function will create an isolation schema for each transform's source database.
   It will throw an error if the workspace has no transforms or if the source database is not found.

  Logs the creation of isolation schemas in the activity_logs of the workspace"
  [{:keys [transforms] :as workspace}]
  (let [_ (when-not (seq transforms)
            (throw (ex-info "Workspace must have at least one transform to create isolation" {:error :no-transforms})))
        db-ids (distinct (map source-database transforms))
        databases (t2/select :model/Database :id [:in db-ids])
        isolation-info (into {}
                             (for [{db-id :id :keys [engine details]} databases]
                               (do
                                 ;; Create isolation for each transform's source database
                                 (log/info "Creating isolation for workspace" (:id workspace) " db id: " db-id)
                                 ;; Create the isolation manager for the transform
                                 [db-id (isolation-manager/create-isolation engine details (:slug workspace))])))
        isolation-info-no-results (update-vals isolation-info #(dissoc % :results))]
    ;; TODO make this smarter at inserting stuff in 1 round trip:
    (add-workspace-entity workspace :activity_logs isolation-info)
    (t2/update! :model/Workspace (:id workspace)
                {:data_warehouses (merge (:data_warehouses workspace) isolation-info-no-results)})
    (add-workspace-entity workspace :data_warehouses isolation-info-no-results)
    isolation-info-no-results))

(comment

  (do (require '[metabase.test :as mt])
      ;; will id alone work here? ^
      ;; current user is used to generate the api key
      (binding [api/*current-user-id* (mt/user->id :rasta)
                api/*current-user-permissions-set* (atom #{"/"})]
        (let [w (create-workspace! "repl workspace" nil)]
          (def w w)
          w)))

  (create-isolations! rw)

  (link-transform! (:id w) 1)
  (link-transform! (:id w) 2)
  (t2/select-one :model/Workspace :slug (:slug w))
  ;; => (toucan2.instance/instance
  ;;     :model/Workspace
  ;;     {:description nil,
  ;;      :slug "repl_workspace_262333",
  ;;      :permissions (),
  ;;      :activity_logs (),
  ;;      :collection_id 16,
  ;;      :name "repl workspace",
  ;;      :transforms
  ;;      ({:id 1,
  ;;        :name "core_user_transform",
  ;;        :description nil,
  ;;        :source {:type "query", :query {:database 2, :type "query", :query {:source-table 123}}},
  ;;        :target {:type "table", :name "core_user_transform_table", :schema "public"},
  ;;        :config nil,
  ;;        :created_at "2025-08-13T21:16:15.925838Z"}
  ;;       {:id 2,
  ;;        :name "core_session_transform",
  ;;        :description nil,
  ;;        :source {:type "query", :query {:database 2, :type "query", :query {:source-table 88}}},
  ;;        :target {:type "table", :name "core_session_transform_table", :schema "public"},
  ;;        :config nil,
  ;;        :created_at "2025-08-13T21:16:19.072003Z"}),
  ;;      :plans (),
  ;;      :updated_at #t "2025-08-13T21:16:19.072423Z",
  ;;      :documents (),
  ;;      :id 10,
  ;;      :data_warehouses (),
  ;;      :created_at #t "2025-08-13T21:15:59.920962Z",
  ;;      :users ()})

  (create-isolations! (t2/select-one :model/Workspace :slug (:slug w)))
  ;; => {2
  ;;     {:isolation-type :schema,
  ;;      :schema-name "mb__isolation_0f496_repl_workspace_262333",
  ;;      :populator
  ;;      {:user "mb_iso_0f496_repl_workspace_262333_populator", :password "bfd45256-e178-4239-8c51-37909d2a38e1"}}}

  (t2/select-one :model/Workspace :slug (:slug w))
  ;; => (toucan2.instance/instance
  ;;     :model/Workspace
  ;;     {:description nil,
  ;;      :slug "repl_workspace_262333",
  ;;      :permissions (),
  ;;      :activity_logs
  ;;      ({:2
  ;;        {:isolation-type "schema",
  ;;         :schema-name "mb__isolation_0f496_repl_workspace_262333",
  ;;         :populator
  ;;         {:user "mb_iso_0f496_repl_workspace_262333_populator", :password "bfd45256-e178-4239-8c51-37909d2a38e1"},
  ;;         :results
  ;;         [[["tree" "schema"]
  ;;           ["success" "CREATE SCHEMA mb__isolation_0f496_repl_workspace_262333" [0]]
  ;;           ["tree" "users"]
  ;;           ["tree" "populator"]
  ;;           ["success"
  ;;            "CREATE USER mb_iso_0f496_repl_workspace_262333_populator WITH PASSWORD 'bfd45256-e178-4239-8c51-37909d2a38e1'"
  ;;            [0]]
  ;;           ["tree" "populator-privileges"]
  ;;           ["success" "GRANT USAGE ON SCHEMA public TO mb_iso_0f496_repl_workspace_262333_populator" [0]]
  ;;           ["success" "GRANT USAGE ON SCHEMA public TO mb_iso_0f496_repl_workspace_262333_populator" [0]]
  ;;           ["success"
  ;;            "GRANT USAGE ON SCHEMA mb__isolation_0f496_repl_workspace_262333 TO mb_iso_0f496_repl_workspace_262333_populator"
  ;;            [0]]
  ;;           ["success" "GRANT SELECT ON ALL TABLES IN SCHEMA public TO mb_iso_0f496_repl_workspace_262333_populator" [0]]
  ;;           ["success"
  ;;            "GRANT CREATE ON SCHEMA mb__isolation_0f496_repl_workspace_262333 TO mb_iso_0f496_repl_workspace_262333_populator"
  ;;            [0]]
  ;;           ["success"
  ;;            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mb__isolation_0f496_repl_workspace_262333 TO mb_iso_0f496_repl_workspace_262333_populator"
  ;;            [0]]]
  ;;          "running"]},
  ;;        :created_at "2025-08-13T21:17:41.900643Z"}),
  ;;      :collection_id 16,
  ;;      :name "repl workspace",
  ;;      :transforms
  ;;      ({:id 1,
  ;;        :name "core_user_transform",
  ;;        :description nil,
  ;;        :source {:type "query", :query {:database 2, :type "query", :query {:source-table 123}}},
  ;;        :target {:type "table", :name "core_user_transform_table", :schema "public"},
  ;;        :config nil,
  ;;        :created_at "2025-08-13T21:16:15.925838Z"}
  ;;       {:id 2,
  ;;        :name "core_session_transform",
  ;;        :description nil,
  ;;        :source {:type "query", :query {:database 2, :type "query", :query {:source-table 88}}},
  ;;        :target {:type "table", :name "core_session_transform_table", :schema "public"},
  ;;        :config nil,
  ;;        :created_at "2025-08-13T21:16:19.072003Z"}),
  ;;      :plans (),
  ;;      :updated_at #t "2025-08-13T21:17:41.904684Z",
  ;;      :documents (),
  ;;      :id 10,
  ;;      :data_warehouses
  ;;      ({:2
  ;;        {:isolation-type "schema",
  ;;         :schema-name "mb__isolation_0f496_repl_workspace_262333",
  ;;         :populator
  ;;         {:user "mb_iso_0f496_repl_workspace_262333_populator", :password "bfd45256-e178-4239-8c51-37909d2a38e1"}},
  ;;        :created_at "2025-08-13T21:17:41.904595Z"}),
  ;;      :created_at #t "2025-08-13T21:15:59.920962Z",
  ;;      :users ()})

  @(def rw (t2/select-one :model/Workspace :slug "repl_workspace_230326"))

  (add-workspace-entity (:id w) :plans
                        {:name "Test Plan 1"
                         :description "This is a test plan"
                         :content {}})
  (add-workspace-entity (:id w) :plans
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
