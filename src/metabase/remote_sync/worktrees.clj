(ns metabase.remote-sync.worktrees
  "Remote sync worktrees, which the enterprise remote sync module keeps."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.remote-sync.spec :as remote-sync.spec]))

(set! *warn-on-reflection* true)

(defenterprise worktree-exists?
  "Whether the remote sync worktree with `worktree-id` exists, which none does without the `:remote-sync` feature."
  metabase-enterprise.remote-sync.db
  [_worktree-id]
  false)

(defn ensure-built-ins!
  "Creates the built-in rows the remote sync worktree this thread works in lacks, of every model whose spec has
  `:ensure-built-ins`."
  []
  (doseq [model (keys (dissoc (methods remote-sync.spec/spec) :default))
          :let  [ensure! (:ensure-built-ins (remote-sync.spec/spec model))]
          :when ensure!]
    (ensure!)))
