(ns metabase.sync.field-values
  "Logic for updating FieldValues for fields in a database."
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.interface :as i]
   [metabase.sync.settings :as sync.settings]
   [metabase.sync.util :as sync-util]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.field-values.distinct-batch :as distinct-batch]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(mu/defn- clear-field-values-for-field!
  [field :- i/FieldInstance]
  (when (t2/exists? :model/FieldValues :field_id (u/the-id field))
    (log/debug (format "Based on cardinality and/or type information, %s should no longer have field values.\n"
                       (sync-util/name-for-logging field))
               "Deleting FieldValues...")
    (field-values/clear-field-values-for-field! field)
    ::field-values/fv-deleted))

(defn- result->delta [result]
  (cond
    (instance? Exception result)        {:errors 1}
    (= ::field-values/fv-created result) {:created 1}
    (= ::field-values/fv-updated result) {:updated 1}
    (= ::field-values/fv-deleted result) {:deleted 1}))

(defn- table->fields-to-scan
  "Up to `limit` active, normal-visibility Fields of `table`, ordered by id so the selection is stable across syncs.
  Bounding the count keeps wide tables (e.g. document databases with huge/dynamic schemas) from loading every Field
  into memory and issuing a warehouse request per field."
  [table limit]
  (t2/select :model/Field
             :table_id (u/the-id table), :active true, :visibility_type "normal"
             {:order-by [[:id :asc]] :limit limit}))

(defn- warn-too-many-fields!
  "Log that `table` has more fields to scan for FieldValues than scan-max-fields-per-table (`limit`), so only the first
  `limit` are scanned and the rest skipped -- scanning that many Fields would load them all into memory and (on non-SQL
  drivers like Mongo) issue a warehouse request per field."
  [table limit]
  (log/warnf (str "Table %s has more than scan-max-fields-per-table (%d) fields to scan for field values; scanning the "
                  "first %d and skipping the rest. Raise MB_SCAN_MAX_FIELDS_PER_TABLE to scan more.")
             (sync-util/name-for-logging table) limit limit))

(defn- can-batch-distinct?
  "Can this `table`'s database support the UNION ALL distinct-batch query? Requires:

  - A SQL-derived driver (so HoneySQL compilation works).
  - The `:nested-queries` feature (each UNION arm is wrapped as a subquery in `FROM`).
  - The table does not require a partition filter. Partitioned BigQuery tables fail without a
    `WHERE` on the partition column; `metadata-from-qp/table-query` (used by the per-field path)
    injects one via [[metabase.warehouse-schema.metadata-queries/add-required-filters-if-needed]],
    but `run-distinct-batch` runs as a native query that bypasses that middleware.

  Tables that fail any check fall back to the per-field path."
  [table]
  (let [database (t2/select-one :model/Database :id (:db_id table))
        engine   (:engine database)]
    (and (isa? driver/hierarchy engine :sql)
         (driver.u/supports? engine :nested-queries database)
         (not (:database_require_filter table)))))

(def ^:private empty-counts
  "Initial counter map for a sync run.
  - `:probed`  fields we attempted to fetch distinct values for (active list-eligible fields)
  - `:queries` warehouse queries actually issued (1 per UNION batch on SQL, 1 per field on non-SQL)
  - `:created`/`:updated`/`:deleted`/`:errors` per-field outcomes (`::fv-skipped` is not counted)"
  {:errors 0, :created 0, :updated 0, :deleted 0, :probed 0, :queries 0})

(defn- fetch-distinct-for-table
  "Run all UNION batches for `fields` from `table`. Returns
   `{:results {field-id -> {:values [...]}}, :queries <int>, :failed-fields #{field-id ...}}`.

   Per-batch failures are caught via `sync-util/with-error-handling` — recoverable errors
   contribute the batch's field-ids to `:failed-fields` and the loop continues; non-recoverable
   errors propagate out and abort the sync."
  [table fields]
  (reduce (fn [acc batch]
            (let [batch-result (sync-util/with-error-handling
                                (format "Error fetching union distinct values for %s"
                                        (sync-util/name-for-logging table))
                                 (distinct-batch/run-distinct-batch table batch))
                  acc'         (update acc :queries inc)]
              (if (instance? Throwable batch-result)
                (update acc' :failed-fields into (map :id batch))
                (update acc' :results into batch-result))))
          {:results {} :queries 0 :failed-fields #{}}
          (partition-all distinct-batch/*batch-size* fields)))

(defn- fetch-distinct-per-field
  "Portable per-field fallback for non-SQL drivers (e.g. Mongo). Returns the same shape as
  `fetch-distinct-for-table` (so the caller's persist reduce doesn't care which path produced
  the results). One QP query per field."
  [fields]
  (reduce (fn [acc field]
            (let [field-id (u/the-id field)
                  result   (sync-util/with-error-handling
                            (format "Error fetching distinct values for %s"
                                    (sync-util/name-for-logging field))
                             (field-values/distinct-values field))
                  acc'     (update acc :queries inc)]
              (if (or (nil? result) (instance? Throwable result))
                (update acc' :failed-fields conj field-id)
                (assoc-in acc' [:results field-id :values] (map first (:values result))))))
          {:results {} :queries 0 :failed-fields #{}}
          fields))

(defn- merge-fetch-results
  "Combine `{:results :queries :failed-fields}` maps from the batch and per-field fetchers."
  [a b]
  {:results       (merge (:results a) (:results b))
   :queries       (+ (:queries a 0) (:queries b 0))
   :failed-fields (into #{} cat [(:failed-fields a) (:failed-fields b)])})

(defn- sync-fields-for-table!
  "Fetch distinct values for `fields` from `table` and persist them via
  `field-values/persist-field-values!`.

  Dispatch: SQL drivers that meet `can-batch-distinct?` use the UNION ALL batch path for fields
  without a `:parent_id`. Nested-JSON child fields (`:parent_id` set) and the entire field set
  for non-batchable tables go through the portable per-field MBQL path — that path goes through
  the QP, which builds correct column references for nested-JSON fields (`run-distinct-batch`'s
  hand-rolled HoneySQL CAST does not).

  Returns a counts map of outcomes."
  [table fields fvs-map]
  (when (seq fields)
    (let [{nested true plain false}    (group-by #(boolean (:parent_id %)) fields)
          batch?                       (can-batch-distinct? table)
          batch-fields                 (when batch? plain)
          per-field-fields             (concat nested (when-not batch? plain))
          {:keys [results queries failed-fields]}
          (merge-fetch-results
           (when (seq batch-fields)     (fetch-distinct-for-table table batch-fields))
           (when (seq per-field-fields) (fetch-distinct-per-field per-field-fields)))]
      (reduce (fn [counts field]
                (let [field-id (u/the-id field)
                      delta    (if (contains? failed-fields field-id)
                                 {:errors 1}
                                 (let [raw-values (get-in results [field-id :values] [])
                                       result     (sync-util/with-error-handling
                                                   (format "Error updating field values for %s"
                                                           (sync-util/name-for-logging field))
                                                    (field-values/persist-field-values!
                                                     field (get fvs-map field-id) raw-values))]
                                   (result->delta result)))]
                  (merge-with + counts delta {:probed 1})))
              (merge-with + empty-counts {:queries queries})
              fields))))

(defn sync-fields-grouped-by-table!
  "Sync FieldValues for `fields`, grouping by `:table_id`. Filters to FV-eligible fields via
  `field-should-have-field-values?` before dispatching. SQL drivers use the UNION batch path;
  non-SQL drivers use the per-field path. Returns the aggregated counts across all tables.

  Non-recoverable errors propagate out and abort."
  [fields]
  (let [eligible (filter field-values/field-should-have-field-values? fields)]
    (when (seq eligible)
      (let [fvs-map  (field-values/batched-get-latest-full-field-values (map u/the-id eligible))
            by-table (group-by :table_id eligible)]
        (transduce (map (fn [[table-id table-fields]]
                          (let [table (t2/select-one :model/Table :id table-id)]
                            (sync-fields-for-table! table table-fields fvs-map))))
                   (completing (partial merge-with +))
                   empty-counts
                   by-table)))))

(mu/defn update-field-values-for-table!
  "Update the FieldValues for all Fields (as needed) for `table`.
  SQL drivers use a single UNION ALL query covering every list-eligible field with an active
  FieldValues row. Non-SQL drivers fall back to sequential per-field DISTINCT queries."
  [table :- i/TableInstance]
  (let [limit            (sync.settings/scan-max-fields-per-table)
        scanned          (table->fields-to-scan table (inc limit))
        _                (when (> (count scanned) limit)
                           (warn-too-many-fields! table limit))
        all-fields       (take limit scanned)
        {to-sync  true
         to-clear false} (group-by #(boolean (field-values/field-should-have-field-values? %))
                                   all-fields)
        clear-counts     (reduce (fn [counts field]
                                   (let [result (sync-util/with-error-handling
                                                 (format "Error clearing field values for %s"
                                                         (sync-util/name-for-logging field))
                                                  (clear-field-values-for-field! field))]
                                     (merge-with + counts (result->delta result))))
                                 empty-counts
                                 to-clear)
        fvs-map          (field-values/batched-get-latest-full-field-values (map u/the-id to-sync))
        fields-to-sync   (filterv (fn [field]
                                    (let [fv (get fvs-map (u/the-id field))]
                                      (cond
                                        (not fv)
                                        (do (log/tracef "%s does not have FieldValues. Skipping..."
                                                        (sync-util/name-for-logging field))
                                            false)

                                        (field-values/inactive? fv)
                                        (do (log/infof "%s has not been used since %s. Skipping..."
                                                       (sync-util/name-for-logging field)
                                                       (t/format "yyyy-MM-dd"
                                                                 (t/local-date-time (:last_used_at fv))))
                                            false)

                                        :else
                                        true)))
                                  to-sync)
        sync-counts      (sync-fields-for-table! table fields-to-sync fvs-map)]
    (merge-with + clear-counts (or sync-counts empty-counts))))

(mu/defn- update-field-values-for-database!
  [database :- i/DatabaseInstance]
  (tracing/with-span :sync "field-values.update" {:db/id (:id database)}
    (let [tables (sync-util/reducible-sync-tables database)]
      (transduce (map update-field-values-for-table!) (partial merge-with +) tables))))

(defn- update-field-values-summary [{:keys [created updated deleted errors probed queries]}]
  (format "Updated %d field value sets, created %d, deleted %d with %d errors (probed %d fields in %d queries)"
          updated created deleted errors probed queries))

(defn- delete-expired-advanced-field-values-summary [{:keys [deleted]}]
  (format "Deleted %d expired advanced fieldvalues" deleted))

(defn- table-ids->table-id->is-on-demand?
  "Given a collection of `table-ids` return a map of Table ID to whether or not its Database is subject to 'On Demand'
  FieldValues updating. This means the FieldValues for any Fields belonging to the Database should be updated only
  when they are used in new Dashboard or Card parameters."
  [table-ids]
  (let [table-ids            (set table-ids)
        table-id->db-id      (when (seq table-ids)
                               (t2/select-pk->fn :db_id 'Table :id [:in table-ids]))
        db-id->is-on-demand? (when (seq table-id->db-id)
                               (t2/select-pk->fn :is_on_demand 'Database
                                                 :id [:in (set (vals table-id->db-id))]))]
    (into {} (for [table-id table-ids]
               [table-id (-> table-id table-id->db-id db-id->is-on-demand?)]))))

(def ^:private ^:dynamic *on-demand-select-batch-size*
  "Chunk size when fetching :model/Field rows for on-demand updates. Keeps a single SQL `IN (…)`
  clause under the smallest driver parameter limit (Oracle: 1000, SQL Server: 2100)."
  500)

(defn update-field-values-for-on-demand-dbs!
  "Update the FieldValues for any Fields with `field-ids` if the Field should have FieldValues and it belongs to a
  Database that is set to do 'On-Demand' syncing.

  Groups fields by table and uses the UNION-distinct path (one warehouse query per table) on SQL
  drivers; non-SQL drivers fall back to per-field queries."
  [field-ids]
  (let [fields (when (seq field-ids)
                 (->> field-ids
                      (partition-all *on-demand-select-batch-size*)
                      (mapcat (fn [batch]
                                (t2/select ['Field :name :id :base_type :effective_type :coercion_strategy
                                            :semantic_type :visibility_type :table_id :has_field_values]
                                           :id [:in batch])))))
        table-id->is-on-demand? (table-ids->table-id->is-on-demand? (map :table_id fields))
        on-demand-fields        (filter #(table-id->is-on-demand? (:table_id %)) fields)]
    (when (seq on-demand-fields)
      (log/debugf "Updating FieldValues for %d on-demand fields across %d tables"
                  (count on-demand-fields) (count (set (map :table_id on-demand-fields))))
      (sync-fields-grouped-by-table! on-demand-fields))))

(defn- delete-expired-advanced-field-values-for-field!
  [field]
  (sync-util/with-error-handling (format "Error deleting expired advanced field values for %s" (sync-util/name-for-logging field))
    (let [conditions [:field_id   (:id field)
                      :type       [:in field-values/advanced-field-values-types]
                      :created_at [:< ((requiring-resolve 'metabase.util.honey-sql-2/add-interval-honeysql-form)
                                       (mdb/db-type)
                                       :%now
                                       (- (t/as field-values/advanced-field-values-max-age :days))
                                       :day)]]
          rows-count (apply t2/count :model/FieldValues conditions)]
      (apply t2/delete! :model/FieldValues conditions)
      rows-count)))

(mu/defn delete-expired-advanced-field-values-for-table!
  "Delete all expired advanced FieldValues for a table and returns the number of deleted rows.
  For more info about advanced FieldValues, check the docs
  in [[metabase.warehouse-schema.models.field-values/field-values-types]]"
  [table :- i/TableInstance]
  (->> (table->fields-to-scan table (sync.settings/scan-max-fields-per-table))
       (map delete-expired-advanced-field-values-for-field!)
       (reduce +)))

(mu/defn- delete-expired-advanced-field-values-for-database!
  [database :- i/DatabaseInstance]
  (tracing/with-span :sync "field-values.delete-expired-advanced" {:db/id (:id database)}
    (let [tables (sync-util/reducible-sync-tables database)]
      {:deleted (transduce (comp (map delete-expired-advanced-field-values-for-table!)
                                 (map (fn [result]
                                        (if (instance? Throwable result)
                                          (throw result)
                                          result))))
                           +
                           0
                           tables)})))

(def ^:private sync-field-values-steps
  [(sync-util/create-sync-step "delete-expired-advanced-field-values"
                               delete-expired-advanced-field-values-for-database!
                               delete-expired-advanced-field-values-summary)
   (sync-util/create-sync-step "update-field-values"
                               update-field-values-for-database!
                               update-field-values-summary)])

(mu/defn update-field-values!
  "Update the advanced FieldValues (distinct values for categories and certain other fields that are shown
   in widgets like filters) for the Tables in `database` (as needed)."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :cache-field-values database (format "Cache field values in %s"
                                                                 (sync-util/name-for-logging database))
    (sync-util/run-sync-operation "field values scanning" database sync-field-values-steps)))
