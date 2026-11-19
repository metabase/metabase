(ns metabase.comments.audit
  "What the audit spec of a Comment needs beyond its columns."
  (:require
   [metabase.util.events :as u.events]))

(set! *warn-on-reflection* true)

(defn update-topic
  "The topic to store for the update `event` of a Comment, which is the deletion of it when it sets its deletion time."
  [event]
  (if (u.events/changed? event :deleted_at)
    :comment-delete
    :comment-update))
