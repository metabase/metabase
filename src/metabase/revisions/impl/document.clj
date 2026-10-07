(ns metabase.revisions.impl.document
  "Document revision serialization implementation.

  Implements Document revision serialization following the Card exclusion pattern,
  excluding metadata columns while preserving content, name, and other Document-specific fields."
  (:require
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-columns-for-document-revision
  "Keys that a Document revision does not store: metadata columns, and the keys that the API hydrates."
  #{:id
    :creator_id
    :created_at
    :updated_at
    :view_count
    :last_viewed_at
    :collection_id
    :collection_position
    :public_uuid
    :public_uuid_prefix
    :made_public_by_id
    ;; API-hydrated keys: the hook's event lacks them, so a stored copy would make one edit record two Revisions
    :creator
    :can_write
    :can_delete
    :can_restore
    :is_remote_synced})

(defmethod revision/serialize-instance :model/Document
  [_model _id instance]
  (apply dissoc instance excluded-columns-for-document-revision))

(defmethod revision/comparable-object :model/Document
  [_model object]
  ;; revisions stored by earlier versions can hold keys that [[revision/serialize-instance]] now drops, such as the
  ;; hydrated keys
  (apply dissoc object excluded-columns-for-document-revision))

(defmethod revision/revert-to-revision! :model/Document
  [model id user-id serialized-document]
  ((get-method revision/revert-to-revision! :default)
   model id user-id (apply dissoc serialized-document excluded-columns-for-document-revision)))
