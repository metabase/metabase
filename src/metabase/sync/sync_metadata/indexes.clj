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

(defn maybe-sync-indexes-for-table!
  "Sync the indexes for `table` if the driver supports storing index info."
  [database table]
  (if (driver/database-supports? (driver.u/database->driver database) :index-info database)
    (sync-util/with-error-handling (format "Error syncing Indexes for %s" (sync-util/name-for-logging table))
      (let [indexes                    (fetch-metadata/index-metadata database table)
            ;; not all indexes are field names, they could be function based index as well
            field-name-indexes         (when (seq indexes)
                                         (t2/select-fn-set :name :model/Field :table_id (:id table) :name [:in indexes]))
            existing-index-field-names (t2/select-fn-set :name :model/Field :table_id (:id table) :database_indexed true)
            [removing adding]          (data/diff existing-index-field-names field-name-indexes)]
        (doseq [field-name removing]
          (log/infof "Unmarking %s.%s as indexed" (:name table) field-name))
        (doseq [field-name adding]
          (log/infof "Marking %s.%s as indexed" (:name table) field-name))
        (if (or (seq adding) (seq removing))
          (do (t2/update! :model/Field {:table_id (:id table)}
                          {:database_indexed (if (seq field-name-indexes)
                                               [:case [:in :name field-name-indexes] true :else false]
                                               false)})
              {:total-indexes   (count field-name-indexes)
               :added-indexes   (count adding)
               :removed-indexes (count removing)})
          empty-stats)))
    empty-stats))

(defn maybe-sync-indexes!
  "Sync the indexes for all tables in `database` if the driver supports storing index info."
  [database]
  (if (driver/database-supports? (driver.u/database->driver database) :index-info database)
    (apply merge-with + empty-stats
           (map #(maybe-sync-indexes-for-table! database %) (sync-util/db->sync-tables database)))
    empty-stats))
