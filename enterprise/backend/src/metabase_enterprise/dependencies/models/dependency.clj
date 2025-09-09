(ns metabase-enterprise.dependencies.models.dependency
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLException)))

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

(defn upsert-generic-dependency
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

(defn- entity-type
  [instance]
  (case (t2/model instance)
    :model/Card               :card
    :model/Table              :table
    :model/Transform          :transform
    :model/NativeQuerySnippet :snippet))

(defn upsert-dependency
  "Upser that `dependent-instance` depends on `depended-on-instance`."
  [dependent-instance depended-on-instance]
  (let [dependent-type (entity-type dependent-instance)
        depended-on-type (entity-type depended-on-instance)]
    (upsert-generic-dependency dependent-type (:id dependent-instance)
                               depended-on-type (:id depended-on-instance))))
