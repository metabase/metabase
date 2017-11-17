(ns metabase.sync.analyze.classifiers.name
  "Classifier that infers the special type of a Field based on its name and base type."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.models.field :refer [Field]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private bool-or-int-type #{:type/Boolean :type/Integer})
(def ^:private float-type       #{:type/Float})
(def ^:private int-or-text-type #{:type/Integer :type/Text})
(def ^:private text-type        #{:type/Text})

(def ^:private pattern+base-types+special-type
  "Tuples of `[name-pattern set-of-valid-base-types special-type]`.
   Fields whose name matches the pattern and one of the base types should be given the special type.

   *  Convert field name to lowercase before matching against a pattern
   *  Consider a nil set-of-valid-base-types to mean \"match any base type\""
  [[#"^.*_lat$"       float-type       :type/Latitude]
   [#"^.*_lon$"       float-type       :type/Longitude]
   [#"^.*_lng$"       float-type       :type/Longitude]
   [#"^.*_long$"      float-type       :type/Longitude]
   [#"^.*_longitude$" float-type       :type/Longitude]
   [#"^.*_rating$"    int-or-text-type :type/Category]
   [#"^.*_type$"      int-or-text-type :type/Category]
   [#"^.*_url$"       text-type        :type/URL]
   [#"^_latitude$"    float-type       :type/Latitude]
   [#"^active$"       bool-or-int-type :type/Category]
   [#"^city$"         text-type        :type/City]
   [#"^country$"      text-type        :type/Country]
   [#"^countryCode$"  text-type        :type/Country]
   [#"^currency$"     int-or-text-type :type/Category]
   [#"^first_name$"   text-type        :type/Name]
   [#"^full_name$"    text-type        :type/Name]
   [#"^gender$"       int-or-text-type :type/Category]
   [#"^last_name$"    text-type        :type/Name]
   [#"^lat$"          float-type       :type/Latitude]
   [#"^latitude$"     float-type       :type/Latitude]
   [#"^lon$"          float-type       :type/Longitude]
   [#"^lng$"          float-type       :type/Longitude]
   [#"^long$"         float-type       :type/Longitude]
   [#"^longitude$"    float-type       :type/Longitude]
   [#"^name$"         text-type        :type/Name]
   [#"^postalCode$"   int-or-text-type :type/ZipCode]
   [#"^postal_code$"  int-or-text-type :type/ZipCode]
   [#"^rating$"       int-or-text-type :type/Category]
   [#"^role$"         int-or-text-type :type/Category]
   [#"^sex$"          int-or-text-type :type/Category]
   [#"^state$"        text-type        :type/State]
   [#"^status$"       int-or-text-type :type/Category]
   [#"^type$"         int-or-text-type :type/Category]
   [#"^url$"          text-type        :type/URL]
   [#"^zip_code$"     int-or-text-type :type/ZipCode]
   [#"^zipcode$"      int-or-text-type :type/ZipCode]])

;; Check that all the pattern tuples are valid
(when-not config/is-prod?
  (doseq [[name-pattern base-types special-type] pattern+base-types+special-type]
    (assert (instance? java.util.regex.Pattern name-pattern))
    (assert (every? (u/rpartial isa? :type/*) base-types))
    (assert (isa? special-type :type/*))))


(s/defn ^:private ^:always-validate special-type-for-name-and-base-type :- (s/maybe su/FieldType)
  "If `name` and `base-type` matches a known pattern, return the `special_type` we should assign to it."
  [field-name :- su/NonBlankString, base-type :- su/FieldType]
  (or (when (= "id" (str/lower-case field-name)) :type/PK)
      (some (fn [[name-pattern valid-base-types special-type]]
              (when (and (some (partial isa? base-type) valid-base-types)
                         (re-matches name-pattern (str/lower-case field-name)))
                special-type))
            pattern+base-types+special-type)))

(s/defn ^:always-validate infer-special-type :- (s/maybe i/FieldInstance)
  "Classifer that infers the special type of a FIELD based on its name and base type."
  [field :- i/FieldInstance, _ :- (s/maybe i/Fingerprint)]
  (when-let [inferred-special-type (special-type-for-name-and-base-type (:name field) (:base_type field))]
    (log/debug (format "Based on the name of %s, we're giving it a special type of %s."
                       (sync-util/name-for-logging field)
                       inferred-special-type))
    (assoc field :special_type inferred-special-type)))
