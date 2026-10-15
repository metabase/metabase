(ns metabase-enterprise.library-branching.instance.kinds.timeline
  "The app DB side of the kind `:timeline`. A stub: the tests of the kind come first."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(def kind-store
  "The `KindStore` of timelines."
  (reify instance/KindStore
    (read-all [_ _ids] {})
    (read-models [_] #{:model/Timeline})
    (current [_ _id] (instance/not-yet! "current"))
    (write! [_ _id _item] (instance/not-yet! "write!"))
    (trash! [_ _id] (instance/not-yet! "trash!"))))
