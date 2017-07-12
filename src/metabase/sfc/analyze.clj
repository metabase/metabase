(ns metabase.sfc.analyze
  "Functions which handle the in-depth data shape analysis portion of the sync process."
  (:require [cheshire.core :as json]
            [clojure.math.numeric-tower :as math]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.models
             [field :as field]
             [field-fingerprint :refer [FieldFingerprint]]
             [table :as table]
             [table-fingerprint :refer [TableFingerprint]]]
            [metabase.sfc.util :as sync-util]
            [toucan.db :as db]))

(defn- table-row-count
  "Determine the count of rows in TABLE by running a simple structured MBQL query."
  [table]
  {:pre [(integer? (:id table))]}
  (try
    (metadata-queries/table-row-count table)
    (catch Throwable e
      (log/warn (u/format-color 'red "Unable to determine row count for '%s': %s\n%s" (:name table) (.getMessage e) (u/pprint-to-str (u/filtered-stacktrace e)))))))

(defn- value-is-valid-json?
 "If val is non-nil, check that it's a JSON dictionary or array. We don't want to mark Fields containing other
  types of valid JSON values as :json (e.g. a string representation of a number or boolean)"
  [value]
  (u/ignore-exceptions
    (if (and value (not (s/blank? value)))
      (let [json-val (json/parse-string value)]
        (or (map? json-val)
            (sequential? json-val)))
      false)))

(defn- value-is-valid-email?
  "`true` if this looks somewhat like an email address"
  [value]
  (u/ignore-exceptions
    (u/is-email? value)))

(defn- percent-match
  "Return the percentage of VALUES that satisfy PREDICATE."
  [predicate values]
  (if-let [non-nil-values (remove nil? values)]
    (if (seq non-nil-values)
      (as-> non-nil-values x
        (filter predicate x)
        (count x)
        (/ x (count non-nil-values))
        (* x 100)
        (int x))
      0)
    0))

(def ^:private percent-json  (partial percent-match value-is-valid-json?))
(def ^:private percent-email (partial percent-match value-is-valid-email?))

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
  "Calculate the average length of all the non-nil strings in a sequence of VALUES."
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
        fingerprint {:base_type           (:base_type field)
                     :is_pk               (isa? (:special_type field) :type/PK)
                     :is_fk               (isa? (:special_type field) :type/FK)
                     :cardinality         (count (distinct values))
                     :field_percent_urls  (percent-valid-urls values)
                     :field_percent_json  (percent-json values)
                     :field_percent_email (percent-email values)
                     :field_avg_length    (field-avg-length values)
                     :field_id            field-id
                     :table_id            (:id table)
                     :name                (:name field)
                     :qualified_name      (field/qualified-name field)
                     :visibility_type     (:visibility_type field)}]
    (log/trace (u/format-color 'green "generated fingerprint for field: %s (%s):%s" field-id (:name field) fingerprint))
    fingerprint))

(defn- save-field-fingerprints!
  "store a sequence of fingerprints"
  [fingerprints]
  (doseq [fingerprint fingerprints]
    (let [fingerprint (-> fingerprint
                          (update :base_type u/keyword->qualified-name)
                          (update :visibility_type u/keyword->qualified-name))]
         (log/trace (u/format-color 'cyan "saving fingerprint for field: %s (%s):%s"
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
                                    :set   fingerprint})
      (db/insert! TableFingerprint fingerprint)))

(defn analyze-table-data-shape!
  "Analyze the data shape for a single `Table`."
  ([table]
   (analyze-table-data-shape! (driver/database-id->driver (:db_id table)) table))
  ([driver {table-id :id, :as table}]
   (let [fields             (table/fields table)
         rows               (table-row-count table)
         field-fingerprints (map (partial field-fingerprint driver table) fields)
         table-fingerprint  (table-fingerprint table)]
     (db/update! table/Table table-id :rows rows)
     (save-field-fingerprints! field-fingerprints)
     (save-table-fingerprint! table-fingerprint))))

(defn analyze-database!
  "Perform in-depth analysis on the data shape for all `Tables` in a given DATABASE.
   This is dependent on what each database driver supports, but includes things like cardinality testing and table row counting."
  [{database-id :id, :as database}]
  (let [driver (driver/database-id->driver database-id)]
    (sync-util/with-start-and-finish-logging (format "Analyze data in %s database '%s'" (name driver) (:name database))
      (let [tables (sync-util/db->sfc-tables database-id)]
        (sync-util/with-emoji-progress-bar [emoji-progress-bar (count tables)]
          (doseq [{table-name :name, :as table} tables]
            (try
              (analyze-table-data-shape! driver table)
              (catch Throwable t
                (log/error "Unexpected error analyzing table" t))
              (finally
                (log/info (u/format-color 'blue "%s Analyzed table '%s'." (emoji-progress-bar) table-name))))))))))
