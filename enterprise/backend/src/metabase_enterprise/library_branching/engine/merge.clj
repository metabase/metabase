(ns metabase-enterprise.library-branching.engine.merge
  "The three-way merge of snapshots."
  (:refer-clojure :exclude [merge]))

(set! *warn-on-reflection* true)

(defn merge
  "Not built yet."
  ([b o t decisions] (merge b o t decisions {}))
  ([_b o _t _decisions _opts] {:ok o}))
