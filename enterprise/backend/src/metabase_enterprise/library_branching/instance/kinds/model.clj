(ns metabase-enterprise.library-branching.instance.kinds.model
  "The app DB side of the kind `:model` (the cards of type model), in the item form of `format.kinds.model`."
  (:require
   [metabase-enterprise.library-branching.instance.kinds.card :as card]))

(set! *warn-on-reflection* true)

(def kind-store
  "The `KindStore` of models."
  (card/kind-store :model))
