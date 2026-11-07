(ns metabase.revisions.impl.transform
  (:require
   [metabase.models.interface :as mi]
   [metabase.revisions.models.revision :as revision]
   [toucan2.core :as t2]))

(def ^:private excluded-columns-for-transform-revision
  #{:id :entity_id :created_at :updated_at :creator :creator_id :owner :can_read :can_write :can_execute})

(def ^:private snapshot-keys-for-read-check
  "Columns of a stored Transform snapshot that are legal on a create request. `can-read?` validates a closed
  schema, and a snapshot is not a live row: `:id` is removed on write, and a revision recorded from a hydrated
  instance can still carry `:owner` (#86577)."
  [:name :description :source :target :entity_id :created_at :updated_at :source_type
   :creator_id :source_database_id :collection_id :owner_user_id :owner_email :target_db_id
   :last_checkpoint_value :target_table_id :table_dependencies :run_trigger :tag_ids])

(defmethod revision/serialize-instance :model/Transform [_model _id instance]
  (apply dissoc instance excluded-columns-for-transform-revision))

(defmethod revision/revision-readable? :model/Transform
  [_model object]
  ;; A transform is readable only to callers entitled to the source database it reads from, so each historical
  ;; revision is authorized against the source *it* recorded, not the current one. The snapshot is not a live row,
  ;; so pass `can-read?` only the keys the closed create schema accepts.
  (mi/can-read? (t2/instance :model/Transform (select-keys object snapshot-keys-for-read-check))))
