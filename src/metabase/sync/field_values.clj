(ns metabase.sync.field-values
  "Logic for updating FieldValues for fields in a database."
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.field-values.union-distinct :as union-distinct]
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

(defn- update-field-value-stats-count [counts-map result]
  (if (instance? Exception result)
    (update counts-map :errors inc)
    (case result
      ::field-values/fv-created
      (update counts-map :created inc)
      ::field-values/fv-updated
      (update counts-map :updated inc)
      ::field-values/fv-deleted
      (update counts-map :deleted inc)

      counts-map)))

(defn- table->fields-to-scan
  [table]
  (t2/select :model/Field :table_id (u/the-id table), :active true, :visibility_type "normal"))

(defn- sql-driver?
  "Does this `table`'s database use a SQL-derived driver? Determines whether we can use the
   single-query UNION path or have to fall back to per-field DISTINCT queries (e.g. for Mongo)."
  [table]
  (let [engine (:engine (t2/select-one :model/Database :id (:db_id table)))]
    (isa? driver/hierarchy engine :sql)))

(defn- empty-counts
  "Initial counter map for a sync run.
   - `:probed`  fields we attempted to fetch distinct values for (active list-eligible fields)
   - `:queries` warehouse queries actually issued (1 per UNION batch on SQL, 1 per field on non-SQL)
   - `:created`/`:updated`/`:deleted`/`:errors` per-field outcomes (`::fv-skipped` is not counted)"
  []
  {:errors 0, :created 0, :updated 0, :deleted 0, :probed 0, :queries 0})

(defn- update-field-values-for-table-union!
  "Bulk-fetch distinct values for `fields-to-sync` via one UNION ALL query, then persist per field.
   If the bulk query fails, every field in the batch is reported as an error (no per-field
   fallback — by design)."
  [table fields-to-sync fvs-map]
  (let [n-fields  (count fields-to-sync)
        n-queries (count (partition-all union-distinct/*batch-size* fields-to-sync))
        results   (sync-util/with-error-handling
                   (format "Error fetching union distinct values for %s" (sync-util/name-for-logging table))
                    (union-distinct/union-distinct-values (u/the-id table) fields-to-sync))
        outcome-counts (if (or (nil? results) (instance? Throwable results))
                         (assoc (empty-counts) :errors n-fields)
                         (reduce (fn [counts field]
                                   (let [field-id        (u/the-id field)
                                         existing-fv     (get fvs-map field-id)
                                         {:keys [values raw-count]} (get results field-id {:values [] :raw-count 0})
                                         {capped-values :values
                                          cap-hit?      :has_more_values} (field-values/limit-values values)
                                         row-limit-hit?  (>= raw-count union-distinct/*distinct-limit*)
                                         has-more-values (boolean (or cap-hit? row-limit-hit?))
                                         result          (sync-util/with-error-handling
                                                          (format "Error updating field values for %s"
                                                                  (sync-util/name-for-logging field))
                                                           (field-values/persist-field-values!
                                                            field existing-fv capped-values has-more-values))]
                                     (update-field-value-stats-count counts result)))
                                 (empty-counts)
                                 fields-to-sync))]
    (assoc outcome-counts :probed n-fields :queries n-queries)))

(defn- update-field-values-for-table-per-field!
  "Sequential per-field fallback for non-SQL drivers that can't run the UNION query (e.g. Mongo).
   Matches master's behavior — one DISTINCT per field, no batching."
  [_table fields-to-sync fvs-map]
  (let [n-fields (count fields-to-sync)]
    (-> (reduce (fn [counts field]
                  (let [existing-fv (get fvs-map (u/the-id field))
                        result      (sync-util/with-error-handling
                                     (format "Error updating field values for %s"
                                             (sync-util/name-for-logging field))
                                      (field-values/create-or-update-full-field-values!
                                       field :field-values existing-fv))]
                    (update-field-value-stats-count counts result)))
                (empty-counts)
                fields-to-sync)
        (assoc :probed n-fields :queries n-fields))))

(mu/defn update-field-values-for-table!
  "Update the FieldValues for all Fields (as needed) for `table`.
   SQL drivers use a single UNION ALL query covering every list-eligible field with an active
   FieldValues row. Non-SQL drivers fall back to sequential per-field DISTINCT queries."
  [table :- i/TableInstance]
  (let [all-fields                        (table->fields-to-scan table)
        {to-sync  true
         to-clear false}                  (group-by #(boolean (field-values/field-should-have-field-values? %))
                                                    all-fields)
        clear-counts                      (reduce (fn [counts field]
                                                    (let [result (sync-util/with-error-handling
                                                                  (format "Error clearing field values for %s"
                                                                          (sync-util/name-for-logging field))
                                                                   (clear-field-values-for-field! field))]
                                                      (update-field-value-stats-count counts result)))
                                                  (empty-counts)
                                                  to-clear)]
    (if (empty? to-sync)
      clear-counts
      (let [fvs-map        (field-values/batched-get-latest-full-field-values (map u/the-id to-sync))
            fields-to-sync (filterv (fn [field]
                                      (let [fv (get fvs-map (u/the-id field))]
                                        (cond
                                          (not fv)
                                          (do (log/infof "%s does not have FieldValues. Skipping..."
                                                         (sync-util/name-for-logging field))
                                              false)

                                          (field-values/inactive? fv)
                                          (do (log/infof "%s has not been used since %s. Skipping..."
                                                         (sync-util/name-for-logging field)
                                                         (t/format "yyyy-MM-dd"
                                                                   (t/local-date-time (:last_used_at fv))))
                                              false)

                                          :else true)))
                                    to-sync)
            sync-counts    (cond
                             (empty? fields-to-sync) (empty-counts)
                             (sql-driver? table)     (update-field-values-for-table-union!
                                                      table fields-to-sync fvs-map)
                             :else                   (update-field-values-for-table-per-field!
                                                      table fields-to-sync fvs-map))]
        (merge-with + clear-counts sync-counts)))))

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
  (->> (table->fields-to-scan table)
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
