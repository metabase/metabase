(ns metabase.sync.field-values
  "Logic for updating FieldValues for fields in a database."
  (:require
   [java-time.api :as t]
   [metabase.analyze.core :as analyze]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.analyze.table-chunks :as table-chunks]
   [metabase.sync.db :as sync.db]
   [metabase.sync.interface :as i]
   [metabase.sync.settings :as sync.settings]
   [metabase.sync.updates :as sync.updates]
   [metabase.sync.util :as sync-util]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.field-values.distinct-batch :as distinct-batch]
   [metabase.warehouse-schema.models.field-values :as field-values]))

(defn- result->delta [result]
  (cond
    (instance? Throwable result)        {:errors 1}
    (= ::field-values/fv-created result) {:created 1}
    (= ::field-values/fv-updated result) {:updated 1}
    (= ::field-values/fv-deleted result) {:deleted 1}))

(defn- fields-to-scan
  "Up to `limit` active, normal-visibility Fields of each of `tables`, by Table id, ordered by id so that the
  selection is stable across syncs and a wide Table loads a bounded number of Fields."
  [tables limit]
  (group-by :table_id (analyze/normal-fields (mapv :id tables) limit)))

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
  [database table]
  (let [engine (:engine database)]
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
  "Run all UNION batches for `fields` from `table` of a Database of `driver`. Returns
   `{:results {field-id -> {:values [...]}}, :queries <int>, :failed-fields #{field-id ...}}`.

   Per-batch failures are caught via `sync-util/with-error-handling` — recoverable errors
   contribute the batch's field-ids to `:failed-fields` and the loop continues; non-recoverable
   errors propagate out and abort the sync."
  [driver table fields]
  (reduce (fn [acc batch]
            (let [batch-result (sync-util/with-error-handling
                                (format "Error fetching union distinct values for %s"
                                        (sync-util/name-for-logging table))
                                 (distinct-batch/run-distinct-batch driver table batch))
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

(defn- table-field-values-changes
  "Fetch distinct values for `fields` from `table` and return `{:queries n :changes pairs}`: the number of warehouse
  queries and, for each of `fields`, a pair of the Field and what [[field-values/field-values-change]] returns for it,
  or the Throwable fetching or comparing its values threw. Unless `:rescan?`, a list that is still too large is kept.

  Nested fields (with a `:parent_id`) and unfolded JSON fields (with an `:nfc_path`) do not go in the UNION batch query,
  because it uses only the field name, which is not a column for these fields."
  [database table fields fvs-map {:keys [rescan?]}]
  (if (empty? fields)
    {:queries 0 :changes []}
    (let [{nested true plain false}    (group-by (comp boolean (some-fn :parent_id :nfc_path)) fields)
          batch?                       (can-batch-distinct? database table)
          batch-fields                 (when batch? plain)
          per-field-fields             (concat nested (when-not batch? plain))
          {:keys [results queries failed-fields]}
          (merge-fetch-results
           (when (seq batch-fields)     (fetch-distinct-for-table (:engine database) table batch-fields))
           (when (seq per-field-fields) (fetch-distinct-per-field per-field-fields)))]
      {:queries queries
       :changes (mapv (fn [field]
                        (let [field-id (u/the-id field)]
                          [field (if (contains? failed-fields field-id)
                                   (ex-info "Error fetching field values" {:field-id field-id})
                                   (sync-util/with-error-handling
                                    (format "Error updating field values for %s" (sync-util/name-for-logging field))
                                     (field-values/field-values-change
                                      field (get fvs-map field-id) (get-in results [field-id :values] [])
                                      {:keep-too-large? (not rescan?)})))]))
                      fields)})))

(defn- save-changes!
  "Write the changes of `pairs`, each a Field and its change or a Throwable, at once, or Field by Field when that
  fails, and return the counts of their outcomes."
  [pairs]
  (let [ok      (into [] (remove (comp #(instance? Throwable %) second)) pairs)
        saved?  (and (next ok)
                     (not (instance? Throwable (sync-util/rethrow-fatal
                                                (sync-util/with-error-handling "Error updating field values"
                                                  (sync.updates/save-field-values-changes! (mapv (comp :id first) ok) (mapv second ok)))))))
        outcome (fn [[field change]]
                  (cond
                    (instance? Throwable change) change
                    saved?                       (:result change)
                    :else                        (sync-util/with-error-handling
                                                  (format "Error updating field values for %s"
                                                          (sync-util/name-for-logging field))
                                                   (sync.updates/save-field-values-changes! [(:id field)] [change])
                                                   (:result change))))]
    (transduce (map (comp result->delta outcome))
               (partial merge-with +)
               (assoc empty-counts :probed (count pairs))
               pairs)))

(defn- sync-fields-of-tables!
  "Fetch distinct values for the Fields of each of `tables`, by `table-id->fields`, each Table's Database by
  `table-database`, and write their FieldValues at once, returning the counts of outcomes. `opts` as for
  [[table-field-values-changes]]."
  [tables table-database table-id->fields fvs-map opts]
  (let [fetched (lib-be/with-metadata-provider-cache
                  (mapv (fn [table]
                          (database-routing/with-anonymous-router-access
                            (table-field-values-changes (table-database table) table (table-id->fields (:id table))
                                                        fvs-map opts)))
                        tables))]
    (assoc (save-changes! (into [] (mapcat :changes) fetched))
           :queries (transduce (map :queries) + 0 fetched))))

(defn sync-fields-grouped-by-table!
  "Sync FieldValues for `fields`, grouping by `:table_id`. Filters to FV-eligible fields via
  `field-should-have-field-values?` before dispatching. SQL drivers use the UNION batch path;
  non-SQL drivers use the per-field path. Returns the aggregated counts across all tables.

  Non-recoverable errors propagate out and abort."
  [fields]
  (let [eligible (filter field-values/field-should-have-field-values? fields)]
    (when (seq eligible)
      (let [fvs-map  (field-values/batched-get-latest-full-field-values (map u/the-id eligible))
            by-table (group-by :table_id eligible)
            tables   (into [] (mapcat #(sync.db/tables-by-schema-and-name (vec %)))
                           (partition-all table-chunks/tables-per-chunk (keys by-table)))
            id->db   (database-routing/with-anonymous-router-access
                       (into {} (map (juxt identity driver.u/lib-database)) (distinct (map :db_id tables))))]
        (sync-fields-of-tables! tables (comp id->db :db_id) by-table fvs-map {:rescan? false})))))

(defn- clear-field-values!
  "Delete the FieldValues of `fields`, which should no longer have any, returning the counts of the Fields that had
  some."
  [fields]
  (let [field-id->ids (when (seq fields)
                        (field-values/ids-by-field (mapv :id fields)))]
    (if (empty? field-id->ids)
      empty-counts
      (let [_      (doseq [field fields
                           :when (contains? field-id->ids (:id field))]
                     (log/debug (format "Based on cardinality and/or type information, %s should no longer have field values.\n"
                                        (sync-util/name-for-logging field))
                                "Deleting FieldValues..."))
            result (sync-util/with-error-handling "Error clearing field values"
                     (field-values/delete-field-values! (into [] cat (vals field-id->ids))))]
        (assoc empty-counts (if (instance? Exception result) :errors :deleted) (count field-id->ids))))))

(defn- syncable?
  "Whether the FieldValues `fv` of `field` are there and in use, by `field-id->last-used-at` from
  [[field-values/fields-last-used-at]], so sync should update them."
  [field-id->last-used-at field fv]
  (cond
    (not fv)
    (do (log/tracef "%s does not have FieldValues. Skipping..." (sync-util/name-for-logging field))
        false)

    (field-values/inactive? fv (field-id->last-used-at (:field_id fv)))
    (do (log/infof "%s has not been used since %s. Skipping..."
                   (sync-util/name-for-logging field)
                   (t/format "yyyy-MM-dd" (t/local-date-time (:last_used_at fv))))
        false)

    :else
    true))

(mr/def ::scan-options
  [:map {:closed true}
   [:rescan? :boolean]])

(mu/defn- update-field-values-for-tables!
  "Update the FieldValues of the Fields of `tables` that need it, reading their Fields and FieldValues together, with
  one UNION ALL query per Table on SQL drivers and one DISTINCT query per Field elsewhere. A manual rescan
  (`:rescan?`) also stores again the lists that are still too large."
  [database :- i/DatabaseInstance
   tables   :- [:sequential i/TableInstance]
   opts     :- ::scan-options]
  (let [limit             (sync.settings/scan-max-fields-per-table)
        table-id->scanned (fields-to-scan tables (inc limit))
        table-id->fields  (into {}
                                (map (fn [table]
                                       (let [scanned (table-id->scanned (:id table))]
                                         (when (> (count scanned) limit)
                                           (warn-too-many-fields! table limit))
                                         [(:id table) (take limit scanned)])))
                                tables)
        {to-sync  true
         to-clear false}  (group-by #(boolean (field-values/field-should-have-field-values? %))
                                    (mapcat val table-id->fields))
        clear-counts      (clear-field-values! to-clear)
        fvs-map           (field-values/batched-get-latest-full-field-values (map u/the-id to-sync))
        last-used-at      (field-values/fields-last-used-at (vec (vals fvs-map)))
        table-id->to-sync (group-by :table_id (filter #(syncable? last-used-at % (get fvs-map (u/the-id %))) to-sync))]
    (merge-with + clear-counts (sync-fields-of-tables! tables (constantly database) table-id->to-sync fvs-map opts))))

(mu/defn update-field-values-for-table!
  "Update the FieldValues for all Fields (as needed) for `table`.
  SQL drivers use a single UNION ALL query covering every list-eligible field with an active
  FieldValues row. Non-SQL drivers fall back to sequential per-field DISTINCT queries."
  ([table :- i/TableInstance]
   (update-field-values-for-table! (driver.u/lib-database (:db_id table)) table))

  ([database :- i/DatabaseInstance
    table    :- i/TableInstance]
   (update-field-values-for-tables! database [table] {:rescan? false})))

(mu/defn rescan-field-values-for-table!
  "[[update-field-values-for-table!]] for a rescan a user asked for: lists that are still too large are stored again
  too."
  [table :- i/TableInstance]
  (update-field-values-for-tables! (driver.u/lib-database (:db_id table)) [table] {:rescan? true}))

(mu/defn- update-field-values-for-database!
  [database :- i/DatabaseInstance
   opts     :- ::scan-options]
  (tracing/with-span :sync "field-values.update" {:db/id (:id database)}
    (let [groups (table-chunks/groups (sync-util/reducible-sync-tables database)
                                      analyze/normal-field-counts
                                      (inc (sync.settings/scan-max-fields-per-table)))]
      (transduce (map #(update-field-values-for-tables! database % opts)) (partial merge-with +) groups))))

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
                               (sync.db/table-database-ids table-ids))
        db-id->is-on-demand? (when (seq table-id->db-id)
                               (sync.db/database-on-demand-flags (set (vals table-id->db-id))))]
    (into {} (for [table-id table-ids]
               [table-id (-> table-id table-id->db-id db-id->is-on-demand?)]))))

(def ^:private on-demand-select-batch-size
  "Chunk size when fetching :model/Field rows for on-demand updates, so each app-DB `IN (…)` clause stays bounded."
  500)

(defn update-field-values-for-on-demand-dbs!
  "Update the FieldValues for any Fields with `field-ids` if the Field should have FieldValues and it belongs to a
  Database that is set to do 'On-Demand' syncing.

  Groups fields by table and uses the UNION-distinct path (one warehouse query per table) on SQL
  drivers; non-SQL drivers fall back to per-field queries."
  [field-ids]
  (let [fields (when (seq field-ids)
                 (->> field-ids
                      (partition-all on-demand-select-batch-size)
                      (mapcat (fn [batch]
                                (sync.db/fields-for-field-values batch)))))
        table-id->is-on-demand? (table-ids->table-id->is-on-demand? (map :table_id fields))
        on-demand-fields        (filter #(table-id->is-on-demand? (:table_id %)) fields)]
    (when (seq on-demand-fields)
      (log/debugf "Updating FieldValues for %d on-demand fields across %d tables"
                  (count on-demand-fields) (count (set (map :table_id on-demand-fields))))
      (database-routing/with-anonymous-router-access
        (sync-fields-grouped-by-table! on-demand-fields)))))

(mu/defn- delete-expired-advanced-field-values-for-database!
  [database :- i/DatabaseInstance]
  (tracing/with-span :sync "field-values.delete-expired-advanced" {:db/id (:id database)}
    (let [ids (field-values/expired-advanced-ids-of-database (u/the-id database))]
      (when (seq ids)
        (field-values/delete-field-values! ids))
      {:deleted (count ids)})))

(defn- sync-field-values-steps
  "The steps of a scan of the FieldValues of a Database, with `opts` as for [[update-field-values-for-tables!]]."
  [opts]
  [(sync-util/create-sync-step "delete-expired-advanced-field-values"
                               delete-expired-advanced-field-values-for-database!
                               delete-expired-advanced-field-values-summary)
   (sync-util/create-sync-step "update-field-values"
                               #(update-field-values-for-database! % opts)
                               update-field-values-summary)])

(defn- scan-field-values!
  "Run the scan of the FieldValues of the Database with `database-id`, with `opts`."
  [database-id opts]
  (let [database (driver.u/lib-database database-id)]
    (sync-util/sync-operation :cache-field-values database (format "Cache field values in %s"
                                                                   (sync-util/name-for-logging database))
      (sync-util/run-sync-operation "field values scanning" database (sync-field-values-steps opts)))))

(mu/defn update-field-values!
  "Update the advanced FieldValues (distinct values for categories and certain other fields that are shown
   in widgets like filters) for the Tables in the Database with `database-id` (as needed)."
  [database-id :- ::lib.schema.id/database]
  (scan-field-values! database-id {:rescan? false}))

(mu/defn rescan-field-values!
  "[[update-field-values!]] for a rescan a user asked for: lists that are still too large are stored again too."
  [database-id :- ::lib.schema.id/database]
  (scan-field-values! database-id {:rescan? true}))
