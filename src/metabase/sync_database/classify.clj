(ns metabase.sync-database.classify
  (:require [cheshire.core :as json]
            [clojure.math.numeric-tower :as math]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.models.field-values :as field-values]
            [metabase.util :as u]
            [metabase.config :as config]))

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
(defn test-for-cardinality?
  "Should FIELD should be tested for cardinality?"
  [fingerprint field-stats #_is-new?]
  (or (field-values/field-should-have-field-values? (assoc fingerprint :special_type (:special_type field-stats)))
      (and (nil? (:special_type fingerprint))
           #_is-new? ;; do we actually want to test for this here?
           (not (isa? (:base_type fingerprint) :type/DateTime))
           (not (isa? (:base_type fingerprint) :type/Collection))
           (not (= (:base_type fingerprint) :type/*)))))

(defn- test:category-special-type
  "fields wtih less than low-cardinality-threshold default to :type/Category"
  ;; this used to only apply to new fields and that was removed in refactor, does that break things
  [fingerprint field-stats]
  (cond-> field-stats
    (and (test-for-cardinality? fingerprint field-stats)
         (nil? (:special_type fingerprint))
         (pos? (count (:values fingerprint)))) (assoc :special-type :type/Category)))

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

(defn- test:new-field
  "Do the various tests that should only be done for a new `Field`.
   We only run most of the field analysis work when the field is NEW in order to favor performance of the sync process."
  [fingerprint field-stats]
  (->> field-stats
       (test:category-special-type fingerprint)
       (test:no-preview-display    fingerprint)
       (test:url-special-type      fingerprint)
       (test:json-special-type     fingerprint)
       (test:email-special-type    fingerprint)))

(defn classify-table! [table-fingerprint field-fingerprints]
  ""
  {:row_count (:row_count table-fingerprint)
   :fields (map #(test:new-field % {:id (:id %)}) field-fingerprints)}
  #_(let [new-field? #_FIXME true #_(contains? new-field-ids id)]
        (cond->> {:id id}
          (test-for-cardinality? field new-field?) (test:cardinality-and-extract-field-values field)
          new-field?                               (test:new-field driver field))))


;;; ------------------------------------------------------------ Sync Util Type Inference Fns ------------------------------------------------------------

(def ^:private ^:const pattern+base-types+special-type
  "Tuples of `[name-pattern set-of-valid-base-types special-type]`.
   Fields whose name matches the pattern and one of the base types should be given the special type.

   *  Convert field name to lowercase before matching against a pattern
   *  Consider a nil set-of-valid-base-types to mean \"match any base type\""
  (let [bool-or-int #{:type/Boolean :type/Integer}
        float       #{:type/Float}
        int-or-text #{:type/Integer :type/Text}
        text        #{:type/Text}]
    [[#"^.*_lat$"       float       :type/Latitude]
     [#"^.*_lon$"       float       :type/Longitude]
     [#"^.*_lng$"       float       :type/Longitude]
     [#"^.*_long$"      float       :type/Longitude]
     [#"^.*_longitude$" float       :type/Longitude]
     [#"^.*_rating$"    int-or-text :type/Category]
     [#"^.*_type$"      int-or-text :type/Category]
     [#"^.*_url$"       text        :type/URL]
     [#"^_latitude$"    float       :type/Latitude]
     [#"^active$"       bool-or-int :type/Category]
     [#"^city$"         text        :type/City]
     [#"^country$"      text        :type/Country]
     [#"^countryCode$"  text        :type/Country]
     [#"^currency$"     int-or-text :type/Category]
     [#"^first_name$"   text        :type/Name]
     [#"^full_name$"    text        :type/Name]
     [#"^gender$"       int-or-text :type/Category]
     [#"^last_name$"    text        :type/Name]
     [#"^lat$"          float       :type/Latitude]
     [#"^latitude$"     float       :type/Latitude]
     [#"^lon$"          float       :type/Longitude]
     [#"^lng$"          float       :type/Longitude]
     [#"^long$"         float       :type/Longitude]
     [#"^longitude$"    float       :type/Longitude]
     [#"^name$"         text        :type/Name]
     [#"^postalCode$"   int-or-text :type/ZipCode]
     [#"^postal_code$"  int-or-text :type/ZipCode]
     [#"^rating$"       int-or-text :type/Category]
     [#"^role$"         int-or-text :type/Category]
     [#"^sex$"          int-or-text :type/Category]
     [#"^state$"        text        :type/State]
     [#"^status$"       int-or-text :type/Category]
     [#"^type$"         int-or-text :type/Category]
     [#"^url$"          text        :type/URL]
     [#"^zip_code$"     int-or-text :type/ZipCode]
     [#"^zipcode$"      int-or-text :type/ZipCode]]))

;; Check that all the pattern tuples are valid
(when-not config/is-prod?
  (doseq [[name-pattern base-types special-type] pattern+base-types+special-type]
    (assert (instance? java.util.regex.Pattern name-pattern))
    (assert (every? (u/rpartial isa? :type/*) base-types))
    (assert (isa? special-type :type/*))))

(defn infer-field-special-type
  "If `name` and `base-type` matches a known pattern, return the `special_type` we should assign to it."
  [field-name base-type]
  (when (and (string? field-name)
             (keyword? base-type))
    (or (when (= "id" (s/lower-case field-name)) :type/PK)
        (some (fn [[name-pattern valid-base-types special-type]]
                (when (and (some (partial isa? base-type) valid-base-types)
                           (re-matches name-pattern (s/lower-case field-name)))
                  special-type))
              pattern+base-types+special-type))))
