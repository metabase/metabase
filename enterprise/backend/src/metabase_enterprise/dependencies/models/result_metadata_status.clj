(ns metabase-enterprise.dependencies.models.result-metadata-status
  (:require
   [java-time.api :as t]
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

(def ^:private batch-size
  "The number of statuses marked per query, below the bind-parameter limits of every app DB."
  1000)

(defn mark-stale!
  "Mark the entities in `type->ids`, `{entity-type ids}`, changed, so the MBQL cards depending on them are re-derived,
  resetting their retry state."
  [type->ids]
  (doseq [[entity-type ids] type->ids
          batch             (partition-all batch-size ids)
          :let              [batch (vec batch)]]
    (dependencies.db/mark-result-metadata-statuses-stale! entity-type batch)
    (let [existing (set (dependencies.db/result-metadata-status-entity-ids entity-type batch))]
      (doseq [entity-id batch
              :when     (not (existing entity-id))]
        (dependencies.db/mark-result-metadata-status-stale! entity-type entity-id)))))

(defn statuses-to-process
  "Up to `batch-size` stale statuses other than those with `excluded-ids` whose upstream entities have no processable
  status, or any of them when none does, which only a cycle causes."
  [batch-size excluded-ids]
  (let [now (t/offset-date-time)]
    (or (not-empty (dependencies.db/ready-result-metadata-statuses batch-size now excluded-ids))
        (dependencies.db/stale-result-metadata-statuses-batch batch-size now excluded-ids))))

(defn clear-stale-if-unchanged!
  "Clear the stale status `status`, unless it was marked again since it was read."
  [{:keys [id updated_at]}]
  (dependencies.db/clear-unchanged-result-metadata-status! id updated_at))

(defn remove-deleted!
  "Delete the statuses of deleted entities."
  []
  (doseq [entity-type entity-types]
    (dependencies.db/delete-deleted-result-metadata-statuses! entity-type)))

(defn has-pending-retries?
  "Whether any stale status is waiting for a retry."
  []
  (dependencies.db/result-metadata-pending-retry-exists?))

(defn record-failure!
  "Record a failed attempt for the stale status `status`, backing off by `delay-minutes` per failure and marking it
  terminal once it failed more than `max-retries` times, unless it was marked again since it was read."
  [{:keys [id updated_at fail_count]} max-retries delay-minutes]
  (let [new-fail-count (inc (or fail_count 0))
        retry-minutes  (* new-fail-count delay-minutes)]
    (dependencies.db/update-unchanged-result-metadata-status!
     id updated_at
     (if (> new-fail-count max-retries)
       {:fail_count new-fail-count :terminal true :next_retry_at nil}
       {:fail_count    new-fail-count
        :next_retry_at (when (pos? retry-minutes)
                         (t/plus (t/offset-date-time) (t/minutes retry-minutes)))}))))
