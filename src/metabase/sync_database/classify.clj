(ns metabase.sync-database.classify
  (:require [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [metabase.models.field-values :as field-values]
            [metabase.util :as u]
            [metabase.sync-database.infer-special-type :as infer-special-type]))

(def ^:private ^:const ^Float percent-valid-url-threshold
  "Fields that have at least this percent of values that are valid URLs should be given a special type of `:type/URL`."
  0.95)

(def ^:const ^Integer low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be given a special type of `:type/Category`."
  300)

(def ^:private ^:const ^Integer average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)
;; save point: trying to remove driver references from here.
#_(defn test-for-cardinality? trying to move this into cached-values
  "Should FIELD should be tested for cardinality?"
  [fingerprint field-stats #_is-new?]
  (or (field-values/field-should-have-field-values? (assoc fingerprint :special_type (:special_type field-stats)))
      (and (nil? (:special_type fingerprint))
           #_is-new? ;; do we actually want to test for this here?
           (not (isa? (:base_type fingerprint) :type/DateTime))
           (not (isa? (:base_type fingerprint) :type/Collection))
           (not (= (:base_type fingerprint) :type/*)))))

(defn- test:category-type
  "When no initial guess of the special type, based on the fields name, was found 
   and the field has less than `low-cardinality-threshold`
 default to :type/Category"
  ;; this used to only apply to new fields and that was removed in refactor, does that break things
  [{:keys [base_type visibility_type name is-fk? is-pk?] :as fingerprint} {:keys [special-type] :as field-stats}]
  (if (and (not is-fk?) (not is-pk? )
           (nil? (:special-type field-stats))
           (< 0 (:cardinality fingerprint) low-cardinality-threshold)
           (field-values/field-should-have-field-values? {:base_type base_type
                                                          :special_type special-type
                                                          :visibility_type visibility_type
                                                          :name name}))
    (assoc field-stats :special-type :type/Category)
    field-stats))

(defn- test:no-preview-display
  "If FIELD's is textual and its average length is too great, mark it so it isn't displayed in the UI."
  [fingerprint field-stats]
  (if-not (and (= :normal (:visibility_type fingerprint))
               (isa? (:base_type fingerprint) :type/Text))
    ;; this field isn't suited for this test
    field-stats
    ;; test for avg length
    (let [avg-len (:field-avg-length fingerprint)]
      (if-not (and avg-len (> avg-len average-length-no-preview-threshold))
        field-stats
        (do
          (log/debug (u/format-color 'green "Field '%s' has an average length of %d. Not displaying it in previews." (:qualified-name fingerprint) avg-len))
          (assoc field-stats :preview-display false))))))

(defn- test:url-special-type
  "If FIELD is texual, doesn't have a `special_type`, and its non-nil values are primarily URLs, mark it as `special_type` `:type/URL`."
  [fingerprint field-stats]
  (if-not (and (not (:special_type field-stats))
               (isa? (:base_type fingerprint) :type/Text))
    ;; this field isn't suited for this test
    field-stats
    ;; test for url values
    (let [percent-urls (:field-percent-urls fingerprint)]
      (if-not (and (float? percent-urls)
                   (>= percent-urls 0.0)
                   (<= percent-urls 100.0)
                   (> percent-urls percent-valid-url-threshold))
        field-stats
        (do
          (log/debug (u/format-color 'green "Field '%s' is %d%% URLs. Marking it as a URL." (:qualified-name fingerprint) (int (math/round (* 100 percent-urls)))))
          (assoc field-stats :special-type :url))))))


(defn- test:json-special-type
  "Mark FIELD as `:json` if it's textual, doesn't already have a special type, the majority of it's values are non-nil, and all of its non-nil values
   are valid serialized JSON dictionaries or arrays."
  [fingerprint field-stats]
  (if (or (:special_type field-stats)
          (not (isa? (:base_type fingerprint) :type/Text)))
    ;; this field isn't suited for this test
    field-stats
    ;; check for json values
    (if-not (= 100 (:field-percent-json fingerprint))
      field-stats
      (do
        (log/debug (u/format-color 'green "Field '%s' looks like it contains valid JSON objects. Setting special_type to :type/SerializedJSON." (:qualified-name fingerprint)))
        (assoc field-stats :special-type :type/SerializedJSON, :preview-display false)))))

(defn- test:email-special-type
  "Mark FIELD as `:email` if it's textual, doesn't already have a special type, the majority of it's values are non-nil, and all of its non-nil values
   are valid emails."
  [fingerprint field-stats]
  (if (or (:special_type field-stats) ;; check if this is being assigned in the correct order
          (not (isa? (:base_type fingerprint) :type/Text)))
    ;; this field isn't suited for this test
    field-stats
    ;; check for emails
    (if-not (= (:field-percent-email fingerprint) 100)
      field-stats
      (do
        (log/debug (u/format-color 'green "Field '%s' looks like it contains valid email addresses. Setting special_type to :type/Email." (:qualified-name fingerprint)))
        (assoc field-stats :special-type :type/Email, :preview-display true)))))

(defn- test:initial-guess
  "make an initial guess based on the name and base type.
   this used to be part of collecting field values"
  [fingerprint field-stats]
  (if-let [guessed-initial-type (infer-special-type/infer-field-special-type (:name fingerprint) (:base_type fingerprint))]
    (assoc field-stats :special-type guessed-initial-type)
    field-stats))

(defn- test:primary-key
  "if a field is a primary key, it's special type must be :type/PK"
  [fingerprint field-stats]
  (if (:is-pk? fingerprint)
    (assoc field-stats :special-type :type/PK)
    field-stats))

(defn- test:foreign-key
  "if a field is a foreign key, it's special type must be :type/FK"
  [fingerprint field-stats]
  (if (:is-fk? fingerprint)
    (assoc field-stats :special-type :type/FK)
    field-stats))

(defn- test:new-field
  "Do the various tests that should only be done for a new `Field`.
   We only run most of the field analysis work when the field is NEW in order to favor performance of the sync process."
  [fingerprint field-stats]
  (->> field-stats
       (test:initial-guess      fingerprint)
       (test:no-preview-display fingerprint)
       (test:url-special-type   fingerprint)
       (test:json-special-type  fingerprint)
       (test:email-special-type fingerprint)
       (test:category-type      fingerprint)
       (test:primary-key        fingerprint)
       (test:foreign-key        fingerprint)))

(defn classify-table! [table-fingerprint field-fingerprints]
  ""
  {:row_count (:row_count table-fingerprint)
   :fields (map #(test:new-field % {:id (:id %)}) field-fingerprints)}
  #_(let [new-field? #_FIXME true #_(contains? new-field-ids id)]
        (cond->> {:id id}
          (test-for-cardinality? field new-field?) (test:cardinality-and-extract-field-values field)
          new-field?                               (test:new-field driver field))))
