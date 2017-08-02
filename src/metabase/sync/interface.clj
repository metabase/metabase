(ns metabase.sync.interface
  "Schemas and constants used by the sync code."
  (:require [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.util.schema :as su]
            [schema.core :as s]))


(def DatabaseMetadataTable
  "Schema for the expected output of `describe-database` for a Table."
  {:name   su/NonBlankString
   :schema (s/maybe su/NonBlankString)})

(def DatabaseMetadata
  "Schema for the expected output of `describe-database`."
  {:tables #{DatabaseMetadataTable}})


(def TableMetadataField
  "Schema for a given Field as provided in `describe-table`."
  {:name                           su/NonBlankString
   :base-type                      su/FieldType
   (s/optional-key :special-type)  (s/maybe su/FieldType)
   (s/optional-key :pk?)           s/Bool
   (s/optional-key :nested-fields) #{(s/recursive #'TableMetadataField)}
   (s/optional-key :custom)        {s/Any s/Any}})

(def TableMetadata
  "Schema for the expected output of `describe-table`."
  {:name   su/NonBlankString
   :schema (s/maybe su/NonBlankString)
   :fields #{TableMetadataField}})

(def FKMetadataEntry
  "Schema for an individual entry in `FKMetadata`."
  {:fk-column-name   su/NonBlankString
   :dest-table       {:name   su/NonBlankString
                      :schema (s/maybe su/NonBlankString)}
   :dest-column-name su/NonBlankString})

(def FKMetadata
  "Schema for the expected output of `describe-table-fks`."
  (s/maybe #{FKMetadataEntry}))

;; These schemas are provided purely as conveniences since adding `:import` statements to get the corresponding classes from the model namespaces
;; also requires a `:require`, which `clj-refactor` seems more than happy to strip out from the ns declaration when running `cljr-clean-ns`.
;; Plus as a bonus in the future we could add additional validations to these, e.g. requiring that a Field have a base_type

(def DatabaseInstance "Schema for a valid instance of a Metabase Database." (class Database))
(def TableInstance    "Schema for a valid instance of a Metabase Table."    (class Table))
(def FieldInstance    "Schema for a valid instance of a Metabase Field."    (class Field))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                SAMPLING & FINGERPRINTS                                                 |
;;; +------------------------------------------------------------------------------------------------------------------------+

(def ValuesSample
  "Schema for a sample of VALUES returned by the `sample` sub-stage of analysis and passed into the `fingerprint` stage.
   Guaranteed to be non-empty and non-nil."
  ;; Validating against this is actually pretty quick, in the order of microseconds even for a 10,000 value sequence
  (s/constrained [(s/pred (complement nil?))] seq "Non-empty sequence of non-nil values."))


(def GlobalFingerprint
  "Fingerprint values that Fields of all types should have."
  {(s/optional-key :distinct-count) s/Int})

(def Percent
  "Schema for something represting a percentage. A floating-point value between (inclusive) 0 and 1."
  (s/constrained s/Num #(<= 0 % 1) "Valid percentage between (inclusive) 0 and 1."))

(def NumberFingerprint
  "Schema for fingerprint information for Fields deriving from `:type/Number`."
  {(s/optional-key :min) s/Num
   (s/optional-key :max) s/Num
   (s/optional-key :avg) s/Num})

(def TextFingerprint
  "Schema for fingerprint information for Fields deriving from `:type/Text`."
  {(s/optional-key :percent-json)   Percent
   (s/optional-key :percent-url)    Percent
   (s/optional-key :percent-email)  Percent
   (s/optional-key :average-length) (s/constrained Double #(>= % 0) "Valid number greater than or equal to zero")})

(def TypeSpecificFingerprint
  "Schema for type-specific fingerprint information."
  (s/constrained
   {(s/optional-key :type/Number) NumberFingerprint
    (s/optional-key :type/Text)   TextFingerprint}
   (fn [m]
     (= 1 (count (keys m))))
   "Type-specific fingerprint with exactly one key"))

(def Fingerprint
  "Schema for a Field 'fingerprint' generated as part of the analysis stage. Used to power the 'classification' sub-stage of
   analysis. Stored as the `fingerprint` column of Field."
  {(s/optional-key :global)       GlobalFingerprint
   (s/optional-key :type)         TypeSpecificFingerprint
   (s/optional-key :experimental) {s/Keyword s/Any}})
