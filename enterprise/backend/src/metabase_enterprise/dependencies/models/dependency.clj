(ns metabase-enterprise.dependencies.models.dependency
  (:require
   [clojure.set :as set]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.graph.core :as graph]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def current-dependency-analysis-version
  "Current version of the dependency analysis logic.
  This should be incremented when the dependency analysis logic changes."
  1)

(methodical/defmethod t2/table-name :model/Dependency [_model] :dependency)

(derive :model/Dependency :metabase/model)

(t2/deftransforms :model/Dependency
  {:from_entity_type mi/transform-keyword
   :to_entity_type   mi/transform-keyword})

(defn- upsert-generic-dependency
  "Upsert that the entity specified by `entity-type` and `entity-id` depends on entity specified
  by `target-type` and `target-id`."
  [entity-type entity-id target-type target-id]
  (let [dependency {:from_entity_type entity-type :from_entity_id entity-id
                    :to_entity_type   target-type :to_entity_id   target-id}]
    (try
      (t2/insert! :model/Dependency dependency)
      (catch clojure.lang.ExceptionInfo e
        (let [cause ^SQLException (ex-cause e)]
          (case (when (instance? SQLException cause)
                  (.getSQLState cause))
            ;; 23505 - PostgreSQL/H2 unique constraint violation
            "23505" 0
            ;; 23000 - MySQL integrity constraint violation
            "23000" (if (and (= (mdb/db-type) :mysql)
                             (re-find #"(?i)idx_unique_dependency" (ex-message e)))
                      0
                      (throw e))
            (throw e)))))))

(defn- deps-children [src-type src-id dst-type dst-id key-seq]
  ;; Group all keys with the same type together, so we make O(types) indexed [[t2/select]] calls, not O(n).
  (transduce (map (fn [[entity-type entity-keys]]
                    (let [deps (t2/select :model/Dependency
                                          src-type entity-type
                                          src-id   [:in entity-keys])]
                      (u/group-by (juxt src-type src-id)
                                  (juxt dst-type dst-id)
                                  conj #{}
                                  deps))))
             merge {}
             (u/group-by first second key-seq)))

(defn- key-dependencies
  "Get the dependency entity keys for the entity keys in `entity-keys`, a seq of keys.
  Entity keys are [entity-type, entity-id] pairs. See [[entity-type->model]]."
  [key-seq]
  (deps-children :from_entity_type :from_entity_id :to_entity_type :to_entity_id key-seq))

(defn- key-dependents
  "Get the dependent entity keys for the entity keys in `entity-keys`.
  Entity keys are [entity-type, entity-id] pairs. See [[entity-type->model]]."
  [key-seq]
  (deps-children :to_entity_type :to_entity_id :from_entity_type :from_entity_id key-seq))

(p/deftype+ DependencyGraph [children-fn]
  graph/Graph
  (children-of [_this key-seq]
    (children-fn key-seq)))

(defn graph-dependents []
  (->DependencyGraph key-dependents))

(defn graph-dependencies []
  (->DependencyGraph key-dependencies))

(defn transitive-dependents
  "Given a map of updated entities `{entity-type [{:id 1, ...} ...]}`, return a map of its transitive dependents
  as `{entity-type #{4 5 6}}` - that is, a map from downstream entity type to a set of IDs.

  Uses the provided `graph`, or defaults to the `:model/Dependency` table in AppDB.

  The inputs must be maps containing `:id`; anything without an `:id` is skipped. They could be Toucan entities,
  `MetadataProvider` entities, user input, etc.

  **Excludes** the input entities from the list of dependents!"
  ([updated-entities] (transitive-dependents nil updated-entities))
  ([graph updated-entities]
   (let [graph    (or graph (graph-dependents))
         starters (for [[entity-type updates] updated-entities
                        entity                updates
                        :when (:id entity)]
                    [entity-type (:id entity)])]
     (->> (graph/transitive graph starters) ; This returns a flat list.
          (u/group-by first second conj #{})))))

(defn replace-dependencies
  "Replace the dependencies of the entity of type `entity-type` with id `entity-id` with
  the ones specified in `dependencies-by-type`. "
  [entity-type entity-id dependencies-by-type]
  (let [current-dependencies (t2/select [:model/Dependency :id :to_entity_type :to_entity_id]
                                        :from_entity_type entity-type
                                        :from_entity_id entity-id)
        to-remove (keep (fn [{:keys [id to_entity_type to_entity_id]}]
                          (when-not (get-in dependencies-by-type [to_entity_type to_entity_id])
                            id))
                        current-dependencies)
        current-by-type (-> (group-by :to_entity_type current-dependencies)
                            (update-vals #(into #{} (map :to_entity_id) %)))
        to-add (for [[to-entity-type ids] dependencies-by-type
                     to-entity-id (set/difference ids (current-by-type to-entity-type))]
                 {:from_entity_type entity-type
                  :from_entity_id   entity-id
                  :to_entity_type   to-entity-type
                  :to_entity_id     to-entity-id})]
    (t2/with-transaction [_conn]
      (when (seq to-remove)
        (t2/delete! :model/Dependency :id [:in to-remove]))
      (when (seq to-add)
        (t2/insert! :model/Dependency to-add)))))

;; ## Maintaining the dependency graph
;; The below listens for inserts, updates and deletes of cards, snippets and transforms in order to keep the
;; dependency graph up to date. Transform *runs* are also a trigger, since the transform's output table may be created
;; or changed at that point.

;; ### Cards
(derive ::card-deps :metabase/event)
(derive :event/card-create ::card-deps)
(derive :event/card-update ::card-deps)

(methodical/defmethod events/publish-event! ::card-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (replace-dependencies :card (:id object) (deps.calculation/upstream-deps:card object))
      (when (not= (:dependency_analysis_version object) current-dependency-analysis-version)
        (t2/update! :model/Card (:id object)
                    {:dependency_analysis_version current-dependency-analysis-version})))))

(derive ::card-delete :metabase/event)
(derive :event/card-delete ::card-delete)

(methodical/defmethod events/publish-event! ::card-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :card :from_entity_id (:id object))))

;; ### Snippets
(derive ::snippet-deps :metabase/event)
(derive :event/snippet-create ::snippet-deps)
(derive :event/snippet-update ::snippet-deps)

(methodical/defmethod events/publish-event! ::snippet-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (replace-dependencies :snippet (:id object) (deps.calculation/upstream-deps:snippet object))
      (when (not= (:dependency_analysis_version object) current-dependency-analysis-version)
        (t2/update! :model/NativeQuerySnippet (:id object)
                    {:dependency_analysis_version current-dependency-analysis-version})))))

(derive ::snippet-delete :metabase/event)
(derive :event/snippet-delete ::snippet-delete)

(methodical/defmethod events/publish-event! ::snippet-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :snippet :from_entity_id (:id object))))

;; ### Transforms
(derive ::transform-deps :metabase/event)
(derive :event/create-transform ::transform-deps)
(derive :event/update-transform ::transform-deps)

;; On *saving* a transform, the upstream deps of its query are computed and saved.
(defn- drop-outdated-target-dep! [{:keys [id source target] :as _transform}]
  (let [db-id                (some-> source :query :database)
        downstream-table-ids (t2/select-fn-set :from_entity_id :model/Dependency
                                               :from_entity_type :table
                                               :to_entity_type   :transform
                                               :to_entity_id     id)
        downstream-tables    (when (seq downstream-table-ids)
                               (t2/select :model/Table :id [:in downstream-table-ids]))
        outdated-tables      (remove (fn [table]
                                       (and (= (:schema table) (:schema target))
                                            (= (:name   table) (:name   target))
                                            (or (not db-id)
                                                (= db-id (:db_id table)))))
                                     downstream-tables)
        not-found-table-ids  (remove (into #{} (map :id) downstream-tables)
                                     downstream-table-ids)]
    (when-let [outdated-downstream-table-ids (seq (into (set not-found-table-ids)
                                                        (map :id) outdated-tables))]
      (t2/delete! :model/Dependency
                  :from_entity_type :table
                  :from_entity_id   [:in outdated-downstream-table-ids]
                  :to_entity_type   :transform
                  :to_entity_id     id))))

(methodical/defmethod events/publish-event! ::transform-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (replace-dependencies :transform (:id object) (deps.calculation/upstream-deps:transform object))
      (when (not= (:dependency_analysis_version object) current-dependency-analysis-version)
        (t2/update! :model/Transform (:id object) {:dependency_analysis_version current-dependency-analysis-version}))
      (drop-outdated-target-dep! object))))

(derive ::transform-delete :metabase/event)
(derive :event/delete-transform ::transform-delete)

(methodical/defmethod events/publish-event! ::transform-delete
  [_ {:keys [id]}]
  (when (premium-features/has-feature? :dependencies)
    ;; TODO: (Braden 09/18/2025) Shouldn't we be deleting the downstream deps for dead edges as well as upstream?
    (t2/delete! :model/Dependency :from_entity_type :transform :from_entity_id id)))

;; On *executing* a transform, its (freshly synced) output table is made to depend on the transform.
;; (And if the target has changed, the old table's dep on the transform is dropped.)
;; The upstream deps of the transform are not touched - those change only when the transform is edited.
(derive ::transform-run :metabase/event)
(derive :event/transform-run-complete ::transform-run)

(defn- transform-table-deps! [{:keys [db-id output-schema output-table transform-id] :as _details}]
  (let [;; output-table is a keyword like :my_schema/my_table
        table-name (name output-table)]
    (when-let [table-id (t2/select-one-fn :id :model/Table :db_id db-id :schema output-schema :name table-name)]
      (replace-dependencies :table table-id {:transform #{transform-id}}))))

(methodical/defmethod events/publish-event! ::transform-run
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (transform-table-deps! object)))

(comment
  (set/difference #{3} nil)
  (def card-ids (t2/select-fn-set :id :model/Card))
  (def table-ids (t2/select-fn-set :id :model/Table))
  (replace-dependencies :card 31 {:card (disj card-ids 31) :table table-ids})
  (replace-dependencies :card 31 {:table #{3 4}})
  (replace-dependencies :table 31 {})
  (upsert-generic-dependency :card 31 :table 1)

  (upsert-generic-dependency :table 155 :transform 1)

  (t2/select :model/Dependency :from_entity_type :card      :from_entity_id 125)

  (t2/select :model/Dependency :from_entity_type :card      :from_entity_id 124)
  (t2/select :model/Dependency :from_entity_type :table     :from_entity_id 155)

  (t2/select :model/Dependency :from_entity_type :transform :from_entity_id 2)
  (t2/select :model/Dependency :to_entity_type   :transform :to_entity_id   2)
  (t2/select-one :model/Table :id 175)
  *e

  (t2/select-one :model/Transform :id 1)

  (t2/update! :model/Dependency 49 {:from_entity_id 255})
  (t2/delete! :model/Dependency :to_entity_type   :transform :to_entity_id   1
              :from_entity_type :table :from_entity_id 155)
  (t2/insert! :model/Dependency
              :from_entity_type :table     :from_entity_id 136 ; Existing but wrong table
              :to_entity_type   :transform :to_entity_id   1)

  (u/group-by first second (key-dependents [[:transform 1]]))

  (bfs-nodes key-dependents [[:transform 1]])
  (bfs-entities key-dependents (t2/select :model/Transform 1))
  (transitive-dependents {:snippet [{:id 2}]})
  (transitive-dependents {:transform [{:id 1}]})
  (transitive-dependents {:table [{:id 136}]})
  (transitive-dependents {:card [{:id 124}]}))
