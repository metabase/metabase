(ns metabase.revisions.impl.transform
  (:require
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-columns-for-transform-revision
  #{:id :entity_id :created_at :updated_at})

(defmethod revision/serialize-instance :model/Transform
  ([instance]
   (revision/serialize-instance :model/Transform nil instance))
  ([_model _id instance]
   (apply dissoc instance excluded-columns-for-transform-revision)))
