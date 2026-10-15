(ns metabase-enterprise.library-branching.instance.kinds.metric
  "The app DB side of the kind `:metric` (the cards of type metric), in the item form of `format.kinds.metric`."
  (:require
   [metabase-enterprise.library-branching.instance.kinds.card :as card]))

(set! *warn-on-reflection* true)

(def kind-store
  "The `KindStore` of metrics."
  (card/kind-store :metric))
