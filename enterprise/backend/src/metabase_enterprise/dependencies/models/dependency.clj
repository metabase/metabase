(ns metabase-enterprise.dependencies.models.dependency
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Dependency [_model] :dependency)

(derive :model/Dependency :metabase/model)

(t2/deftransforms :model/Dependency
  {:from_entity_type mi/transform-keyword
   :to_entity_type   mi/transform-keyword})

(defn- dependencies-of
  "Return references the dependencies of the entity with type `entity-type` and id `entity-id`.
  The type and the id of the entity depended on can be specified by specifying
  non-nil values for `target-type` and `target-id`."
  [entity-type entity-id target-type target-id]
  (let [where-clause (cond-> [:and
                              [:= :from_entity_type (name entity-type)]
                              [:= :from_entity_id   entity-id]]
                       target-type (conj [:= :to_entity_type (name target-type)])
                       target-id   (conj [:= :to_entity_id target-id]))]
    (t2/select :model/Dependency
               {:select [[:to_entity_type :type]
                         [:to_entity_id   :id]]
                :where  where-clause})))

(defn- dependents-of
  "Return references to the dependents of the entity with type `entity-type` and id `entity-id`.
  The type and the id of the dependent entity on can be specified by specifying
  non-nil values for `source-type` and `source-id`."
  [entity-type entity-id source-type source-id]
  (let [where-clause (cond-> [:and
                              [:= :to_entity_type (name entity-type)]
                              [:= :to_entity_id   entity-id]]
                       source-type (conj [:= :from_entity_type (name source-type)])
                       source-id   (conj [:= :from_entity_id   source-id]))]
    (t2/select :model/Dependency
               {:select [[:from_entity_type :type]
                         [:from_entity_id   :id]]
                :where  where-clause})))

(defn- entity-type->model
  [entity-type]
  (case entity-type
    (:card      "card")      :model/Card
    (:table     "table")     :model/Table
    (:transform "transform") :model/Transform
    (:snippet   "snippet")   :model/NativeQuerySnippet))

(defn- entity-ref->model
  [entity-ref]
  (entity-type->model (:type entity-ref)))

(defn- resolve-entities
  [entity-refs]
  (mapcat (fn [[model refs]] (t2/select model :id [:in (map :id refs)]))
          (group-by entity-ref->model entity-refs)))

(defn dependencies
  "Return the dependencies of the entity with type `entity-type` and id `entity-id`.
  Optionally, the type and the id of the entity depended on can be specified."
  ([entity-type entity-id]
   (dependencies entity-type entity-id nil))
  ([entity-type  entity-id target-type]
   (dependencies entity-type entity-id target-type nil))
  ([entity-type entity-id target-type target-id]
   (->> (dependencies-of entity-type  entity-id target-type target-id)
        resolve-entities)))

(defn dependents
  "Return the dependents of the entity with type `entity-type` and id `entity-id`.
  Optionally, the type and the id of the dependent entity can be specified."
  ([entity-type entity-id]
   (dependents entity-type entity-id nil))
  ([entity-type entity-id source-type]
   (dependents entity-type entity-id source-type nil))
  ([entity-type entity-id source-type source-id]
   (->> (dependents-of entity-type  entity-id source-type source-id)
        resolve-entities)))

(defn upsert-dependency
  "Upsert that the entity specified by `entity-type` and `entity-id` depends on entity specified
  by `target-type` and `target-id`."
  [entity-type entity-id target-type target-id]
  (let [dependency (zipmap [:from_entity_type :from_entity_id :to_entity_type :to_entity_id]
                           [entity-type entity-id target-type target-id])]
    (when (some nil? [entity-type entity-id target-type target-id])
      (throw (ex-info "Cannot upsert dependency between unknown entities."
                      dependency)))
    (try
      (t2/insert! :model/Dependency dependency)
      (catch java.sql.SQLException e
        (case (.getSQLState e)
          ;; 23000 - MySQL integrity constraint violation (good enough,
          ;; because we have no checks and we're not inserting NULL values)
          ;; 23505 - PostgreSQL/H2 unique constraint violation
          ("23000" "23505") 0
          (throw e))))))
