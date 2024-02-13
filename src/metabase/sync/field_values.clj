(ns metabase.sync.field-values
  "Logic for updating FieldValues for fields in a database."
  (:require
   [java-time.api :as t]
   [metabase.db :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.field :refer [Field]]
   [metabase.models.field-values :as field-values :refer [FieldValues]]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn ^:private clear-field-values-for-field!
  [field :- i/FieldInstance]
  (when (t2/exists? FieldValues :field_id (u/the-id field))
    (log/debug (format "Based on cardinality and/or type information, %s should no longer have field values.\n"
                       (sync-util/name-for-logging field))
               "Deleting FieldValues...")
    (field-values/clear-field-values-for-field! field)
    ::field-values/fv-deleted))

(mu/defn ^:private update-field-values-for-field!
  [field :- i/FieldInstance]
  (log/debug (u/format-color 'green "Looking into updating FieldValues for %s" (sync-util/name-for-logging field)))
  (let [field-values (t2/select-one FieldValues :field_id (u/the-id field) :type :full)]
    (if (field-values/inactive? field-values)
      (log/debugf "Field %s has not been used since %s. Skipping..."
                  (sync-util/name-for-logging field) (t/format "yyyy-MM-dd" (t/local-date-time (:last_used_at field-values))))
      (field-values/create-or-update-full-field-values! field))))

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
  (t2/select Field :table_id (u/the-id table), :active true, :visibility_type "normal"))

(mu/defn update-field-values-for-table!
  "Update the FieldValues for all Fields (as needed) for `table`."
  [table :- i/TableInstance]
  (reduce (fn [fv-change-counts field]
            (let [result (sync-util/with-error-handling (format "Error updating field values for %s" (sync-util/name-for-logging field))
                           (if (field-values/field-should-have-field-values? field)
                             (update-field-values-for-field! field)
                             (clear-field-values-for-field! field)))]
              (update-field-value-stats-count fv-change-counts result)))
          {:errors 0, :created 0, :updated 0, :deleted 0}
          (table->fields-to-scan table)))

(mu/defn ^:private update-field-values-for-database!
  [_database :- i/DatabaseInstance
   tables    :- [:maybe [:sequential i/TableInstance]]]
  (apply merge-with + (map update-field-values-for-table! tables)))

(defn- update-field-values-summary [{:keys [created updated deleted errors]}]
  (format "Updated %d field value sets, created %d, deleted %d with %d errors"
       updated created deleted errors))

(defn- delete-expired-advanced-field-values-summary [{:keys [deleted]}]
  (format "Deleted %d expired advanced fieldvalues" deleted))

(defn- delete-expired-advanced-field-values-for-field!
  [field]
  (sync-util/with-error-handling (format "Error deleting expired advanced field values for %s" (sync-util/name-for-logging field))
    (let [conditions [:field_id   (:id field)
                      :type       [:in field-values/advanced-field-values-types]
                      :created_at [:< (sql.qp/add-interval-honeysql-form
                                       (mdb/db-type)
                                       :%now
                                       (- (t/as field-values/advanced-field-values-max-age :days))
                                       :day)]]
          rows-count (apply t2/count FieldValues conditions)]
      (apply t2/delete! FieldValues conditions)
      rows-count)))

(mu/defn delete-expired-advanced-field-values-for-table!
  "Delete all expired advanced FieldValues for a table and returns the number of deleted rows.
  For more info about advanced FieldValues, check the docs in [[metabase.models.field-values/field-values-types]]"
  [table :- i/TableInstance]
  (->> (table->fields-to-scan table)
       (map delete-expired-advanced-field-values-for-field!)
       (reduce +)))

(mu/defn ^:private delete-expired-advanced-field-values-for-database!
  [_database :- i/DatabaseInstance
   tables :- [:maybe [:sequential i/TableInstance]]]
  {:deleted (transduce (comp (map delete-expired-advanced-field-values-for-table!)
                             (map (fn [result]
                                    (if (instance? Throwable result)
                                      (throw result)
                                      result))))
                       +
                       0
                       tables)})

(defn- make-sync-field-values-steps
  [tables]
  [(sync-util/create-sync-step "delete-expired-advanced-field-values"
                               #(delete-expired-advanced-field-values-for-database! % tables)
                               delete-expired-advanced-field-values-summary)
   (sync-util/create-sync-step "update-field-values"
                               #(update-field-values-for-database! % tables)
                               update-field-values-summary)])

(mu/defn update-field-values!
  "Update the advanced FieldValues (distinct values for categories and certain other fields that are shown
   in widgets like filters) for the Tables in `database` (as needed)."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :cache-field-values database (format "Cache field values in %s"
                                                                 (sync-util/name-for-logging database))
    (let [tables (sync-util/db->sync-tables database)]
     (sync-util/run-sync-operation "field values scanning" database (make-sync-field-values-steps tables)))))
