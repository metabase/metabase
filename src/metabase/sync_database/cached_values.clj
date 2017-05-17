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
            [metabase.sync-database.classify :as classify]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;; Drivers use these to get field values
(defn table-row-count
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

;; was part of test:cardinality-extract-field-values
(defn extract-field-values
  "Extract field-values for FIELD.  If number of values exceeds `low-cardinality-threshold` then we return an empty set of values."
  [field field-stats]
  ;; TODO: we need some way of marking a field as not allowing field-values so that we can skip this work if it's not appropriate
  ;;       for example, :type/Category fields with more than MAX values don't need to be rescanned all the time
  (let [collecting-field-values-is-allowed? (field-values/field-should-have-field-values? field)
        non-nil-values  (when collecting-field-values-is-allowed?
                          (filter identity (queries/field-distinct-values field (inc classify/low-cardinality-threshold))))
        ;; only return the list if we didn't exceed our MAX values and if the the total character count of our values is reasable (#2332)
        distinct-values (when (field-values-below-low-cardinality-threshold? non-nil-values)
                          non-nil-values)]
    (assoc field-stats :values distinct-values)))

;; TODO - It's weird that this one function requires other functions as args when the whole rest of the Metabase driver system
;;        is built around protocols and record types. These functions should be put back in the `IDriver` protocol (where they
;;        were originally) or in a special `IAnalyzeTable` protocol).
(defn make-analyze-table
  "Make a generic implementation of `analyze-table`."
  {:style/indent 1}
  [driver & {:keys [field-avg-length-fn field-percent-urls-fn calculate-row-count?]
             :or   {field-avg-length-fn   (partial driver/default-field-avg-length driver)
                    field-percent-urls-fn (partial driver/default-field-percent-urls driver)
                    calculate-row-count?  true}}]
  (fn [driver table new-field-ids]
    (let [fingerprint {:field-avg-length field-avg-length-fn,
                       :field-percent-urls field-percent-urls-fn}]
      {:row_count (when calculate-row-count? (u/try-apply table-row-count table))
       :fields    (for [id new-field-ids]
                    (extract-field-values id {:id id}))
       #_(classify/classify-table driver table fingerprint)})))

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
        ;; set Field metadata we may have detected
        (log/error (u/format-color 'red (with-out-str (clojure.pprint/pprint {;:special-type special-type
                                                                              :values values}))))
        ;; handle field values, setting them if applicable otherwise clearing them
        (if (and id values (pos? (count (filter identity values))))
          (field-values/save-field-values! id values)
          (field-values/clear-field-values! id))))

    ;; Keep track of how old the cache is on these fields
    #_(db/update-where! field/Field {:table_id        table-id ;;  :TODO fix this
                                   :visibility_type [:not= "retired"]}
      :last_cached (u/new-sql-timestamp))))

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
