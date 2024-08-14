(ns metabase.sync.interface
  "Schemas and constants used by the sync code."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::DatabaseMetadataTable
  [:map {:closed true}
   [:name                                     ::lib.schema.common/non-blank-string]
   [:schema                                   [:maybe ::lib.schema.common/non-blank-string]]
   ;; for databases that store an estimated row count in system tables (e.g: postgres)
   [:estimated_row_count     {:optional true} [:maybe :int]]
   ;; for databases that support forcing query to include a filter (e.g: partitioned table on bigquery)
   [:database_require_filter {:optional true} [:maybe :boolean]]
   ;; `:description` in this case should be a column/remark on the Table, if there is one.
   [:description             {:optional true} [:maybe :string]]])

(def DatabaseMetadataTable
  "Schema for the expected output of `describe-database` for a Table."
  [:ref ::DatabaseMetadataTable])

(mr/def ::DatabaseMetadata
  [:map
   [:tables [:set DatabaseMetadataTable]]
   [:version {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(def DatabaseMetadata
  "Schema for the expected output of `describe-database`."
  [:ref ::DatabaseMetadata])

(mr/def ::TableMetadataField
  [:map
   [:name              ::lib.schema.common/non-blank-string]
   [:database-type     [:maybe ::lib.schema.common/non-blank-string]] ; blank if the Field is all NULL & untyped, i.e. in Mongo
   [:base-type         ::lib.schema.common/base-type]
   [:database-position ::lib.schema.common/int-greater-than-or-equal-to-zero]
   [:position                   {:optional true} ::lib.schema.common/int-greater-than-or-equal-to-zero]
   [:semantic-type              {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
   [:effective-type             {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:coercion-strategy          {:optional true} [:maybe ms/CoercionStrategy]]
   [:field-comment              {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:pk?                        {:optional true} :boolean] ; optional for databases that don't support PKs
   [:nested-fields              {:optional true} [:set [:ref ::TableMetadataField]]]
   [:json-unfolding             {:optional true} :boolean]
   [:nfc-path                   {:optional true} [:any]]
   [:custom                     {:optional true} :map]
   [:database-is-auto-increment {:optional true} :boolean]
   ;; nullable for databases that don't support field partition
   [:database-partitioned       {:optional true} [:maybe :boolean]]
   [:database-required          {:optional true} :boolean]])

(def TableMetadataField
  "Schema for a given Field as provided in [[metabase.driver/describe-table]]."
  [:ref ::TableMetadataField])

(mr/def ::TableIndexMetadata
  [:set
   [:and
    [:map
     [:type [:enum :normal-column-index :nested-column-index]]]
    [:multi {:dispatch :type}
     [:normal-column-index [:map [:value ::lib.schema.common/non-blank-string]]]
     [:nested-column-index [:map [:value [:sequential ::lib.schema.common/non-blank-string]]]]]]])

(def TableIndexMetadata
  "Schema for a given Table as provided in [[metabase.driver/describe-table-indexes]]."
  [:ref ::TableIndexMetadata])

(mr/def ::FieldMetadataEntry
  (-> (mr/schema ::TableMetadataField)
      (mut/assoc :table-schema [:maybe ::lib.schema.common/non-blank-string])
      (mut/assoc :table-name   ::lib.schema.common/non-blank-string)))

(def FieldMetadataEntry
  "Schema for an item in the expected output of [[metabase.driver/describe-fields]]."
  [:ref ::FieldMetadataEntry])

;;; not actually used; leaving here for now because it serves as documentation
(comment
  (def NestedFCMetadata
    "Schema for the expected output of [[metabase.driver.sql-jdbc.sync/describe-nested-field-columns]]."
    [:maybe [:set TableMetadataField]]))

(mr/def ::TableFKMetadataEntry
  [:map
   [:fk-column-name   ::lib.schema.common/non-blank-string]
   [:dest-table       [:map
                       [:name   ::lib.schema.common/non-blank-string]
                       [:schema [:maybe ::lib.schema.common/non-blank-string]]]]
   [:dest-column-name ::lib.schema.common/non-blank-string]])

(def TableFKMetadataEntry
  "Schema for an individual entry in `FKMetadata`."
  [:ref ::TableFKMetadataEntry])

(mr/def ::FKMetadataEntry
  [:map
   [:fk-table-name    ::lib.schema.common/non-blank-string]
   [:fk-table-schema  [:maybe ::lib.schema.common/non-blank-string]]
   [:fk-column-name   ::lib.schema.common/non-blank-string]
   [:pk-table-name    ::lib.schema.common/non-blank-string]
   [:pk-table-schema  [:maybe ::lib.schema.common/non-blank-string]]
   [:pk-column-name   ::lib.schema.common/non-blank-string]])

(def FKMetadataEntry
  "Schema for an entry in the expected output of [[metabase.driver/describe-fks]]."
  [:ref ::FKMetadataEntry])

;; These schemas are provided purely as conveniences since adding `:import` statements to get the corresponding
;; classes from the model namespaces also requires a `:require`, which `clj-refactor` seems more than happy to strip
;; out from the ns declaration when running `cljr-clean-ns`. Plus as a bonus in the future we could add additional
;; validations to these, e.g. requiring that a Field have a base_type

(mr/def ::no-kebab-case-keys (ms/MapWithNoKebabKeys))

(mr/def ::DatabaseInstance
  [:and
   (ms/InstanceOf :model/Database)
   ::no-kebab-case-keys])

(def DatabaseInstance
  "Schema for a valid instance of a Metabase Database."
  [:ref ::DatabaseInstance])

(mr/def ::TableInstance
  [:and
   (ms/InstanceOf :model/Table)
   ::no-kebab-case-keys])

(def TableInstance
  "Schema for a valid instance of a Metabase Table."
  [:ref ::TableInstance])

(mr/def ::FieldInstance
  [:and
   [:and
    (ms/InstanceOf :model/Field)
    ::no-kebab-case-keys]])

(def FieldInstance
  "Schema for a valid instance of a Metabase Field."
  [:ref ::FieldInstance])

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

(def ^:dynamic *fingerprint-version->types-that-should-be-re-fingerprinted*
  "Map of fingerprint version to the set of Field base types that need to be upgraded to this version the next
   time we do analysis. The highest-numbered entry is considered the latest version of fingerprints."
  {1 #{:type/*}
   2 #{:type/Number}
   3 #{:type/DateTime}
   4 #{:type/*}
   5 #{:type/Text}})

(def ^:dynamic ^Long *latest-fingerprint-version*
  "The newest (highest-numbered) version of our Field fingerprints."
  (apply max (keys *fingerprint-version->types-that-should-be-re-fingerprinted*)))
