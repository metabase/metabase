(ns metabase.revisions.impl.exploration
  (:require
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-columns-for-exploration-revision
  #{:id
    :entity_id
    :creator_id
    :created_at
    :updated_at
    :archived_directly})

(defmethod revision/serialize-instance :model/Exploration
  ([instance]
   (revision/serialize-instance :model/Exploration nil instance))
  ([_model _id instance]
   (apply dissoc instance excluded-columns-for-exploration-revision)))
