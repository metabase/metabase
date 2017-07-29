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
