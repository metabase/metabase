(ns metabase-enterprise.library-branching.instance.kinds.segment
  "The app DB side of the kind `:segment`, in the item form of `format.kinds.segment`: the segments of the published
  tables of the Library."
  (:require
   [metabase-enterprise.library-branching.format.kinds.segment :as format.segment]
   [metabase-enterprise.library-branching.instance.kinds.table-item :as table-item]))

(set! *warn-on-reflection* true)

(def kind
  "The table item kind of segments."
  {:kind :segment :model :model/Segment :serdes "Segment" :spec format.segment/spec})

(def kind-store
  "The `KindStore` of segments."
  (table-item/kind-store kind))
