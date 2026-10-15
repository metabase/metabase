(ns metabase-enterprise.library-branching.branch
  "The creation of a branch of the repository, with no instance: a compare-and-swap of a ref that must not exist.")

(set! *warn-on-reflection* true)

(defn create-branch!
  "Creates branch `branch-name` of `store` at the head of branch `from`. Not implemented yet."
  ([store branch-name from]
   (create-branch! store branch-name from {}))
  ([_store _branch-name _from _opts]
   (throw (ex-info "Not implemented yet." {}))))
