(ns metabase.sync-database.analyze
  "Functions which handle the in-depth data shape analysis portion of the sync process."
  (:require [cheshire.core :as json]
            [clojure.math.numeric-tower :as math]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [field :as field]
             [field-fingerprint :refer [FieldFingerprint]]
             [table :as table]
             [table-fingerprint :refer [TableFingerprint]]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.sync-database.classify :as classify]
            [toucan.db :as db]))

(defn- table-row-count
  "Determine the count of rows in TABLE by running a simple structured MBQL query."
  [table]
  {:pre [(integer? (:id table))]}
  (try
    (metadata-queries/table-row-count table)
    (catch Throwable e
      (log/error (u/format-color 'red "Unable to determine row count for '%s': %s\n%s" (:name table) (.getMessage e) (u/pprint-to-str (u/filtered-stacktrace e)))))))

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
  (let [values      (->> (driver/field-values-lazy-seq driver field)
                         (take driver/max-sync-lazy-seq-results))
        field-id    (:id field)
        fingerprint {:base_type               (:base_type field)
                     :is_pk                   (isa? (:special_type field) :type/PK)
                     :is_fk                   (isa? (:special_type field) :type/FK)
                     :cardinality             (count (distinct values))
                     :field_percent_urls      (percent-valid-urls values)
                     :field_percent_json      (if (values-are-valid-json? values) 100 0)
                     :field_percent_email     (if (values-are-valid-emails? values) 100 0)
                     :field_avg_length        (field-avg-length values)
                     :field_id                field-id
                     :table_id                (:id table)
                     :name                    (:name field)
                     :qualified_name          (field/qualified-name field)
                     :visibility_type         (:visibility_type field)}]
    (log/debug (u/format-color 'green "generated fingerprint for field: %s (%s):%s" field-id (:name field) fingerprint))
    fingerprint))

(defn- save-field-fingerprints!
  "store a sequence of fingerprints"
  [fingerprints]
  (doseq [fingerprint fingerprints]
    (let [fingerprint (-> fingerprint
                          (update :base_type u/keyword->qualified-name)
                          (update :visibility_type u/keyword->qualified-name))]
         (log/debug (u/format-color 'cyan "saving fingerprint for field: %s (%s):%s"
                      (:field_id fingerprint) (:name fingerprint) (keys fingerprint)))
         (or (db/update! FieldFingerprint {:where [:= :field_id (:field_id fingerprint)]
                                           :set fingerprint})
             (db/insert! FieldFingerprint fingerprint)))))

(defn- table-fingerprint
  "generate a fingerprint for a table"
  [{:keys [rows id name] :as table}]
  {:rows     rows
   :table_id id
   :name     name})

(defn- save-table-fingerprint!
  "store the table fingerprint for a table
   field values are stored separately"
  [fingerprint]
  (or (db/update! TableFingerprint {:where [:= :table_id (:table_id fingerprint)]
                                    :set fingerprint})
      (db/insert! TableFingerprint fingerprint)))

(defn analyze-table-data-shape!
  "Analyze the data shape for a single `Table`."
  [driver {table-id :id, :as table}]
  (let [fields (table/fields table)
        rows (table-row-count table)
        field-fingerprints (map #(field-fingerprint driver table %) fields)
        table-fingerprint (table-fingerprint table)]
    (db/update! table/Table table-id :rows rows)
    (save-field-fingerprints! field-fingerprints)
    (save-table-fingerprint! table-fingerprint)))

(defn analyze-table
  "analyze only one table"
  [table]
  (analyze-table-data-shape! (->> table
                                  table/database
                                  :id
                                  driver/database-id->driver)
                             table))

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
        #_(cached-values/cache-table-data-shape! driver table)
        (analyze-table-data-shape! driver table)
        (catch Throwable t
          (log/error "Unexpected error analyzing table" t))
        (finally
          (u/prog1 (swap! finished-tables-count inc)
            (log/info (u/format-color 'blue "%s Analyzed table '%s'." (u/emoji-progress-bar <> tables-count) table-name))))))

    (log/info (u/format-color 'blue "Analysis of %s database '%s' completed (%s)." (name driver) (:name database) (u/format-nanoseconds (- (System/nanoTime) start-time-ns))))))

(defn analyze-database
  "analyze all the tables in one database"
  [db]
  (analyze-data-shape-for-tables! (->> db
                                       :id
                                       driver/database-id->driver)
                                  db))
