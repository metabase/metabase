(ns metabase-enterprise.library-branching.merge-branch
  "Merge-branch: a merge of one branch into another in git. Not implemented yet.")

(set! *warn-on-reflection* true)

(defn merge-branch!
  "Merges branch `from` into branch `into`. Not implemented yet."
  ([store into from]
   (merge-branch! store into from {}))
  ([_store _into _from _opts]
   (throw (ex-info "merge-branch! is not implemented yet." {}))))
