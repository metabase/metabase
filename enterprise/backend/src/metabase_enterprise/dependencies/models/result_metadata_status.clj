(ns metabase-enterprise.dependencies.models.result-metadata-status
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ResultMetadataStatus [_model] :result_metadata_status)

(derive :model/ResultMetadataStatus :metabase/model)

(t2/deftransforms :model/ResultMetadataStatus
  {:entity_type mi/transform-keyword})

(def entity-types
  "The entity types whose result columns the result metadata of dependent MBQL cards is derived from."
  #{:card :measure :table})

(def derived-types
  "The entity types whose result columns are derived from those of the entities they depend on: cards, of which the
  MBQL ones are re-derived, and measures, which pass a change on."
  #{:card :measure})

(defn mark-stale!
  "Mark the entities in `type->ids`, `{entity-type ids}`, changed, so the MBQL cards depending on them are re-derived,
  even when their statuses are terminal, one status per statement so this never holds two status locks at once."
  [type->ids]
  (doseq [[entity-type ids] type->ids
          entity-id         ids]
    (when (zero? (dependencies.db/mark-result-metadata-status-stale! entity-type entity-id))
      (dependencies.db/insert-result-metadata-status! entity-type entity-id))))

(defn statuses-to-process
  "Up to `batch-size` stale statuses that are not terminal, the longest stale first."
  [batch-size]
  (dependencies.db/stale-result-metadata-statuses-batch batch-size))

(defn clear-stale-if-unchanged!
  "Clear the stale status `status`, unless it was marked again since it was read."
  [{:keys [id updated_at]}]
  (dependencies.db/clear-unchanged-result-metadata-status! id updated_at))

(defn remove-deleted!
  "Delete the statuses of deleted entities."
  []
  (doseq [entity-type entity-types]
    (dependencies.db/delete-deleted-result-metadata-statuses! entity-type)))

(defn record-failure!
  "Mark the stale status `status` terminal, so it is not processed again until its entity changes again, unless it was
  marked again since it was read."
  [{:keys [id updated_at]}]
  (dependencies.db/set-unchanged-result-metadata-status-terminal! id updated_at))
