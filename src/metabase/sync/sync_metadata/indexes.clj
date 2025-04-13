(ns metabase.sync.sync-metadata.indexes
  (:require
   [clojure.data :as data]
   [metabase.driver :as driver]
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

(defn- all-indexes->field-ids
  [database-id indexes]
  (reduce
   (fn [accum index-batch]
     (let [normal-indexes (map (juxt #(:table-schema % "__null__") :table-name :field-name) index-batch)
           query (t2/reducible-query {:select [[:f.id]]
                                      :from [[(t2/table-name :model/Field) :f]]
                                      :inner-join [[(t2/table-name :model/Table) :t] [:= :f.table_id :t.id]]
                                      :where [:and [:in [:composite [:coalesce :t.schema "__null__"] :t.name :f.name] normal-indexes]
                                              [:= :t.db_id database-id]
                                              [:= :parent_id nil]]})]
       (into accum (keep :id) query)))
   #{}
   ;; break the indexes up in groups of 5000 to avoid max
   ;; parameter limit of 65,535. See #52746 for details.
   (partition-all 5000 indexes)))

(def ^:dynamic *update-partition-size*
  "Size of the partition of indexes to update using one `t2/update!` call. Dynamic for testing purposes."
  5000)

(defn- sync-all-indexes!
  [database]
  (sync-util/with-error-handling "Error syncing Indexes"
    (let [indexes (fetch-metadata/log-if-error
                   "index-metadata"
                    (into [] (driver/describe-indexes (driver.u/database->driver database) database)))
          database-id (:id database)
          indexed-field-ids (all-indexes->field-ids database-id indexes)
          existing-indexed-field-ids (t2/select-pks-set :model/Field
                                                        :table_id [:in {:select [[:t.id]]
                                                                        :from [[(t2/table-name :model/Table) :t]]
                                                                        :where [:= :t.db_id database-id]}]
                                                        :parent_id nil
                                                        :database_indexed true)
          [removing adding]           (data/diff existing-indexed-field-ids indexed-field-ids)
          removing-count              (count removing)
          adding-count                (count adding)]
      ;; Null database_indexed of fields having NO index.
      (log/infof "Unmarking %d fields from indexed" removing-count)
      (doseq [field-ids (partition-all 100 removing)]
        (log/tracef "Unmarking Fields as indexed: %s" (pr-str field-ids)))
      (doseq [field-ids (partition-all *update-partition-size* removing)]
        (log/infof "Executing batch update of at most %d fields" *update-partition-size*)
        (t2/update! :model/Field :parent_id nil :id [:in field-ids] {:database_indexed false}))
      ;; Set database_indexed of fields having index.
      (log/infof "Marking %d fields as indexed" adding-count)
      (doseq [field-ids (partition-all 100 adding)]
        (log/tracef "Marking Fields as indexed: %s" (pr-str field-ids)))
      (doseq [field-ids (partition-all *update-partition-size* adding)]
        (log/infof "Executing batch update of at most %d fields" *update-partition-size*)
        (t2/update! :model/Field :parent_id nil :id [:in field-ids] {:database_indexed true}))
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
