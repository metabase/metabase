(ns metabase.sync.analyze.special-types.values
  "Logic for inferring (and setting) the special types of fields based on tests done against a sequence of their values.
   Also sets `:preview_display` to `false` if a Field has on average very long text values."
  (:require [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.metadata-queries :as queries]
            [metabase.models
             [field :refer [Field]]
             [field-values :as field-values]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private Values
  "Schema for the VALUES passed to each of the functions below. *Guaranteed* to be non-nil and non-empty."
  ;; Validating against this is actually pretty quick, in the order of microseconds even for a 10,000 value sequence
  (s/constrained [(s/pred (complement nil?))] seq "Non-empty sequence of non-nil values."))

;;; ------------------------------------------------------------ No Preview Display ------------------------------------------------------------

(def ^:private ^:const ^Integer average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)

(s/defn ^:private ^:always-validate avg-length :- Double
  [values :- Values]
  (let [total-length (reduce + (for [value values]
                                 (count (str value))))]
    (/ (double total-length)
       (double (count values)))))

(s/defn ^:private ^:always-validate field-should-be-marked-no-preview-display? :- s/Bool
  "If FIELD's is textual and its average length is too great, mark it so it isn't displayed in the UI."
  [field :- i/FieldInstance, values :- Values]
  (boolean
   (and (isa? (:base_type field) :type/Text)
        (> (avg-length values) average-length-no-preview-threshold))))


;;; ------------------------------------------------------------ Predicate-based tests ------------------------------------------------------------

(def ^:private ^:const ^Float percent-valid-threshold
  "Fields that have at least this percent of values that are satisfy some predicate (such as `u/is-email?`)
   should be given the corresponding special type (such as `:type/Email`)."
  0.95)

(s/defn ^:private ^:always-validate percent-satisfying-predicate :- Double
  [pred :- (s/pred fn?), values :- Values]
  (let [total-count    (count values)
        pred           #(boolean (u/ignore-exceptions (pred %)))
        matching-count (count (get (group-by pred values) true []))]
    (/ (double matching-count)
       (double total-count))))

(s/defn ^:private ^:always-validate values-satisfy-predicate? :- s/Bool
  "True if enough VALUES satisfy PREDICATE that the field they belong to should be given the corresponding special type."
  [pred :- (s/pred fn?), field :- i/FieldInstance, values :- Values]
  (and (isa? (:base_type field) :type/Text)
       (>= (percent-satisfying-predicate pred values)
           percent-valid-threshold)))


(s/defn ^:private ^:always-validate test:url :- (s/maybe (s/eq :type/URL))
  "If FIELD is texual, doesn't have a `special_type`, and its non-nil values are primarily URLs, mark it as `special_type` `:type/URL`."
  [field :- i/FieldInstance, values :- Values]
  (when (values-satisfy-predicate? u/is-url? field values)
    :type/URL))


(defn- valid-serialized-json? [x]
  (boolean
   (when-let [parsed-json (json/parse-string x)]
     (or (map? parsed-json)
         (sequential? parsed-json)))))

(s/defn ^:private ^:always-validate test:json :- (s/maybe (s/eq :type/SerializedJSON))
  "Mark FIELD as `:json` if it's textual, doesn't already have a special type, the majority of it's values are non-nil, and all of its non-nil values
   are valid serialized JSON dictionaries or arrays."
  [field :- i/FieldInstance, values :- Values]
  (when (values-satisfy-predicate? valid-serialized-json? field values)
    :type/SerializedJSON))


(s/defn ^:private ^:always-validate test:email :- (s/maybe (s/eq :type/Email))
  "Mark FIELD as `:email` if it's textual, doesn't already have a special type, the majority of it's values are non-nil, and all of its non-nil values
   are valid emails."
  [field :- i/FieldInstance, values :- Values]
  (when (values-satisfy-predicate? u/is-email? field values)
    :type/Email))


;;; ------------------------------------------------------------ Category ------------------------------------------------------------

(derive :type/DateTime ::cannot-be-category)
(derive :type/Collection ::cannot-be-category)

(s/defn ^:private ^:always-validate test:category :- (s/maybe (s/eq :type/Category))
  [field :- i/FieldInstance, _]
  (when-not (isa? (:base_type field) ::cannot-be-category)
    (let [distinct-count (queries/field-distinct-count field field-values/low-cardinality-threshold)]
      (when (< distinct-count field-values/low-cardinality-threshold)
        (log/debug (format "%s has %d distinct values. Since that is less than %d, we're marking it as a category."
                           (sync-util/name-for-logging field)
                           distinct-count
                           field-values/low-cardinality-threshold))
        :type/Category))))


;;; ------------------------------------------------------------ Putting it all together ------------------------------------------------------------

(def ^:private test-fns
  "Various test functions, in the order the 'tests' against values should be ran.
   Each test function take two args, `field` and `values."
  [test:url
   test:json
   test:email
   test:category])

(s/defn ^:private ^:always-validate do-test :- (s/maybe su/FieldType)
  [field :- i/FieldInstance, values :- Values, test-fn :- (s/pred fn?)]
  (sync-util/with-error-handling (format "Error checking if values of %s match special-type" (sync-util/name-for-logging field))
    (u/prog1 (test-fn field values)
      (when (and <>
                 (not= <> :type/Category)) ; `test:category` has its own loggings
        (log/debug (format "Based on the values of %s, we're marking it as %s." (sync-util/name-for-logging field) <>))))))

(s/defn ^:private ^:always-validate infer-special-type :- (s/maybe su/FieldType)
  "Run each of the `test-fns` against FIELD and VALUES until one of the 'tests positive' and returns a special type to mark this Field as."
  [field :- i/FieldInstance, values :- Values]
  (some (partial do-test field values)
        test-fns))


(s/defn ^:private ^:always-validate field-values :- (s/maybe Values)
  "Procure a sequence of non-nil values, up to `max-sync-lazy-seq-results` (10,000 at the time of this writing), for use
   in the various tests above."
  [driver, field :- i/FieldInstance]
  (->> (driver/field-values-lazy-seq driver field)
       (take driver/max-sync-lazy-seq-results)
       (filter (complement nil?))
       seq))


(s/defn ^:private ^:always-validate infer-special-types-for-field!
  "Attempt to determine a valid special type for FIELD."
  [driver, field :- i/FieldInstance]
  (when-let [values (field-values driver field)]
    (if (sync-util/with-error-handling (format "Error checking if %s should be marked no preview display" (sync-util/name-for-logging field))
          (field-should-be-marked-no-preview-display? field values))
      ;; if field's values are too long on average, mark it 'no preview display' so it doesn't show up in results
      (db/update! Field (u/get-id field)
        :preview_display false)
      ;; otherwise if it's *not* no preview display, run the normal series of tests and see if it can have a nice special type
      (when-let [inferred-special-type (infer-special-type field values)]
        (db/update! Field (u/get-id field)
          :special_type inferred-special-type)))))


(s/defn ^:always-validate infer-special-types-by-value!
  "Infer (and set) the special types of all te FIELDS belonging to TABLE by looking at their values."
  [table :- i/TableInstance, fields :- [i/FieldInstance]]
  (let [driver (driver/->driver (:db_id table))]
    (doseq [field fields]
      (sync-util/with-error-handling (format "Error inferring special type by values for %s" (sync-util/name-for-logging field))
        (infer-special-types-for-field! driver field)))))
