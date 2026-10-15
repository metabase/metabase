(ns metabase-enterprise.library-branching.discard
  "Not built yet: the discard of the local changes of a creation instance.")

(set! *warn-on-reflection* true)

(defn discard!
  "Not built yet."
  ([inst store branch]
   (discard! inst store branch {}))
  ([_inst _store _branch _opts]
   (throw (ex-info "Not built yet." {}))))
