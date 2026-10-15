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

(def ^:private mark-stale-batch-size
  "The number of statuses marked per query, below the bind-parameter limits of every app DB."
  1000)

(defn mark-stale!
  "Mark the entities in `type->ids`, `{entity-type ids}`, changed for the result metadata of the cards depending on
  them to be re-derived, resetting their retry state."
  [type->ids]
  (doseq [[entity-type ids] type->ids
          batch             (partition-all mark-stale-batch-size ids)
          :let              [batch (vec batch)]]
    (dependencies.db/mark-result-metadata-statuses-stale! entity-type batch)
    (let [existing (set (dependencies.db/result-metadata-status-entity-ids entity-type batch))]
      (doseq [entity-id batch
              :when     (not (existing entity-id))]
        (dependencies.db/mark-result-metadata-status-stale! entity-type entity-id)))))

(defn mark-dependents-stale!
  "Mark the dependents in `type->ids`, `{entity-type ids}`, stale without touching the retry state of the ones that
  already are, so a dependent that keeps failing still backs off."
  [type->ids]
  (doseq [[entity-type ids] type->ids
          batch             (partition-all mark-stale-batch-size ids)
          :let              [batch (vec batch)]]
    (dependencies.db/mark-fresh-result-metadata-statuses-stale! entity-type batch)
    (let [existing (set (dependencies.db/result-metadata-status-entity-ids entity-type batch))]
      (when-let [missing (not-empty (into [] (remove existing) batch))]
        (dependencies.db/insert-stale-result-metadata-statuses! entity-type missing)))))

(defn stale-statuses
  "The stale statuses that are not terminal and whose retry time has passed."
  []
  (dependencies.db/stale-result-metadata-statuses (t/offset-date-time)))

(defn statuses-to-process
  "Up to `batch-size` stale statuses whose upstream entities have no processable status, or any of them when none
  does, which only a cycle causes."
  [batch-size]
  (let [now (t/offset-date-time)]
    (or (not-empty (dependencies.db/ready-result-metadata-statuses batch-size now))
        (dependencies.db/stale-result-metadata-statuses-batch batch-size now))))

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
  "Whether any status is waiting for a retry."
  []
  (dependencies.db/result-metadata-pending-retry-exists?))

(defn record-failure!
  "Record a failed attempt for the stale status `status`, backing off by `delay-minutes` per failure and marking it
  terminal after `max-retries` failures."
  [{:keys [entity_type entity_id]} max-retries delay-minutes]
  (dependencies.db/record-result-metadata-status-failure!
   entity_type entity_id
   (fn [existing]
     (let [new-fail-count (inc (:fail_count existing 0))]
       (if (> new-fail-count max-retries)
         {:fail_count new-fail-count
          :terminal true
          :next_retry_at nil}
         (let [retry-minutes (* new-fail-count delay-minutes)]
           {:fail_count new-fail-count
            :next_retry_at (when (pos? retry-minutes)
                             (t/plus (t/offset-date-time) (t/minutes retry-minutes)))}))))))
