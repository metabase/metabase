(ns metabase.sync.sync-metadata.indexes
  (:require
   [clojure.data :as data]
   [metabase.driver.util :as driver.u]
   [metabase.models.field :as field]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private empty-stats
  {:total-indexes 0
   :added-indexes 0
   :removed-indexes 0})

(defn- indexes->field-ids
  [table-id indexes]
  (when (seq indexes)
    (let [normal-indexes           (->> indexes (filter #(= (:type %) :normal-column-index)) (map :value))
          nested-indexes           (->> indexes (filter #(= (:type %) :nested-column-index)) (map :value))
          normal-indexes-field-ids (when (seq normal-indexes)
                                     (t2/select-pks-vec :model/Field :name [:in normal-indexes] :table_id table-id :parent_id nil))
          nested-indexes-field-ids (remove nil? (map #(field/nested-field-names->field-id table-id %) nested-indexes))]
      (set (filter some? (concat normal-indexes-field-ids nested-indexes-field-ids))))))

(defn maybe-sync-indexes-for-table!
  "Sync the indexes for `table` if the driver supports storing index info."
  [database table]
  (if (driver.u/supports? (driver.u/database->driver database) :index-info database)
    (sync-util/with-error-handling (format "Error syncing Indexes for %s" (sync-util/name-for-logging table))
      (let [indexes                    (fetch-metadata/index-metadata database table)
            indexed-field-ids          (indexes->field-ids (:id table) indexes)
            existing-indexed-field-ids (t2/select-pks-set :model/Field :table_id (:id table) :database_indexed true)
            [removing adding]          (data/diff existing-indexed-field-ids indexed-field-ids)]
        (doseq [field-id removing]
          (log/infof "Unmarking Field %d as indexed" field-id))
        (doseq [field-id adding]
          (log/infof "Marking Field %d as indexed" field-id))
        (if (or (seq adding) (seq removing))
          (do (t2/update! :model/Field {:table_id (:id table)}
                          {:database_indexed (if (seq indexed-field-ids)
                                               [:case [:in :id indexed-field-ids] true :else false]
                                               false)})
              {:total-indexes   (count indexed-field-ids)
               :added-indexes   (count adding)
               :removed-indexes (count removing)})
          empty-stats)))
    empty-stats))

(defn maybe-sync-indexes!
  "Sync the indexes for all tables in `database` if the driver supports storing index info."
  [database]
  (if (driver.u/supports? (driver.u/database->driver database) :index-info database)
    (transduce (map #(maybe-sync-indexes-for-table! database %))
               (partial merge-with +)
               empty-stats
               (sync-util/reducible-sync-tables database))
    empty-stats))
