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
            [metabase.sync-database.interface :as i]
            [schema.core :as schema]
            [toucan.db :as db]))

(def ^:private ^:const ^Float percent-valid-url-threshold
  "Fields that have at least this percent of values that are valid URLs should be given a special type of `:type/URL`."
  0.95)

(def ^:private ^:const ^Integer low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be given a special type of `:type/Category`."
  300)

(def ^:private ^:const ^Integer field-values-entry-max-length
  "The maximum character length for a stored `FieldValues` entry."
  100)

(def ^:private ^:const ^Integer field-values-total-max-length
  "Maximum total length for a FieldValues entry (combined length of all values for the field)."
  (* low-cardinality-threshold field-values-entry-max-length))

(def ^:private ^:const ^Integer average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)


(defn table-row-count
  "Determine the count of rows in TABLE by running a simple structured MBQL query."
  [table]
  {:pre [(integer? (:id table))]}
  (try
    (queries/table-row-count table)
    (catch Throwable e
      (log/error (u/format-color 'red "Unable to determine row count for '%s': %s\n%s" (:name table) (.getMessage e) (u/pprint-to-str (u/filtered-stacktrace e)))))))

(defn test-for-cardinality?
  "Should FIELD should be tested for cardinality?"
  [field is-new?]
  (or (field-values/field-should-have-field-values? field)
      (and (nil? (:special_type field))
           is-new?
           (not (isa? (:base_type field) :type/DateTime))
           (not (isa? (:base_type field) :type/Collection))
           (not (= (:base_type field) :type/*)))))

(defn- field-values-below-low-cardinality-threshold? [non-nil-values]
  (and (<= (count non-nil-values) low-cardinality-threshold)
      ;; very simple check to see if total length of field-values exceeds (total values * max per value)
       (let [total-length (reduce + (map (comp count str) non-nil-values))]
         (<= total-length field-values-total-max-length))))

(defn test:cardinality-and-extract-field-values
  "Extract field-values for FIELD.  If number of values exceeds `low-cardinality-threshold` then we return an empty set of values."
  [field field-stats]
  ;; TODO: we need some way of marking a field as not allowing field-values so that we can skip this work if it's not appropriate
  ;;       for example, :type/Category fields with more than MAX values don't need to be rescanned all the time
  (let [non-nil-values  (filter identity (queries/field-distinct-values field (inc low-cardinality-threshold)))
        ;; only return the list if we didn't exceed our MAX values and if the the total character count of our values is reasable (#2332)
        distinct-values (when (field-values-below-low-cardinality-threshold? non-nil-values)
                          non-nil-values)]
    (cond-> (assoc field-stats :values distinct-values)
      (and (nil? (:special_type field))
           (pos? (count distinct-values))) (assoc :special-type :type/Category))))

(defn- test:no-preview-display
  "If FIELD's is textual and its average length is too great, mark it so it isn't displayed in the UI."
  [driver field field-stats]
  (if-not (and (= :normal (:visibility_type field))
               (isa? (:base_type field) :type/Text))
    ;; this field isn't suited for this test
    field-stats
    ;; test for avg length
    (let [avg-len (u/try-apply (:field-avg-length driver) field)]
      (if-not (and avg-len (> avg-len average-length-no-preview-threshold))
        field-stats
        (do
          (log/debug (u/format-color 'green "Field '%s' has an average length of %d. Not displaying it in previews." (field/qualified-name field) avg-len))
          (assoc field-stats :preview-display false))))))

(defn- test:url-special-type
  "If FIELD is texual, doesn't have a `special_type`, and its non-nil values are primarily URLs, mark it as `special_type` `:type/URL`."
  [driver field field-stats]
  (if-not (and (not (:special_type field))
               (isa? (:base_type field) :type/Text))
    ;; this field isn't suited for this test
    field-stats
    ;; test for url values
    (let [percent-urls (u/try-apply (:field-percent-urls driver) field)]
      (if-not (and (float? percent-urls)
                   (>= percent-urls 0.0)
                   (<= percent-urls 100.0)
                   (> percent-urls percent-valid-url-threshold))
        field-stats
        (do
          (log/debug (u/format-color 'green "Field '%s' is %d%% URLs. Marking it as a URL." (field/qualified-name field) (int (math/round (* 100 percent-urls)))))
          (assoc field-stats :special-type :url))))))

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

(defn- test:json-special-type
  "Mark FIELD as `:json` if it's textual, doesn't already have a special type, the majority of it's values are non-nil, and all of its non-nil values
   are valid serialized JSON dictionaries or arrays."
  [driver field field-stats]
  (if (or (:special_type field)
          (not (isa? (:base_type field) :type/Text)))
    ;; this field isn't suited for this test
    field-stats
    ;; check for json values
    (if-not (values-are-valid-json? (take driver/max-sync-lazy-seq-results (driver/field-values-lazy-seq driver field)))
      field-stats
      (do
        (log/debug (u/format-color 'green "Field '%s' looks like it contains valid JSON objects. Setting special_type to :type/SerializedJSON." (field/qualified-name field)))
        (assoc field-stats :special-type :type/SerializedJSON, :preview-display false)))))

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

(defn- test:email-special-type
  "Mark FIELD as `:email` if it's textual, doesn't already have a special type, the majority of it's values are non-nil, and all of its non-nil values
   are valid emails."
  [driver field field-stats]
  (if (or (:special_type field)
          (not (isa? (:base_type field) :type/Text)))
    ;; this field isn't suited for this test
    field-stats
    ;; check for emails
    (if-not (values-are-valid-emails? (take driver/max-sync-lazy-seq-results (driver/field-values-lazy-seq driver field)))
      field-stats
      (do
        (log/debug (u/format-color 'green "Field '%s' looks like it contains valid email addresses. Setting special_type to :type/Email." (field/qualified-name field)))
        (assoc field-stats :special-type :type/Email, :preview-display true)))))

(defn- test:new-field
  "Do the various tests that should only be done for a new `Field`.
   We only run most of the field analysis work when the field is NEW in order to favor performance of the sync process."
  [driver field field-stats]
  (->> field-stats
       (test:no-preview-display driver field)
       (test:url-special-type   driver field)
       (test:json-special-type  driver field)
       (test:email-special-type driver field)))

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
    (let [driver (assoc driver :field-avg-length field-avg-length-fn, :field-percent-urls field-percent-urls-fn)]
      {:row_count (when calculate-row-count? (u/try-apply table-row-count table))
       :fields    (for [{:keys [id] :as field} (table/fields table)]
                    (let [new-field? (contains? new-field-ids id)]
                      (cond->> {:id id}
                               (test-for-cardinality? field new-field?) (test:cardinality-and-extract-field-values field)
                               new-field?                               (test:new-field driver field))))})))

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
