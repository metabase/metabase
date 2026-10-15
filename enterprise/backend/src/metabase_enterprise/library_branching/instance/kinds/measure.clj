(ns metabase-enterprise.library-branching.instance.kinds.measure
  "The app DB side of the kind `:measure`, in the item form of `format.kinds.measure`: the measures of the published
  tables of the Library. Not content: the dimensions, which Metabase computes from the definition."
  (:require
   [metabase-enterprise.library-branching.format.kinds.measure :as format.measure]
   [metabase-enterprise.library-branching.instance.kinds.table-item :as table-item]))

(set! *warn-on-reflection* true)

(def kind
  "The table item kind of measures."
  {:kind :measure :model :model/Measure :serdes "Measure" :spec format.measure/spec})

(def kind-store
  "The `KindStore` of measures."
  (table-item/kind-store kind))
