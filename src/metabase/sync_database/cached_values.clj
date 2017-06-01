(ns metabase.sync-database.cached-values
  "Functions discover and save the fields in a table."
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [field :as field]
             [field-values :as field-values]
             [table :as table]]
            [metabase.sync-database.interface :as i]
            [schema.core :as schema]
            [toucan.db :as db]
            [metabase.db.metadata-queries :as queries]
            [metabase.sync-database.classify :as classify]
            [metabase.sync-database.infer-special-type :as infer-special-type]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;; Drivers use these to get field values
#_(defn table-row-count
  "Determine the count of rows in TABLE by running a simple structured MBQL query."
  [table]
  {:pre [(integer? (:id table))]}
  (try
    (queries/table-row-count table)
    (catch Throwable e
      (log/error (u/format-color 'red "Unable to determine row count for '%s': %s\n%s" (:name table) (.getMessage e) (u/pprint-to-str (u/filtered-stacktrace e)))))))

(def ^:private ^:const ^Integer field-values-entry-max-length
  "The maximum character length for a stored `FieldValues` entry."
  100)

(def ^:private ^:const ^Integer field-values-total-max-length
  "Maximum total length for a FieldValues entry (combined length of all values for the field)."
  (* classify/low-cardinality-threshold field-values-entry-max-length))

(defn field-values-below-low-cardinality-threshold? [non-nil-values]
  (and (<= (count non-nil-values) classify/low-cardinality-threshold)
      ;; very simple check to see if total length of field-values exceeds (total values * max per value)
       (let [total-length (reduce + (map (comp count str) non-nil-values))]
         (<= total-length field-values-total-max-length))))

(defn test-for-cardinality?
  "Should FIELD should be tested for cardinality?"
  [{:keys [base_type] :as field}]
  (or (field-values/field-should-have-field-values? field)
      (and #_(nil? (:special_type field))
           #_is-new? ;; do we actually want to test for this here?
           (not (isa? base_type :type/DateTime))
           (not (isa? base_type :type/Collection))
           (not (= base_type :type/*)))))

;; was part of test:cardinality-extract-field-values
(defn extract-field-values
  "Extract field-values for FIELD.  If number of values exceeds `low-cardinality-threshold` then we return an empty set of values."
  [{:keys [name base_type] :as field} field-stats]
  ;; TODO: we need some way of marking a field as not allowing field-values so that we can skip this work if it's not appropriate
  ;;       for example, :type/Category fields with more than MAX values don't need to be rescanned all the time

  (let [#_name-type-guess #_(infer-special-type/infer-field-special-type name base_type)
        ;collecting-field-values-is-allowed? true (field-values/field-should-have-field-values? field)
;        _ (log/errorf (u/format-color 'green "name: %s :type %s" name name-type-guess))
        non-nil-values  (when #_(test-for-cardinality? field) #_(nil? name-type-guess) (field-values/field-should-have-field-values? field)
                          (filter identity (queries/field-distinct-values field (inc classify/low-cardinality-threshold))))
        ;; only return the list if we didn't exceed our MAX values and if the the total character count of our values is reasable (#2332)
        distinct-values (when (field-values-below-low-cardinality-threshold? non-nil-values)
                          non-nil-values)]
    (if (seq distinct-values)
      (assoc field-stats :values distinct-values)
      field-stats)))

(defn make-analyze-table
  "Make a generic implementation of `analyze-table`."
  {:style/indent 1}
  [driver & {:keys [calculate-row-count?]
             :or   {calculate-row-count?  true}}]
  (fn [driver table new-field-ids]
    {#_:row_count #_(when calculate-row-count? (u/try-apply table-row-count table))
     :fields    (for [id new-field-ids]
                  (extract-field-values (field/Field id) {:id id}))}))

(defn generic-analyze-table
  "An implementation of `analyze-table` using the defaults (`default-field-avg-length` and `field-percent-urls`)."
  [driver table new-field-ids]
  ((make-analyze-table driver) driver table new-field-ids))

;;;; End of driver stuff
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;; call drivers, get field values, save them in application DB
(defn cache-table-data-shape!
  "Analyze the data shape for a single `Table`."
  [driver {table-id :id, :as table}]
  (log/error (u/format-color 'red "cache-table-data-shape! %s" table))
  (let [new-field-ids (db/select-ids field/Field, :table_id table-id, :visibility_type [:not= "retired"], :last_analyzed nil)]
    ;; TODO: this call should include the database
    (when-let [table-stats (u/prog1 (driver/analyze-table driver table new-field-ids)
                             (when <>
                               (schema/validate i/AnalyzeTable <>)))]
      ;; update table row count @sameer should this be saved here where it happens to be available or calculated as part of making
      ;; the fingerprints in analyze
      (when (:row_count table-stats)
        (db/update! table/Table table-id, :rows (:row_count table-stats)))

      ;; update individual fields
      (doseq [{:keys [id preview-display #_special-type values]} (:fields table-stats)]
        ;; handle field values, setting them if applicable otherwise clearing them
        (if (and id values (pos? (count (filter identity values))))
          (field-values/save-field-values! id values)
          (field-values/clear-field-values! id))))

    ;; Keep track of how old the cache is on these fields
    #_(db/update-where! field/Field {:table_id        table-id ;;  :TODO fix this
                                   :visibility_type [:not= "retired"]}
      :last_cached (u/new-sql-timestamp))))

(defn cache-field-values-for-table!
  "Save the field values for each field in this database"
  [table]
  (cache-table-data-shape! (->> table
                                table/database
                                :id
                                driver/database-id->driver)
                           table))

(defn cache-data-shape-for-tables!
  "Perform in-depth analysis on the data shape for all `Tables` in a given DATABASE.
   This is dependent on what each database driver supports, but includes things like cardinality testing and table row counting.
   The bulk of the work is done by the `(analyze-table ...)` function on the IDriver protocol."
  [driver {database-id :id, :as database}]
  (log/info (u/format-color 'blue "Analyzing data in %s database '%s' (this may take a while) ..."
              (name driver) (:name database)))

  (let [start-time-ns         (System/nanoTime)
        tables                (db/select table/Table, :db_id database-id, :active true, :visibility_type nil)
        tables-count          (count tables)
        finished-tables-count (atom 0)]
    (doseq [{table-name :name, :as table} tables]
      (try
        (cache-table-data-shape! driver table)
        (catch Throwable t
          (log/error "Unexpected error analyzing table" t))
        (finally
          (u/prog1 (swap! finished-tables-count inc)
            (log/info (u/format-color 'blue "%s Analyzed table '%s'." (u/emoji-progress-bar <> tables-count) table-name))))))

    (log/info (u/format-color 'blue "Analysis of %s database '%s' completed (%s)."
                (name driver) (:name database) (u/format-nanoseconds (- (System/nanoTime) start-time-ns))))))

(defn cache-field-values-for-database!
  "Save the field values for each field of each table in this database"
  [db]
  (cache-data-shape-for-tables! (->> db
                                     :id
                                     driver/database-id->driver)
                                db))
