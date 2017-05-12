(ns metabase.sync-database.analyze
  "Functions which handle the in-depth data shape analysis portion of the sync process."
  (:require [cheshire.core :as json]
            [clojure.math.numeric-tower :as math]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.metadata-queries :as queries]
            [metabase.models
             [field :as field]
             [field-values :as field-values]
             [table :as table]]
            [metabase.sync-database
             [classify :as classify]
             [interface :as i]]
            [schema.core :as schema]
            [toucan.db :as db]))


(defn table-row-count
  "Determine the count of rows in TABLE by running a simple structured MBQL query."
  [table]
  {:pre [(integer? (:id table))]}
  (try
    (queries/table-row-count table)
    (catch Throwable e
      (log/error (u/format-color 'red "Unable to determine row count for '%s': %s\n%s" (:name table) (.getMessage e) (u/pprint-to-str (u/filtered-stacktrace e)))))))


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
       :fields    (classify/classify-table driver table fingerprint)})))

(defn generic-analyze-table
  "An implementation of `analyze-table` using the defaults (`default-field-avg-length` and `field-percent-urls`)."
  [driver table new-field-ids]
  ((make-analyze-table driver) driver table new-field-ids))



(defn analyze-table-data-shape!
  "Analyze the data shape for a single `Table`."
  [driver {table-id :id, :as table}]
  (let [new-field-ids (db/select-ids field/Field, :table_id table-id, :visibility_type [:not= "retired"], :last_analyzed nil)]
    ;; TODO: this call should include the database
    (when-let [table-stats (u/prog1 (driver/analyze-table driver table new-field-ids)
                             (when <>
                               (schema/validate i/AnalyzeTable <>)))]
      ;; update table row count
      (when (:row_count table-stats)
        (db/update! table/Table table-id, :rows (:row_count table-stats)))

      ;; update individual fields
      (doseq [{:keys [id preview-display special-type values]} (:fields table-stats)]
        ;; set Field metadata we may have detected
        (when (and id (or preview-display special-type))
          (db/update-non-nil-keys! field/Field id
            ;; if a field marked `preview-display` as false then set the visibility type to `:details-only` (see models.field/visibility-types)
            :visibility_type (when (false? preview-display) :details-only)
            :special_type    special-type))
        ;; handle field values, setting them if applicable otherwise clearing them
        (if (and id values (pos? (count (filter identity values))))
          (field-values/save-field-values! id values)
          (field-values/clear-field-values! id))))

    ;; update :last_analyzed for all fields in the table
    (db/update-where! field/Field {:table_id        table-id
                                   :visibility_type [:not= "retired"]}
      :last_analyzed (u/new-sql-timestamp))))

(defn analyze-data-shape-for-tables!
  "Perform in-depth analysis on the data shape for all `Tables` in a given DATABASE.
   This is dependent on what each database driver supports, but includes things like cardinality testing and table row counting.
   The bulk of the work is done by the `(analyze-table ...)` function on the IDriver protocol."
  [driver {database-id :id, :as database}]
  (log/info (u/format-color 'blue "Analyzing data in %s database '%s' (this may take a while) ..." (name driver) (:name database)))

  (let [start-time-ns         (System/nanoTime)
        tables                (db/select table/Table, :db_id database-id, :active true, :visibility_type nil)
        tables-count          (count tables)
        finished-tables-count (atom 0)]
    (doseq [{table-name :name, :as table} tables]
      (try
        (analyze-table-data-shape! driver table)
        (catch Throwable t
          (log/error "Unexpected error analyzing table" t))
        (finally
          (u/prog1 (swap! finished-tables-count inc)
            (log/info (u/format-color 'blue "%s Analyzed table '%s'." (u/emoji-progress-bar <> tables-count) table-name))))))

    (log/info (u/format-color 'blue "Analysis of %s database '%s' completed (%s)." (name driver) (:name database) (u/format-nanoseconds (- (System/nanoTime) start-time-ns))))))
