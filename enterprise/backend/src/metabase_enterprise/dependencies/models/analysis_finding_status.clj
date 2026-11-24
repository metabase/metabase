(ns metabase-enterprise.dependencies.models.analysis-finding-status
  "The AnalysisFindingStatus model: one status per analyzable entity, marked stale by the writes the analysis reads."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFindingStatus [_model] :analysis_finding_status)

(derive :model/AnalysisFindingStatus :metabase/model)

(t2/deftransforms :model/AnalysisFindingStatus
  {:entity_type mi/transform-keyword})

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn take-pending-analysis-finding-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` entities of the type `entity-type` without an AnalysisFindingStatus, or whose status counts a
  write or records an analysis below `current-version`, and whose dependencies the analysis of `dependency-version`
  computed, outdated ones last, with the `stale` count the job clears afterwards."
  [entity-type        :- ::deps.dependency-types/dependency-types
   batch-size         :- ms/PositiveInt
   current-version    :- ms/PositiveInt
   dependency-version :- ms/PositiveInt]
  (dependencies.db/take-pending-analysis-finding-statuses! entity-type batch-size current-version dependency-version))

(mu/defn mark-analysis-finding-statuses-stale!
  "Mark the AnalysisFindingStatuses of the entities `type->ids` stale, so the analysis job analyzes them again."
  [type->ids :- ::dependencies.schema/type->ids]
  (dependencies.db/mark-analysis-finding-statuses-stale! type->ids))

(mu/defn mark-dependents-analysis-finding-statuses-stale!
  "Mark the AnalysisFindingStatuses of the entities directly depending on the entities `entity-type` `entity-ids`
  stale."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:set ms/PositiveInt]]
  (dependencies.db/mark-dependents-analysis-finding-statuses-stale! entity-type entity-ids))

(mu/defn record-analysis-finding-failure! :- :boolean
  "Record that the analysis job failed to analyze the entity `entity-type` `entity-id`, giving up on it until a write changes it once it failed
  `max-failures` times in a row, returning whether it gave up."
  [entity-type  :- ::dependencies.schema/entity-type
   entity-id    :- ms/PositiveInt
   max-failures :- ms/PositiveInt]
  (dependencies.db/record-analysis-finding-failure! entity-type entity-id max-failures))

(mu/defn clear-analysis-finding-status! :- :boolean
  "Record that the analysis job analyzed the entity `entity-type` `entity-id` with the analysis of `current-version`,
  clearing its count of `stale` writes unless a write raised it, returning whether it cleared it."
  [entity-type     :- ::dependencies.schema/entity-type
   entity-id       :- ms/PositiveInt
   stale           :- ms/IntGreaterThanOrEqualToZero
   current-version :- ms/PositiveInt]
  (dependencies.db/clear-analysis-finding-status! entity-type entity-id stale current-version))

(mu/defn delete-analysis-finding-statuses!
  "Delete the AnalysisFindingStatuses of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (dependencies.db/delete-analysis-finding-statuses! entity-type entity-ids))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/AnalysisFindingStatus [_model]
  {:skip? true})
