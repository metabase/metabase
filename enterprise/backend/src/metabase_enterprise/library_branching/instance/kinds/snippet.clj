(ns metabase-enterprise.library-branching.instance.kinds.snippet
  "The app DB side of the kind `:snippet`."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(defn read-snippets
  "`{identity item}` of the items of `ids`."
  [_ids]
  {})

(def kind-store
  "The `KindStore` of the kind `:snippet`."
  (reify instance/KindStore
    (read-all [_ ids] (read-snippets ids))
    (current [_ _id] (instance/not-yet! `instance/current))
    (write! [_ _content] (instance/not-yet! `instance/write!))
    (trash! [_ _id] (instance/not-yet! `instance/trash!))))
