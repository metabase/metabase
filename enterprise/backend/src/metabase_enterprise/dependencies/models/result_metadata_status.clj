(ns metabase-enterprise.dependencies.models.result-metadata-status
  "The ResultMetadataStatus model: one status per MBQL card, marked stale by the writes its result metadata reads."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ResultMetadataStatus [_model] :result_metadata_status)

(derive :model/ResultMetadataStatus :metabase/model)

(t2/deftransforms :model/ResultMetadataStatus
  {:entity_type mi/transform-keyword})

(def current-result-metadata-version
  "Current version of the result metadata logic. Increment it when the logic changes, so the job processes every
  entity again.

  Version history:
  - 1: Initial version"
  1)

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn take-pending-result-metadata-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` MBQL cards Metabase did not create itself without a ResultMetadataStatus, or whose status counts a
  write or records a version of the logic below `current-version`, and whose dependencies the dependency logic of
  `dependency-version` computed, outdated ones last, with the `stale` count the job clears afterwards."
  [batch-size         :- ms/PositiveInt
   current-version    :- ms/PositiveInt
   dependency-version :- ms/PositiveInt]
  (dependencies.db/take-pending-result-metadata-statuses! batch-size current-version dependency-version))

(mu/defn mark-result-metadata-statuses-stale!
  "Mark the ResultMetadataStatuses of the entities `type->ids` stale, so the result metadata job re-derives them."
  [type->ids :- ::dependencies.schema/type->ids]
  (dependencies.db/mark-result-metadata-statuses-stale! type->ids))

(mu/defn mark-dependents-result-metadata-statuses-stale!
  "Mark the ResultMetadataStatuses of the entities directly depending on the entities `entity-type` `entity-ids` stale."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:set ms/PositiveInt]]
  (dependencies.db/mark-dependents-result-metadata-statuses-stale! entity-type entity-ids))

(mu/defn record-result-metadata-failure! :- :boolean
  "Record that the result metadata job failed to re-derive the Card with `card-id`, giving up on it until a write
  changes it once it failed `max-failures` times in a row, returning whether it gave up."
  [card-id      :- ::lib.schema.id/card
   max-failures :- ms/PositiveInt]
  (dependencies.db/record-result-metadata-failure! card-id max-failures))

(mu/defn clear-result-metadata-statuses!
  "Record that the result metadata job re-derived the Cards whose ids are the keys of `id->stale` with the logic of
  `current-version`, clearing each `stale` count unless a write raised it."
  [id->stale       :- [:map-of ::lib.schema.id/card ms/IntGreaterThanOrEqualToZero]
   current-version :- ms/PositiveInt]
  (dependencies.db/clear-result-metadata-statuses! id->stale current-version))

(mu/defn clear-result-metadata-status! :- :boolean
  "Record that the result metadata job re-derived the Card with `card-id` with the logic of `current-version`, clearing
  its count of `stale` writes unless a write raised it, returning whether it cleared it."
  [card-id         :- ::lib.schema.id/card
   stale           :- ms/IntGreaterThanOrEqualToZero
   current-version :- ms/PositiveInt]
  (dependencies.db/clear-result-metadata-status! card-id stale current-version))

(mu/defn delete-result-metadata-statuses!
  "Delete the ResultMetadataStatuses of the Cards with `card-ids`, returning the number deleted."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (dependencies.db/delete-result-metadata-statuses! card-ids))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ResultMetadataStatus [_model]
  {:skip? true})
