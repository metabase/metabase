(ns metabase-enterprise.library-branching.engine.count
  "The count of a snapshot by kind.")

(set! *warn-on-reflection* true)

(defn count-by-kind
  "Not built yet."
  ([s] (count-by-kind s #{}))
  ([_s _kinds] {}))
