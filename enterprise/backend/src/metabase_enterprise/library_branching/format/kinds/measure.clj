(ns metabase-enterprise.library-branching.format.kinds.measure
  "The codec of the kind :measure: a saved aggregation of a published table, as the file `<name>.measure.yaml` in the
  directory of its table. The place is the table, under `table`. The definition is one MBQL stage on that table with
  exactly one aggregation, which uses no metric, and no other clause, as Metabase requires of a measure."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]
   [metabase-enterprise.library-branching.format.kinds.table-item :as table-item]
   [metabase-enterprise.library-branching.registry :as registry]))

(set! *warn-on-reflection* true)

(defn one-aggregation?
  "True iff the stage of `definition` has exactly one aggregation, which refers to no metric, and no other clause."
  [definition]
  (and (table-item/stage-keys? #{:aggregation} definition)
       (let [aggregation (:aggregation (table-item/stage definition))]
         (and (vector? aggregation)
              (= 1 (count aggregation))
              (not-any? (comp #{:metric} first) (portable/refs aggregation))))))

(def spec
  "The spec of the measure codec. The archive column is not an attribute (scope), nor are the table id (the place),
  the dimensions (Metabase computes them from the definition) and the bookkeeping columns."
  (table-item/spec :measure "measure"
                   {:description {:schema :string}
                    :definition  {:schema ::table-item/definition :required? true}}
                   [[:fn {:error/message "a measure's definition has one aggregation, with no metric, and no other clause"}
                     (comp #'one-aggregation? :definition :attrs)]]))

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :measure."
  (common/codec spec ::item))
