(ns metabase.lib.field.util
  "Some small field-related helper functions which are used from a few different namespaces."
  (:require
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(mu/defn inherited-column? :- :boolean
  [column :- ::lib.schema.metadata/column]
  (#{:source/card :source/native :source/previous-stage} (:lib/source column)))
