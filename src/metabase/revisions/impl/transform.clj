(ns metabase.revisions.impl.transform
  (:require
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-columns-for-transform-revision
  #{:id :entity_id :created_at :updated_at :creator :creator_id})

(defmethod revision/serialize-instance :model/Transform [_model _id instance]
  (apply dissoc instance excluded-columns-for-transform-revision))
