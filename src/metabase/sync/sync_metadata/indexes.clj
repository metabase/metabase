(ns metabase.sync.sync-metadata.indexes
  (:require
   [clojure.data :as data]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private empty-stats
  {:total-indexes 0
   :added-indexes 0
   :removed-indexes 0})

(defn- nested-field-names->field-id
  [table-id field-names]
  (loop [field-names field-names
          field-id    nil]
    (if (seq field-names)
      (let [field-name (first field-names)
            field-id   (t2/select-one-pk :model/Field :name field-name :parent_id field-id :table_id table-id)]
        (if field-id
          (recur (rest field-names) field-id)
          nil))
      field-id)))

(defn- indexes->field-id
  [table-id indexes]
  (when (seq indexes)
    (let [normal-indexes           (filter string? indexes)
          nested-indexes           (remove string? indexes)
          normal-indexes-field-ids (when (seq normal-indexes) (t2/select-pks-vec :model/Field :name [:in normal-indexes] :table_id table-id))
          nested-indexes-field-ids (remove nil? (map #(nested-field-names->field-id table-id %) nested-indexes))]
      (set (concat normal-indexes-field-ids nested-indexes-field-ids)))))

(defn maybe-sync-indexes-for-table!
  "Sync the indexes for `table` if the driver supports indexing."
  [database table]
  (if (driver/database-supports? (driver.u/database->driver database) :index-info database)
    (sync-util/with-error-handling (format "Error syncing Indexes for %s" (sync-util/name-for-logging table))
      (let [indexes                    (fetch-metadata/index-metadata database table)
            ;; not all indexes are field names, they could be function based index as well
            indexed-field-ids          (indexes->field-id (:id table) indexes)
            existing-index-field-ids   (t2/select-pks-vec :model/Field :table_id (:id table) :database_indexed true)
            [removing adding]          (data/diff indexed-field-ids existing-index-field-ids)]
        #_(doseq [field-name removing]
            (log/infof "Unmarking %s.%s as indexed" (:name table) field-name))
        #_(doseq [field-name adding]
            (log/infof "Marking %s.%s as indexed" (:name table) field-name))
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
  "Sync the indexes for all tables in `database` if the driver supports indexing."
  [database]
  (if (driver/database-supports? (driver.u/database->driver database) :index-info database)
    (apply merge-with + empty-stats
           (map #(maybe-sync-indexes-for-table! database %) (sync-util/db->sync-tables database)))
    empty-stats))
