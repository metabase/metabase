(ns metabase.revisions.impl.transform
  (:require
   [malli.core :as mc]
   [malli.util :as mut]
   [metabase.models.interface :as mi]
   [metabase.revisions.models.revision :as revision]
   [metabase.transforms.schema :as transforms.schema]
   [toucan2.core :as t2]))

(def ^:private excluded-columns-for-transform-revision
  #{:id :entity_id :created_at :updated_at :creator :creator_id :owner :can_read :can_write :can_execute})

(def ^:private snapshot-keys-for-read-check
  "Keys [[transforms.schema/transform.create]] accepts. `can-read?` validates that closed schema, and a snapshot is
  not a live row: `:id` is removed on write, and a revision recorded from a hydrated instance can still carry
  `:owner` (#86577). The create schema is a `:merge`; deref it to the map so a column added there stays legal here."
  ;; `::transform.create` is a registry ref whose body is a `:merge`, and a `:merge` is itself a ref schema.
  ;; [[mc/deref-all]] unwraps both to the combined map. [[mr/resolve-schema]] would also do that, then inline
  ;; every nested schema (the MBQL source tree) at namespace load.
  (vec (mut/keys (mc/deref-all ::transforms.schema/transform.create))))

(defmethod revision/serialize-instance :model/Transform [_model _id instance]
  (apply dissoc instance excluded-columns-for-transform-revision))

(defmethod revision/revision-readable? :model/Transform
  [_model object]
  ;; A transform is readable only to callers entitled to the source database it reads from, so each historical
  ;; revision is authorized against the source *it* recorded, not the current one. The snapshot is not a live row,
  ;; so pass `can-read?` only the keys the closed create schema accepts.
  (mi/can-read? (t2/instance :model/Transform (select-keys object snapshot-keys-for-read-check))))
