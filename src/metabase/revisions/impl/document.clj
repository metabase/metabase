(ns metabase.revisions.impl.document
  "Document revision serialization implementation.

  Implements Document revision serialization following the Card exclusion pattern,
  excluding metadata columns while preserving content, name, and other Document-specific fields."
  (:require
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-columns-for-document-revision
  "Columns to exclude from Document revision serialization.

  Excludes metadata columns (timestamps, IDs, collection_id, creator_id, etc.)
  following the same pattern established for Card revisions.

  The :document field contains the actual content and is preserved."
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
    :show_public_timeline_events})

(defmethod revision/serialize-instance :model/Document
  [_model _id instance]
  (apply dissoc instance excluded-columns-for-document-revision))

(defmethod revision/revert-to-revision! :model/Document
  [model id user-id serialized-document]
  ;; A revert points the document back at cards it already owns rather than copying any, so their timeline selections
  ;; come back as saved, including timelines the reverting user cannot read.
  ((get-method revision/revert-to-revision! :default)
   model id user-id (apply dissoc serialized-document excluded-columns-for-document-revision)))
