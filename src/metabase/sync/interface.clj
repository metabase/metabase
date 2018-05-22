(ns metabase.sync.interface
  "Schemas and constants used by the sync code."
  (:require [clj-time.core :as time]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.util :as u]
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
   :database-type                  su/NonBlankString
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

(def TimeZoneId
  "Schema predicate ensuring a valid time zone string"
  (s/pred (fn [tz-str]
            (u/ignore-exceptions (time/time-zone-for-id tz-str)))
          'time/time-zone-for-id))

;; These schemas are provided purely as conveniences since adding `:import` statements to get the corresponding
;; classes from the model namespaces also requires a `:require`, which `clj-refactor` seems more than happy to strip
;; out from the ns declaration when running `cljr-clean-ns`. Plus as a bonus in the future we could add additional
;; validations to these, e.g. requiring that a Field have a base_type

(def DatabaseInstance "Schema for a valid instance of a Metabase Database." (class Database))
(def TableInstance    "Schema for a valid instance of a Metabase Table."    (class Table))
(def FieldInstance    "Schema for a valid instance of a Metabase Field."    (class Field))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            SAMPLING & FINGERPRINTS                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(def FieldSample
  "Schema for a sample of values returned by the `sample` sub-stage of analysis and passed into the `fingerprint`
   stage. Guaranteed to be non-empty and non-nil."
  ;; Validating against this is actually pretty quick, in the order of microseconds even for a 10,000 value sequence
  (s/constrained [(s/pred (complement nil?))] seq "Non-empty sequence of non-nil values."))

(def TableSample
  "Schema for a sample of values of certain Fields for a TABLE. This should basically just be a sequence of rows where
   each row is a sequence of values in the same order as the Fields passed in (basically the format you get from JDBC
   when `:as-arrays?` is `false`).

   e.g. if Fields passed in were `ID` and `Name` the Table sample should look something like:

     [[1 \"Rasta Toucan\"]
      [2 \"Lucky Pigeon\"]
      [3 \"Kanye Nest\"]]"
  [[s/Any]])


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

(def DateTimeFingerprint
  "Schema for fingerprint information for Fields deriving from `:type/DateTime`."
  {(s/optional-key :earliest) s/Str
   (s/optional-key :latest)   s/Str})

(def TypeSpecificFingerprint
  "Schema for type-specific fingerprint information."
  (s/constrained
   {(s/optional-key :type/Number)   NumberFingerprint
    (s/optional-key :type/Text)     TextFingerprint
    (s/optional-key :type/DateTime) DateTimeFingerprint}
   (fn [m]
     (= 1 (count (keys m))))
   "Type-specific fingerprint with exactly one key"))

(def Fingerprint
  "Schema for a Field 'fingerprint' generated as part of the analysis stage. Used to power the 'classification'
   sub-stage of analysis. Stored as the `fingerprint` column of Field."
  {(s/optional-key :global)       GlobalFingerprint
   (s/optional-key :type)         TypeSpecificFingerprint
   (s/optional-key :experimental) {s/Keyword s/Any}})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             FINGERPRINT VERSIONING                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Occasionally we want to update the schema of our Field fingerprints and add new logic to populate the additional
;; keys. However, by default, analysis (which includes fingerprinting) only runs on *NEW* Fields, meaning *EXISTING*
;; Fields won't get new fingerprints with the updated info.
;;
;; To work around this, we can use a versioning system. Fields whose Fingerprint's version is lower than the current
;; version should get updated during the next sync/analysis regardless of whether they are or are not new Fields.
;; However, this could be quite inefficient: if we add a new fingerprint field for `:type/Number` Fields, why should
;; we re-fingerprint `:type/Text` Fields? Ideally, we'd only re-fingerprint the numeric Fields.
;;
;; Thus, our implementation below. Each new fingerprint version lists a set of types that should be upgraded to it.
;; Our fingerprinting logic will calculate whether a fingerprint needs to be recalculated based on its version and the
;; changes that have been made in subsequent versions. Only the Fields that would benefit from the new Fingerprint
;; info need be re-fingerprinted.
;;
;; Thus, if Fingerprint v2 contains some new info for numeric Fields, only Fields that derive from `:type/Number` need
;; be upgraded to v2. Textual Fields with a v1 fingerprint can stay at v1 for the time being. Later, if we introduce a
;; v3 that includes new "global" fingerprint info, both the v2-fingerprinted numeric Fields and the v1-fingerprinted
;; textual Fields can be upgraded to v3.

(def fingerprint-version->types-that-should-be-re-fingerprinted
  "Map of fingerprint version to the set of Field base types that need to be upgraded to this version the next
   time we do analysis. The highest-numbered entry is considered the latest version of fingerprints."
  {1 #{:type/*}
   2 #{:type/DateTime}})

(def latest-fingerprint-version
  "The newest (highest-numbered) version of our Field fingerprints."
  (apply max (keys fingerprint-version->types-that-should-be-re-fingerprinted)))
