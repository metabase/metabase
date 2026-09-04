(ns metabase.sync.sync-metadata.indexes
  (:require
   [clojure.data :as data]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.db :as sync.db]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.warehouse-schema.models.field :as field]))

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
                                     (sync.db/top-level-field-ids-by-name table-id normal-indexes))
          nested-indexes-field-ids (remove nil? (map #(field/nested-field-names->field-id table-id %) nested-indexes))]
      (set (filter some? (concat normal-indexes-field-ids nested-indexes-field-ids))))))

(defn maybe-sync-indexes-for-table!
  "Sync the indexes for `table` if the driver supports storing index info."
  [database table]
  (if (driver.u/supports? (driver.u/database->driver database) :index-info database)
    (sync-util/with-error-handling (format "Error syncing Indexes for %s" (sync-util/name-for-logging table))
      (let [indexes                    (fetch-metadata/index-metadata database table)
            indexed-field-ids          (indexes->field-ids (:id table) indexes)
            existing-indexed-field-ids (sync.db/indexed-field-ids-for-table (:id table))
            [removing adding]          (data/diff existing-indexed-field-ids indexed-field-ids)]
        (doseq [field-id removing]
          (log/infof "Unmarking Field %d as indexed" field-id))
        (doseq [field-id adding]
          (log/infof "Marking Field %d as indexed" field-id))
        (if (or (seq adding) (seq removing))
          (do (sync.db/set-table-fields-indexed! (:id table) indexed-field-ids)
              {:total-indexes   (count indexed-field-ids)
               :added-indexes   (count adding)
               :removed-indexes (count removing)})
          empty-stats)))
    empty-stats))

(defn- all-indexes->field-ids
  "Reduce the (reducible) whole-database `indexes` metadata to the set of indexed Field ids. Streams via a
  `partition-all` transducer so only one batch of index metadata is held in memory at a time, not every index in the
  database at once. Indexes are batched in groups of 5000 to stay under the 65,535 SQL parameter limit (see #52746)."
  [database-id indexes]
  (transduce
   (partition-all 5000)
   (completing
    (fn [accum index-batch]
      (let [normal-indexes (map (juxt #(:table-schema % "__null__") :table-name :field-name) index-batch)
            query (sync.db/top-level-field-ids-by-schema-table-and-name-reducible database-id normal-indexes)]
        (into accum (keep :id) query))))
   #{}
   indexes))

(def ^:dynamic *update-partition-size*
  "Size of the partition of indexes to update using one `t2/update!` call. Dynamic for testing purposes."
  5000)

(defn- sync-all-indexes!
  "Mark Fields in `database` as `database_indexed` based on the indexes reported by the driver. `describe-indexes` is a
  *reducible* over every index in the database; it is reduced straight through [[all-indexes->field-ids]] (never
  `(into [] ...)`-ed) so a database with a huge or churning set of tables doesn't materialize every index at once and
  OOM."
  [database]
  (sync-util/with-error-handling "Error syncing Indexes"
    (let [indexes (fetch-metadata/log-if-error
                   "index-metadata"
                    (driver/describe-indexes (driver.u/database->driver database) database))
          database-id (:id database)
          indexed-field-ids (all-indexes->field-ids database-id indexes)
          existing-indexed-field-ids (sync.db/indexed-top-level-field-ids-for-database database-id)
          [removing adding]           (data/diff existing-indexed-field-ids indexed-field-ids)
          removing-count              (count removing)
          adding-count                (count adding)]
      ;; Null database_indexed of fields having NO index.
      (log/infof "Unmarking %d fields from indexed" removing-count)
      (doseq [field-ids (partition-all 100 removing)]
        (log/tracef "Unmarking Fields as indexed: %s" (pr-str field-ids)))
      (doseq [field-ids (partition-all *update-partition-size* removing)]
        (log/infof "Executing batch update of at most %d fields" *update-partition-size*)
        (sync.db/set-top-level-fields-indexed! field-ids false))
      ;; Set database_indexed of fields having index.
      (log/infof "Marking %d fields as indexed" adding-count)
      (doseq [field-ids (partition-all 100 adding)]
        (log/tracef "Marking Fields as indexed: %s" (pr-str field-ids)))
      (doseq [field-ids (partition-all *update-partition-size* adding)]
        (log/infof "Executing batch update of at most %d fields" *update-partition-size*)
        (sync.db/set-top-level-fields-indexed! field-ids true))
      (if (or (seq adding) (seq removing))
        {:total-indexes   (count indexed-field-ids)
         :added-indexes   adding-count
         :removed-indexes removing-count}
        empty-stats))))

(defn maybe-sync-indexes!
  "Sync the indexes for all tables in `database` if the driver supports storing index info."
  [database]
  (if (driver.u/supports? (driver.u/database->driver database) :index-info database)
    (if (driver.u/supports? (driver.u/database->driver database) :describe-indexes database)
      (sync-all-indexes! database)
      (transduce (map #(maybe-sync-indexes-for-table! database %))
                 (partial merge-with +)
                 empty-stats
                 (sync-util/reducible-sync-tables database)))
    empty-stats))
