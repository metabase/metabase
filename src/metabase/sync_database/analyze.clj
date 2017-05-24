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
            [toucan.db :as db]
            [metabase.sync-database.cached-values :as cached-values]))


(defn- values-are-valid-json?
  "`true` if at every item in VALUES is `nil` or a valid string-encoded JSON dictionary or array, and at least one of those is non-nil."
  [values]
  (try
    (loop [at-least-one-non-nil-value? false, [val & more] values]
      (cond
        (and (not val)
             (not (seq more))) at-least-one-non-nil-value?
        (s/blank? val)         (recur at-least-one-non-nil-value? more)
        ;; If val is non-nil, check that it's a JSON dictionary or array. We don't want to mark Fields containing other
        ;; types of valid JSON values as :json (e.g. a string representation of a number or boolean)
        :else                  (do (u/prog1 (json/parse-string val)
                                     (assert (or (map? <>)
                                                 (sequential? <>))))
                                   (recur true more))))
    (catch Throwable _
      false)))

(defn- values-are-valid-emails?
  "`true` if at every item in VALUES is `nil` or a valid email, and at least one of those is non-nil."
  [values]
  (try
    (loop [at-least-one-non-nil-value? false, [val & more] values]
      (cond
        (and (not val)
             (not (seq more))) at-least-one-non-nil-value?
        (s/blank? val)         (recur at-least-one-non-nil-value? more)
        ;; If val is non-nil, check that it's a JSON dictionary or array. We don't want to mark Fields containing other
        ;; types of valid JSON values as :json (e.g. a string representation of a number or boolean)
        :else                  (do (assert (u/is-email? val))
                                   (recur true more))))
    (catch Throwable _
      false)))

(defn- percent-valid-urls
  "Recursively count the values of non-nil values in VS that are valid URLs, and return it as a percentage."
  [vs]
  (loop [valid-count 0, non-nil-count 0, [v & more :as vs] vs]
    (cond (not (seq vs)) (if (zero? non-nil-count) 0.0
                             (float (/ valid-count non-nil-count)))
          (nil? v)       (recur valid-count non-nil-count more)
          :else          (let [valid? (and (string? v)
                                           (u/is-url? v))]
                           (recur (if valid? (inc valid-count) valid-count)
                                  (inc non-nil-count)
                                  more)))))

(defn field-avg-length
  "Default implementation of optional driver fn `field-avg-length` that calculates the average length in Clojure-land via `field-values-lazy-seq`."
  [values]
  (let [field-values       (filter identity values)
        field-values-count (count field-values)]
    (if (zero? field-values-count)
      0
      (int (math/round (/ (->> field-values
                               (map str)
                               (map count)
                               (reduce +))
                          field-values-count))))))

(defn field-fingerprint [driver table field]
  (let [values (->> (driver/field-values-lazy-seq driver field)
                    (take driver/max-sync-lazy-seq-results))]
    {:base_type               (:base_type field)
     :cardinality             (count (distinct values))
     :field-percent-urls      (percent-valid-urls values)
     :field-percent-json      (if (values-are-valid-json? values) 100 0)
     :field-percent-email     (if (values-are-valid-emails? values) 100 0)
     :field-avg-length        (field-avg-length values)
     :id                      (:id field)
     :name                    (:name field)
     :qualified-name          (field/qualified-name field)
     :visibility_type         (:visibility_type field)}))


(defn table-fingerprint [table]
  {:rows (:rows table)}) ;; check this



(defn analyze-table-data-shape!
  "Analyze the data shape for a single `Table`."
  [driver {table-id :id, :as table}]
  (let [fields (table/fields table)
        field-fingerprints (map #(field-fingerprint driver table %) fields)
        table-fingerprint (table-fingerprint table)]
    ;; this will be moved to classify.clj once the fingerprint format is settled
    (when-let [table-stats (u/prog1 (classify/classify-table! table-fingerprint field-fingerprints) ;; this is here temporarily
                             (when <>
                               (schema/validate i/AnalyzeTable <>)))]
      (doseq [{:keys [id preview-display special-type]} (:fields table-stats)]
        ;; set Field metadata we may have detected
        (when (and id (or preview-display special-type))
          (db/update-non-nil-keys! field/Field id
            ;; if a field marked `preview-display` as false then set the visibility
            ;; type to `:details-only` (see models.field/visibility-types)
            :visibility_type (when (false? preview-display) :details-only)
            :special_type    special-type)))
      (db/update-where! field/Field {:table_id        table-id
                                     :visibility_type [:not= "retired"]}
      :last_analyzed (u/new-sql-timestamp))
      table-stats)))

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
        (cached-values/cache-table-data-shape! driver table)
        (analyze-table-data-shape! driver table)
        (catch Throwable t
          (log/error "Unexpected error analyzing table" t))
        (finally
          (u/prog1 (swap! finished-tables-count inc)
            (log/info (u/format-color 'blue "%s Analyzed table '%s'." (u/emoji-progress-bar <> tables-count) table-name))))))

    (log/info (u/format-color 'blue "Analysis of %s database '%s' completed (%s)." (name driver) (:name database) (u/format-nanoseconds (- (System/nanoTime) start-time-ns))))))
