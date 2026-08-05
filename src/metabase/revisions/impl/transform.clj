(ns metabase.revisions.impl.transform
  (:require
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-columns-for-transform-revision
  ;; which worktree a transform belongs to is fixed at creation, so a revision can neither describe nor revert it
  #{:id :entity_id :created_at :updated_at :creator :creator_id :can_read :can_write :can_execute :worktree_id})

(defmethod revision/serialize-instance :model/Transform [_model _id instance]
  (apply dissoc instance excluded-columns-for-transform-revision))
