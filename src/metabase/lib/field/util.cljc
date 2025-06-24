(ns metabase.lib.field.util
  "Some small field-related helper functions which are used from a few different namespaces."
  (:require
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(mu/defn inherited-column? :- :boolean
  "Is the `column` coming directly from a card, a native query, or a previous query stage?"
  [column :- ::lib.schema.metadata/column]
  (some? (#{:source/card :source/native :source/previous-stage} (:lib/source column))))

(mu/defn inherited-column-name :- [:maybe :string]
  "If the field ref for this `column` should be name-based, returns the name used in the field ref."
  [column :- ::lib.schema.metadata/column]
  (when (inherited-column? column)
    ((some-fn :lib/desired-column-alias :name) column)))
