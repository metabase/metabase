(ns metabase.documents.revisions.impl
  "Document revision serialization implementation.

  Implements Document revision serialization following the Card exclusion pattern,
  excluding metadata columns while preserving content, name, and other Document-specific fields."
  (:require
   [metabase.revisions.core :as revisions]))

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
    :collection_position})

(defmethod revisions/serialize-instance :model/Document
  [_model _id instance]
  (apply dissoc instance excluded-columns-for-document-revision))
