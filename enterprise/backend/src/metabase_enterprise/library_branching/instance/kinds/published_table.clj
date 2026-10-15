(ns metabase-enterprise.library-branching.instance.kinds.published-table
  "The app DB side of the kind `:published-table`."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(defn read-published-tables
  "`{identity item}` of the items of `ids`."
  [_ids]
  {})

(def kind-store
  "The `KindStore` of the kind `:published-table`."
  (reify instance/KindStore
    (read-all [_ ids] (read-published-tables ids))
    (current [_ _id] (instance/not-yet! `instance/current))
    (write! [_ _content] (instance/not-yet! `instance/write!))
    (trash! [_ _id] (instance/not-yet! `instance/trash!))))
