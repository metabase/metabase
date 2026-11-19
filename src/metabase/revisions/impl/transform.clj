(ns metabase.revisions.impl.transform
  (:require
   [metabase.models.interface :as mi]
   [metabase.revisions.models.revision :as revision]
   [toucan2.core :as t2]))

(def ^:private computed-columns
  "The columns that a run or the dependency analysis writes, which are no part of what a revision records or reverts."
  #{:last_checkpoint_value :target_table_id :table_dependencies})

(def ^:private excluded-columns-for-transform-revision
  (into #{:id :entity_id :created_at :updated_at :creator :creator_id :can_read :can_write :can_execute}
        computed-columns))

(defmethod revision/serialize-instance :model/Transform [_model _id instance]
  (apply dissoc instance excluded-columns-for-transform-revision))

(defmethod revision/revert-to-revision! :model/Transform
  [model id user-id serialized-instance]
  ((get-method revision/revert-to-revision! :default)
   model id user-id (apply dissoc serialized-instance computed-columns)))

(defmethod revision/revisions-readable? :model/Transform
  [_model objects]
  ;; A transform is readable only to callers entitled to the source database it reads from, so each historical
  ;; revision is authorized against the source *it* recorded, not the current one.
  (mapv mi/can-read? (t2/hydrate (mapv #(t2/instance :model/Transform %) objects) :can_read)))
