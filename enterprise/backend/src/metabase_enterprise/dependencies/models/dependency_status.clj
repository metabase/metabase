(ns metabase-enterprise.dependencies.models.dependency-status
  (:require
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DependencyStatus [_model] :dependency_status)

(derive :model/DependencyStatus :metabase/model)

(t2/deftransforms :model/DependencyStatus
  {:entity_type mi/transform-keyword})

(mu/defn has-pending-entities? :- :boolean
  "Returns true if there are any entities whose dependencies are stale, not computed yet or computed by an older
  analysis, or deleted entities whose status the dependency job has yet to clean up."
  []
  (boolean
   (some (fn [entity-type]
           (or (dependencies.db/dependency-pending?
                entity-type models.dependency/current-dependency-analysis-version)
               (seq (dependencies.db/dependency-deleted-entity-ids entity-type 1))))
         (deps.calculation/computed-types))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn take-pending-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` entities of `entity-type` whose dependencies a write changed, are not computed yet, or were
  computed by an older analysis, those last, with the `stale` count the job clears afterwards."
  [entity-type :- ::deps.dependency-types/dependency-types
   batch-size  :- ms/PositiveInt]
  (dependencies.db/take-pending-dependency-statuses!
   entity-type batch-size models.dependency/current-dependency-analysis-version))

(mu/defn clear-status! :- :boolean
  "Record that the dependency job computed the dependencies of the entity `entity-type` `entity-id`, clearing its
  `stale` count unless a write raised it."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt
   stale       :- ms/IntGreaterThanOrEqualToZero]
  (dependencies.db/clear-dependency-status!
   entity-type entity-id stale models.dependency/current-dependency-analysis-version))

(mu/defn clear-statuses!
  "Record that the dependency job computed the dependencies of the entities `entity-type` whose ids are the keys of
  `id->stale`, clearing each `stale` count unless a write raised it."
  [entity-type :- ::deps.dependency-types/dependency-types
   id->stale   :- [:map-of ms/PositiveInt ms/IntGreaterThanOrEqualToZero]]
  (dependencies.db/clear-dependency-statuses! entity-type id->stale models.dependency/current-dependency-analysis-version))

(mu/defn mark-dependency-statuses-stale!
  "Mark the DependencyStatuses of the entities `type->ids` stale, so the dependency job computes their dependencies
  again."
  [type->ids :- ::dependencies.schema/type->ids]
  (dependencies.db/mark-dependency-statuses-stale! type->ids))

(mu/defn mark-data-app-dependency-statuses-stale!
  "Mark the DependencyStatuses of the DataApps whose resource collection is one of the Collections with
  `collection-ids` stale, in one UPDATE for each 1,000 of them."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (dependencies.db/mark-data-app-dependency-statuses-stale! collection-ids))

(mu/defn delete-dependency-statuses!
  "Delete the DependencyStatuses of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (dependencies.db/delete-dependency-statuses! entity-type entity-ids))

(mu/defn record-dependency-failure! :- :boolean
  "Record that the dependency job failed to compute the dependencies of the entity `entity-type` `entity-id`, giving up on it until a write changes it once it failed
  `max-failures` times in a row, returning whether it gave up."
  [entity-type  :- ::dependencies.schema/entity-type
   entity-id    :- ms/PositiveInt
   max-failures :- ms/PositiveInt]
  (dependencies.db/record-dependency-failure! entity-type entity-id max-failures))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DependencyStatus [_model]
  {:skip? true})
