(ns metabase.lib.field.util
  "Some small field-related helper functions which are used from a few different namespaces."
  (:require
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

;;; TODO (Cam 6/24/25) -- this is fundamentally broken -- see QUE-1375
(mu/defn inherited-column? :- :boolean
  "Is the `column` coming directly from a card, a native query, or a previous query stage?"
  [column :- [:map
              [:lib/source {:optional true} ::lib.schema.metadata/column-source]]]
  (some? (#{:source/card :source/native :source/previous-stage} (:lib/source column))))

(defn FIXED-inherited-column?
  "Attempt at working around QUE-1375 until we can actually fix it the right way."
  [query stage-number column]
  (or
   (inherited-column? column)
   ;; if a column's source is `:source/fields` or `:source/breakouts`, that means it either came from the previous
   ;; stage, or the source table or a join in this stage. So we can determine if it was from the previous stage if
   ;;
   ;; 1. there is a previous stage, and
   ;;
   ;; 2. if it (incorrectly) has a join alias, that join is in a previous stage
   (when (#{:source/fields :source/breakouts} (:lib/source column))
     (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
       (let [join-alias (:metabase.lib.join/join-alias column)]
         (or (not join-alias)
             (loop [previous-stage-number previous-stage-number]
               (or (some (fn [join]
                           (= (:alias join) join-alias))
                         (:joins (lib.util/query-stage query previous-stage-number)))
                   (when-let [previous-stage-number' (lib.util/previous-stage-number query previous-stage-number)]
                     (recur previous-stage-number'))))))))))

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
