(ns metabase.sfc.classify.infer-special-type
  (:require [clojure.string :as s]
            [metabase
             [config :as config]
             [util :as u]]))

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
