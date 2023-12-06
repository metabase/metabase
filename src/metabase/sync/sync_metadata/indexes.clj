(ns metabase.sync.sync-metadata.indexes
  (:require
   [clojure.data :as data]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn maybe-sync-indexes-for-table!
  "Sync the indexes for `table` if the driver supports indexing."
  [database table]
  (when (driver/database-supports? (driver.u/database->driver database) :indexing database)
    (sync-util/with-error-handling (format "Error syncing Indexes for %s" (sync-util/name-for-logging table))
      (let [indexes-field-name (fetch-metadata/index-metadata database table)
            existing-indexed   (t2/select-fn-set :name :model/Field :table_id (:id table) :database_indexed true)
            [adding removing]  (data/diff existing-indexed indexes-field-name)]
        (doseq [field-name removing]
          (log/infof "Unmarking %s.%s as indexed" (:name table) field-name))
        (doseq [field-name adding]
          (log/infof "Marking %s.%s as indexed" (:name table) field-name))
        (if (or (seq adding) (seq removing))
          (do (t2/update! :model/Field {:table_id (:id table)}
                          {:database_indexed (if (seq indexes-field-name)
                                               [:case [:in :name indexes-field-name] true :else false]
                                               false)})
              (+ (count adding) (count removing)))
          0)))))

(defn maybe-sync-indexes!
  "Sync the indexes for all tables in `database` if the kriver supports indexing."
  [database]
  (let [tables (sync-util/db->sync-tables database)]
    (log/infof "Syncing indexes for %s tables" (count tables))
    (reduce + (map #(maybe-sync-indexes-for-table! database %) tables))))
