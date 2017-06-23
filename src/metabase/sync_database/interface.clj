(ns metabase.sync-database.interface
  "Schemas describing the output expected from different DB sync functions."
  (:require [metabase.util.schema :as su]
            [schema.core :as s]))

(def AnalyzeTable
  "Schema for the expected output of `analyze-table`."
  {(s/optional-key :row_count) (s/maybe s/Int)
   (s/optional-key :fields)    [{:id                               su/IntGreaterThanZero
                                 (s/optional-key :special-type)    su/FieldType
                                 (s/optional-key :preview-display) s/Bool
                                 (s/optional-key :values)          [s/Any]}]})

(def DescribeDatabase
  "Schema for the expected output of `describe-database`."
  {:tables #{{:name   s/Str
              :schema (s/maybe s/Str)}}})

(def DescribeTableField
  "Schema for a given Field as provided in `describe-table` or `analyze-table`."
  {:name                           su/NonBlankString
   :base-type                      su/FieldType
   (s/optional-key :special-type)  su/FieldType
   (s/optional-key :pk?)           s/Bool
   (s/optional-key :nested-fields) #{(s/recursive #'DescribeTableField)}
   (s/optional-key :custom)        {s/Any s/Any}})

(def DescribeTable
  "Schema for the expected output of `describe-table`."
  {:name   su/NonBlankString
   :schema (s/maybe su/NonBlankString)
   :fields #{DescribeTableField}})

(def DescribeTableFKs
  "Schema for the expected output of `describe-table-fks`."
  (s/maybe #{{:fk-column-name   su/NonBlankString
              :dest-table       {:name   su/NonBlankString
                                 :schema (s/maybe su/NonBlankString)}
              :dest-column-name su/NonBlankString}}))
