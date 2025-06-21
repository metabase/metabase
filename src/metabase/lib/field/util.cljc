(ns metabase.lib.field.util
  "Some small field-related helper functions which are used from a few different namespaces."
  (:require
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn inherited-column? :- :boolean
  "Is the `column` coming directly from a card, a native query, or a previous query stage?"
  [column :- [:map
              [:lib/source {:optional true} ::lib.schema.metadata/column-source]]]
  (some? (#{:source/card :source/native :source/previous-stage} (:lib/source column))))

(mu/defn inherited-column-name :- [:maybe :string]
  "If the field ref for this `column` should be name-based, returns the name used in the field ref."
  [column :- ::lib.schema.metadata/column]
  (when (inherited-column? column)
    ((some-fn
      ;; broken field refs never use `:lib/desired-column-alias`.
      (case lib.ref/*ref-style*
        :ref.style/default                  :lib/desired-column-alias
        :ref.style/broken-legacy-qp-results (constantly nil))
      :lib/deduplicated-name
      :lib/original-name
      :name)
     column)))

(mu/defn add-deduplicated-names :- [:sequential
                                    [:merge
                                     ::lib.schema.metadata/column
                                     [:map
                                      [:lib/deduplicated-name :string]]]]
  "Add `:lib/original-name` and `:lib/deduplicated-name` to columns if they don't already have them."
  [cols :- [:sequential ::lib.schema.metadata/column]]
  (let [deduplicated-name-fn (lib.util/non-truncating-unique-name-generator)]
    (mapv (if (every? :lib/deduplicated-name cols)
            ;; just double-check that they're deduplicated.
            (fn [col]
              (update col :lib/deduplicated-name deduplicated-name-fn))
            (fn [col]
              (let [original-name ((some-fn :lib/original-name :name) col)]
                (assoc col
                       :lib/original-name     original-name
                       :lib/deduplicated-name (deduplicated-name-fn (:name col))))))
          cols)))
