(ns metabase-enterprise.library-branching.instance.kinds.collection
  "The app DB side of the kind `:collection`."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(defn read-collections
  "`{identity item}` of the items of `ids`."
  [_ids]
  {})

(def kind-store
  "The `KindStore` of the kind `:collection`."
  (reify instance/KindStore
    (read-all [_ ids] (read-collections ids))
    (current [_ _id] (instance/not-yet! `instance/current))
    (write! [_ _content] (instance/not-yet! `instance/write!))
    (trash! [_ _id] (instance/not-yet! `instance/trash!))))
