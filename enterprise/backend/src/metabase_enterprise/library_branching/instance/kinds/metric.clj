(ns metabase-enterprise.library-branching.instance.kinds.metric
  "The app DB side of the kind `:metric`."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(defn read-metrics
  "`{identity item}` of the items of `ids`."
  [_ids]
  {})

(def kind-store
  "The `KindStore` of the kind `:metric`."
  (reify instance/KindStore
    (read-all [_ ids] (read-metrics ids))
    (current [_ _id] (instance/not-yet! `instance/current))
    (write! [_ _content] (instance/not-yet! `instance/write!))
    (trash! [_ _id] (instance/not-yet! `instance/trash!))))
