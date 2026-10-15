(ns metabase-enterprise.library-branching.format.kinds.segment
  "The codec of the kind :segment: a saved filter of a published table, as the file `<name>.segment.yaml` in the
  directory of its table. The place is the table, under `table`. The definition is one MBQL stage on that table with
  at least one filter and no other clause, as Metabase requires of a segment."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.format.kinds.table-item :as table-item]
   [metabase-enterprise.library-branching.registry :as registry]))

(set! *warn-on-reflection* true)

(defn filters?
  "True iff the stage of `definition` has filters and no other clause."
  [definition]
  (and (table-item/stage-keys? #{:filters} definition)
       (let [filters (:filters (table-item/stage definition))]
         (and (vector? filters) (seq filters)))))

(def spec
  "The spec of the segment codec. The archive column is not an attribute (scope), nor are the table id (the place)
  and the bookkeeping columns."
  (table-item/spec :segment "segment"
                   {:description             {:schema :string}
                    :points_of_interest      {:schema :string}
                    :caveats                 {:schema :string}
                    :show_in_getting_started {:schema :boolean :default false}
                    :definition              {:schema ::table-item/definition :required? true}}
                   [[:fn {:error/message "a segment's definition has filters and no other clause"}
                     (comp #'filters? :definition :attrs)]]))

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :segment."
  (common/codec spec ::item))
