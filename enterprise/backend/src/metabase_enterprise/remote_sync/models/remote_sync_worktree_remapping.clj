(ns metabase-enterprise.remote-sync.models.remote-sync-worktree-remapping
  "Model for the entity_id remapping a worktree keeps.

  `entity_id` is globally unique, so a worktree cannot check an entity out under the id it has on the branch while
  the main app still holds a row with that id. Its copy gets an id of its own, and one row here pairs the two:
  `source_entity_id` is what the branch (and every serialized file) calls the entity, `target_entity_id` is the row
  this worktree checked it out into. Serdes reads the pair in both directions -- exports write the source id,
  imports resolve it back to the local row."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncWorktreeRemapping [_model] :remote_sync_worktree_remapping)

(doto :model/RemoteSyncWorktreeRemapping
  (derive :metabase/model))
