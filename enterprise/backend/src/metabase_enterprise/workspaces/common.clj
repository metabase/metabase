(ns metabase-enterprise.workspaces.common
  (:require
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.workspaces.isolation-manager :as isolation-manager]
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.api.common :as api]
   [metabase.collections.common :as c.common]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.xrays.api.automagic-dashboards :as api.automagic-dashboards]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn create-workspace!
  "Creates a workspace, and returns it"
  [name description]
  (let [containing-coll (c.common/create-collection!
                         {:name name
                          :description description})
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
                        :data_warehouses {}}]
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
    (add-workspace-entity workspace :transforms copied-transform)
    (add-workspace-entity workspace :activity_logs {::type ::linked-transform
                                                    :transform copied-transform})))

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

(defn delete-isolations! [{data-warehouses :data_warehouses :as workspace}]
  (if-let [db-ids (seq (map (comp parse-long name) (keys data-warehouses)))]
    (let [dbs (t2/select [:model/Database :id :engine :details] :id [:in db-ids])]
      (doseq [{:keys [engine details id]} dbs
              :let [isolation-info (get data-warehouses (keyword (str id)))]]
        (log/info "Deleting isolations for workspace" (:id workspace) "for db id:" id engine)
        (let [deletion-info (isolation-manager/delete-isolation engine details (:slug workspace) isolation-info)]
          ;; remove it from the workspace's "data_warehouses":
          (t2/update! :model/Workspace (:id workspace)
                      {:data_warehouses (dissoc data-warehouses (keyword (str id)))})
          (add-workspace-entity workspace :activity_logs {::type ::deleted-isolation
                                                          :isolation deletion-info}))))
    (log/warn "No data warehouses found to delete isolations for workspace" (:id workspace))))

(defn create-xray
  "Create an xray of a model"
  [model-id destination-collection-id]
  (let [db (api.automagic-dashboards/get-automagic-dashboard :model model-id nil)]
   (dashboard/save-transient-dashboard! db destination-collection-id)))

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
  [{:keys [data_warehouses transforms] :as workspace}]
  (when-not (seq transforms)
    (throw (ex-info "Workspace must have at least one transform to create isolation" {:error :no-transforms})))
  (if-not (empty? data_warehouses)
    (let [db-ids (distinct (map source-database transforms))
          databases (t2/select :model/Database :id [:in db-ids])
          isolation-info (into {}
                               (for [{db-id :id :keys [engine details] :as db} databases]
                                 (do
                                   ;; Create isolation for each transform's source database
                                   (log/info "Creating isolation for workspace" (:id workspace) " db id: " db-id)
                                   ;; Create the isolation manager for the transform
                                   [db-id (assoc (isolation-manager/create-isolation engine details (:slug workspace))
                                                 ::db-engine engine)])))
          isolation-info-no-results (update-vals isolation-info #(-> %
                                                                     (dissoc :results)
                                                                     (assoc :type :isolation-info)))]
      ;; TODO make this smarter at inserting stuff in 1 round trip:
      (add-workspace-entity workspace :activity_logs isolation-info)
      (t2/update! :model/Workspace (:id workspace)
                  {:data_warehouses (merge (:data_warehouses workspace) isolation-info-no-results)}))))

;; decision: this is so bespoke to us maybe it goes here now. But perhaps the querying team can help us adjust these
;; things with a proper api in the future
(defn- patch-transform
  "Patch transforms so they point at the new isolation mechanism. Right now, only impelemnted for schema based
  isolations. So clickhouse doesn't yet work. But clickhouse might just work the same because schema and database are
  perhaps the same in the way we compile queries for clickhouse."
  [transform schema-name]
  (assoc-in transform [:target :schema] schema-name))

(defn- run-transforms*
  "Execute transforms. If the isolation manager hasn't run, then the data_warhouses key will be empty and this will
  fail."
  [{:keys [transforms data_warehouses] :as workspace}]

  ;; we should keep engine around, its necessary for setup and teardown anyways. why aren't we keeping it
  (let [hack (into {} (map (juxt :id :engine)) (t2/select :model/Database :id
                                                          [:in (map (comp parse-long name) (keys data_warehouses))]))
        ;; this is not needed. But it's a pointer that datawarehouses is perhaps a misleading name? bad
        ;; terminology. POC doesn't need an answer, but shipping does
        patched (for [t transforms
                      :let [db-id (source-database t)
                            ;; todo: in clickhouse need to get database name
                            schema-name (or (get-in data_warehouses [(keyword (str db-id)) :schema-name])
                                            (throw (ex-info "Missing schema for database" {:db-id db-id
                                                                                           :transform t})))]]
                  (patch-transform t schema-name))]
    (reduce (fn [acc t]
              (let [f (fn [t]
                        (try {:status :success
                              :response (transforms.execute/run-mbql-transform! (assoc t :id (- (rand-int 50000)))
                                                                                {:run-method :workspace})}
                             (catch Exception e
                               (log/error "Error running transform" {:transform t
                                                                     :workspace (select-keys workspace [:id :slug])})
                               {:status :error
                                :message (ex-message e)
                                :exdata (ex-data e)
                                :transform t})))]
                (conj acc (f t))))
            []
            patched)))

(comment
  (t2/select-one :model/Workspace :id 6))

(defn run-transforms
  "Executes transforms in workspace. Will throw an error if there are no transforms or if the data_warehouses is empty,
  which likely means that you ahve not created the isolation things."
  [{:keys [data_warehouses transforms] :as workspace}]
  (when (empty? data_warehouses)
    (throw (ex-info "Data warehouses are not prepared. Please run the isolation manager." {:workspace-id (:id workspace)})))
  (when (empty? transforms)
    (throw (ex-info "Can't run transforms if there aren't any" {})))
  ;; don't loev this api, but it's 4:58 on demo day and it's good for now
  (let [transform-activity (run-transforms* workspace)]
    ;; todo: assoc some type here?
    (add-workspace-entites workspace :activity_logs transform-activity)))

(defn- create-models*
  [{:keys [transforms data_warehouses collection_id] :as workspace}]
  (let [hack (into {} (map (juxt :id :engine)) (t2/select :model/Database :id
                                                          [:in (map (comp parse-long name) (keys data_warehouses))]))
        ;; this is not needed. But it's a pointer that datawarehouses is perhaps a misleading name? bad
        ;; terminology. POC doesn't need an answer, but shipping does
        ;; maybe: db->isolation-info
        transform-info (:data_warehouses workspace)
        patched (for [t transforms
                      :let [db-id (source-database t)
                            ;; todo: in clickhouse need to get database name
                            schema-name (or (get-in transform-info [(keyword (str db-id)) :schema-name])
                                            (throw (ex-info "Missing schema for database" {:db-id db-id
                                                                                           :transform t})))]]
                  (patch-transform t schema-name))]
    (reduce (fn [acc t]
              (let [f (fn [t]
                        (let [card {:name (format "Model for %s" (:name t))
                                    :description (format "model: %s" (:description t))
                                    :collection_id collection_id
                                    :card_schema 22 ;;??
                                    :database_id (source-database t)
                                    :creator_id api/*current-user-id*
                                    :query_type :native
                                    :type :model
                                    :dataset_query {:database (source-database t)
                                                    :type :native,
                                                    :native {:template-tags {},
                                                             ;; this needs to be formatted correctly for different dbs
                                                             :query (format "select * from %s.%s"
                                                                            (-> t :target :schema)
                                                                            (-> t :target :name))}}
                                    :display :table
                                    :visualization_settings {}}]
                          (try {:status :success
                                :step :create-model
                                :transform t
                                :response (t2/insert! :model/Card card)}
                               (catch Exception e
                                 (log/error "Error saving model" {:transform t
                                                                  :workspace (select-keys workspace [:id :slug])
                                                                  :card card})
                                 {:status :error
                                  :message (ex-message e)
                                  :exdata (ex-data e)
                                  :transform t
                                  :card card}))))]
                (conj acc (f t))))
            []
            patched)))

(defn create-models
  "Creates models from the transforms in a  workspace. Will throw an error if there are no transforms or if the data_warehouses is empty,
  which likely means that you ahve not created the isolation things."
  [{:keys [data_warehouses transforms] :as workspace}]
  (when (empty? data_warehouses)
    (throw (ex-info "Data warehouses are not prepared. Please run the isolation manager." {:workspace-id (:id workspace)})))
  (when (empty? transforms)
    (throw (ex-info "Can't run transforms if there aren't any" {})))
  ;; don't loev this api, but it's 4:58 on demo day and it's good for now
  (let [model-activity (create-models* workspace)]
    ;; todo: assoc some type here?
    (add-workspace-entites workspace :activity_logs {::type ::create-models
                                                     :model-activity model-activity})))

(comment

  (do (require '[metabase.test :as mt])
      ;; will id alone work here? ^
      ;; current user is used to generate the api key
      (def w
        (binding [api/*current-user-id* (mt/user->id :crowberto)
                  api/*current-user-permissions-set* (atom #{"/"})]
          (create-workspace! "repl workspacex" nil))))

  (-> [:blank-workspace (t2/select-one :model/Workspace :slug (:slug w))]
      (doto tap>))

  (link-transform! (:id w) 1)
  (link-transform! (:id w) 2)

  (-> [:two-linked-transforms (t2/select-one :model/Workspace :slug (:slug w))]
      (doto tap>))

  (create-isolations! (t2/select-one :model/Workspace :slug (:slug w)))
  (-> [:isolation-created
       (t2/select-one :model/Workspace :slug (:slug w))]
      (doto tap>))

  (delete-isolations! (t2/select-one :model/Workspace :slug (:slug w)))
  (-> [:isolation-deleted
       (t2/select-one :model/Workspace :slug (:slug w))]
      (doto tap>))

  (create-isolations! (t2/select-one :model/Workspace :slug (:slug w)))
  (-> [:isolation-recreated
       (t2/select-one :model/Workspace :slug (:slug w))]
      (doto tap>))

  (delete-isolations! (t2/select-one :model/Workspace :slug (:slug w)))
  (-> [:isolation-redeleted
       (t2/select-one :model/Workspace :slug (:slug w))]
      (doto tap>))

  (create-isolations! (t2/select-one :model/Workspace :slug (:slug w))))
