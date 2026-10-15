(ns metabase-enterprise.library-branching.instance.kinds.glossary
  "The app DB side of the kind `:glossary-term`. Not implemented yet."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(def kind-store
  "Not implemented yet."
  (reify instance/KindStore
    (read-all [_ _ids] (instance/not-yet! `instance/read-all))
    (current [_ _id] (instance/not-yet! `instance/current))
    (write! [_ _id _item] (instance/not-yet! `instance/write!))
    (trash! [_ _id] (instance/not-yet! `instance/trash!))))
