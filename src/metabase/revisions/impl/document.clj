(ns metabase.revisions.impl.document
  "Document revision serialization implementation.

  Implements Document revision serialization following the Card exclusion pattern,
  excluding metadata columns while preserving content, name, and other Document-specific fields."
  (:require
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-keys-for-document-revision
  "Keys left out of a Document's revision object: the metadata columns and the keys the document API hydrates onto
  the instances it publishes."
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
    :creator
    :collection
    :can_write
    :can_delete
    :can_restore
    :is_remote_synced})

(defmethod revision/serialize-instance :model/Document
  [_model _id instance]
  (apply dissoc instance excluded-keys-for-document-revision))

(defmethod revision/revert-to-revision! :model/Document
  [model id user-id serialized-document]
  ((get-method revision/revert-to-revision! :default)
   model id user-id (apply dissoc serialized-document excluded-keys-for-document-revision)))
