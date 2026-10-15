(ns metabase-enterprise.library-branching.instance.kinds.dashboard
  "The app DB side of the kind `:dashboard`. Not implemented yet."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(def kind-store
  "The `KindStore` of dashboards. Not implemented yet."
  (reify
    instance/KindStore
    (read-all [_ _ids] {})
    (read-models [_] #{:model/Dashboard :model/Collection})
    (current [_ _id] nil)
    (write! [_ _id _item] (instance/not-yet! "write! of a dashboard"))
    (trash! [_ _id] (instance/not-yet! "trash! of a dashboard"))))
