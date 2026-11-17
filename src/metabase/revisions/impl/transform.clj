(ns metabase.revisions.impl.transform
  (:require
   [metabase.models.interface :as mi]
   [metabase.revisions.models.revision :as revision]
   [toucan2.core :as t2]))

(def ^:private excluded-columns-for-transform-revision
  #{:id :entity_id :created_at :updated_at :creator :creator_id :can_read :can_write :can_execute})

(defmethod revision/serialize-instance :model/Transform [_model _id instance]
  (apply dissoc instance excluded-columns-for-transform-revision))

(defmethod revision/revisions-readable? :model/Transform
  [_model objects]
  ;; A transform is readable only to callers entitled to the source database it reads from, so each historical
  ;; revision is authorized against the source *it* recorded, not the current one.
  (mapv mi/can-read? (t2/hydrate (mapv #(t2/instance :model/Transform %) objects) :can_read)))
