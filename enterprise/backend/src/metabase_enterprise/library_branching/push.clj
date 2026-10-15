(ns metabase-enterprise.library-branching.push
  "The push: the synced snapshot of an instance as a new commit on its branch.")

(set! *warn-on-reflection* true)

(defn push!
  "Pushes the synced snapshot of instance `inst` to branch `branch` of `store`. Not implemented yet."
  ([inst store branch]
   (push! inst store branch {}))
  ([_inst _store _branch _opts]
   (throw (ex-info "The push is not implemented yet." {}))))
