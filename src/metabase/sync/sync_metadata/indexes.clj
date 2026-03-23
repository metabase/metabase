(ns metabase.sync.sync-metadata.indexes
  (:require
   [clojure.data :as data]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.persist :as persist]
   [metabase.sync.persist.appdb :as persist.appdb]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.warehouse-schema.models.field :as field]))

(def ^:private empty-stats
  {:total-indexes 0
   :added-indexes 0
   :removed-indexes 0})

(defn- indexes->field-ids
  [table-id indexes reader]
  (when (seq indexes)
    (let [normal-indexes           (->> indexes (filter #(= (:type %) :normal-column-index)) (map :value))
          nested-indexes           (->> indexes (filter #(= (:type %) :nested-column-index)) (map :value))
          normal-indexes-field-ids (when (seq normal-indexes)
                                    (persist/field-ids-for-index-names reader table-id normal-indexes))
          nested-indexes-field-ids (remove nil? (map #(field/nested-field-names->field-id table-id %) nested-indexes))]
      (set (filter some? (concat normal-indexes-field-ids nested-indexes-field-ids))))))

(defn maybe-sync-indexes-for-table!
  "Sync the indexes for `table` if the driver supports storing index info."
  ([database table]
   (maybe-sync-indexes-for-table! database table persist.appdb/reader persist.appdb/writer))
  ([database table reader writer]
   (if (driver.u/supports? (driver.u/database->driver database) :index-info database)
     (sync-util/with-error-handling (format "Error syncing Indexes for %s" (sync-util/name-for-logging table))
       (let [indexes                    (fetch-metadata/index-metadata database table)
             indexed-field-ids          (indexes->field-ids (:id table) indexes reader)
             existing-indexed-field-ids (persist/indexed-field-ids-for-table reader (:id table))
             [removing adding]          (data/diff existing-indexed-field-ids indexed-field-ids)]
         (doseq [field-id removing]
           (log/infof "Unmarking Field %d as indexed" field-id))
         (doseq [field-id adding]
           (log/infof "Marking Field %d as indexed" field-id))
         (if (or (seq adding) (seq removing))
           (do (persist/set-table-indexes! writer (:id table) indexed-field-ids)
               {:total-indexes   (count indexed-field-ids)
                :added-indexes   (count adding)
                :removed-indexes (count removing)})
           empty-stats)))
     empty-stats)))

(def ^:dynamic *update-partition-size*
  "Size of the partition of indexes to update using one `t2/update!` call. Dynamic for testing purposes."
  5000)

(defn- sync-all-indexes!
  [database reader writer]
  (sync-util/with-error-handling "Error syncing Indexes"
    (let [indexes (fetch-metadata/log-if-error
                   "index-metadata"
                    (into [] (driver/describe-indexes (driver.u/database->driver database) database)))
          database-id (:id database)
          indexed-field-ids (persist/field-ids-for-indexes reader database-id indexes)
          existing-indexed-field-ids (persist/indexed-field-ids-for-database reader database-id)
          [removing adding]           (data/diff existing-indexed-field-ids indexed-field-ids)
          removing-count              (count removing)
          adding-count                (count adding)]
      ;; Null database_indexed of fields having NO index.
      (log/infof "Unmarking %d fields from indexed" removing-count)
      (doseq [field-ids (partition-all 100 removing)]
        (log/tracef "Unmarking Fields as indexed: %s" (pr-str field-ids)))
      (doseq [field-ids (partition-all *update-partition-size* removing)]
        (log/infof "Executing batch update of at most %d fields" *update-partition-size*)
        (persist/batch-set-indexed! writer field-ids false))
      ;; Set database_indexed of fields having index.
      (log/infof "Marking %d fields as indexed" adding-count)
      (doseq [field-ids (partition-all 100 adding)]
        (log/tracef "Marking Fields as indexed: %s" (pr-str field-ids)))
      (doseq [field-ids (partition-all *update-partition-size* adding)]
        (log/infof "Executing batch update of at most %d fields" *update-partition-size*)
        (persist/batch-set-indexed! writer field-ids true))
      (if (or (seq adding) (seq removing))
        {:total-indexes   (count indexed-field-ids)
         :added-indexes   adding-count
         :removed-indexes removing-count}
        empty-stats))))

(defn maybe-sync-indexes!
  "Sync the indexes for all tables in `database` if the driver supports storing index info."
  ([database]
   (maybe-sync-indexes! database persist.appdb/reader persist.appdb/writer))
  ([database reader writer]
   (if (driver.u/supports? (driver.u/database->driver database) :index-info database)
     (if (driver.u/supports? (driver.u/database->driver database) :describe-indexes database)
       (sync-all-indexes! database reader writer)
       (transduce (map #(maybe-sync-indexes-for-table! database % reader writer))
                  (partial merge-with +)
                  empty-stats
                  (sync-util/reducible-sync-tables database)))
     empty-stats)))
