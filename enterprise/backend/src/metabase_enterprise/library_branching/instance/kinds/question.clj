(ns metabase-enterprise.library-branching.instance.kinds.question
  "The app DB side of the kind `:question` (the cards of type question), in the item form of
  `format.kinds.question`."
  (:require
   [metabase-enterprise.library-branching.instance.kinds.card :as card]))

(set! *warn-on-reflection* true)

(def kind-store
  "The `KindStore` of questions."
  (card/kind-store :question))
