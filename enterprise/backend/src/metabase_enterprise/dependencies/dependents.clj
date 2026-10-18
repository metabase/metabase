(ns metabase-enterprise.dependencies.dependents
  "The step the result metadata job and the analysis finding job share: processing the dependents of the entities
  whose version changed since a status model recorded one, then recording it."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]))

(defn process-changed-dependents!
  "Call `process!` with the deleted entities of `entity-types` that still have a `status-model` row, as
  `{entity-type ids}`, and the nodes `[[entity-type entity-id]]` of up to `batch-size` entities whose version
  changed, then delete the former rows and record the latter versions, returning how many entities it took."
  [status-model entity-types batch-size process!]
  (let [deleted (into {}
                      (keep (fn [entity-type]
                              (when-let [ids (not-empty (dependencies.db/deleted-status-entity-ids
                                                         status-model entity-type batch-size))]
                                [entity-type ids])))
                      entity-types)
        changed (into []
                      (comp (mapcat (fn [entity-type]
                                      (map #(assoc % :entity_type entity-type)
                                           (dependencies.db/entities-with-changed-version
                                            status-model entity-type batch-size))))
                            (take batch-size))
                      entity-types)]
    (process! deleted (map (juxt :entity_type :id) changed))
    (doseq [[entity-type ids] deleted]
      (dependencies.db/delete-statuses! status-model entity-type ids))
    (doseq [{:keys [entity_type id status_id status_updated_at version_updated_at version_count]} changed]
      (dependencies.db/record-status-version! status-model entity_type id
                                              status_id status_updated_at version_updated_at version_count))
    (+ (count changed) (reduce + 0 (map count (vals deleted))))))
