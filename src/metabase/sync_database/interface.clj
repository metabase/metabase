(ns metabase.sync-database.interface
  (:require [schema.core :as schema]
            [metabase.models.field :as field]))


(def AnalyzeTable
  "Schema for the expected output of `analyze-table`."
  {(schema/optional-key :row_count) (schema/maybe schema/Int)
   (schema/optional-key :fields)    [{:id                                    schema/Int
                                      (schema/optional-key :special-type)    (apply schema/enum field/special-types)
                                      (schema/optional-key :preview-display) schema/Bool
                                      (schema/optional-key :values)          [schema/Any]}]})

(def DescribeDatabase
  "Schema for the expected output of `describe-database`."
  {:tables #{{:name   schema/Str
              :schema (schema/maybe schema/Str)}}})

(def DescribeTableField
  "Schema for a given Field as provided in `describe-table` or `analyze-table`."
  {:name                                  schema/Str
   :base-type                             (apply schema/enum field/base-types)
   (schema/optional-key :field-type)      (apply schema/enum field/field-types)
   (schema/optional-key :special-type)    (apply schema/enum field/special-types)
   (schema/optional-key :pk?)             schema/Bool
   (schema/optional-key :nested-fields)   #{(schema/recursive #'DescribeTableField)}
   (schema/optional-key :custom)          {schema/Any schema/Any}})

(def DescribeTable
  "Schema for the expected output of `describe-table`."
  {:name   schema/Str
   :schema (schema/maybe schema/Str)
   :fields #{DescribeTableField}})

(def DescribeTableFKs
  "Schema for the expected output of `describe-table-fks`."
  #{{:fk-column-name   schema/Str
     :dest-table       {:name   schema/Str
                        :schema (schema/maybe schema/Str)}
     :dest-column-name schema/Str}})
