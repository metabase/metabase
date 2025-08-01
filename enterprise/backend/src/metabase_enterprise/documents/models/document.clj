(ns metabase-enterprise.documents.models.document
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(defmethod mi/can-read? :model/Document
  ([instance]
   (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection instance :read)))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Document :id pk))))

(defmethod mi/can-write? :model/Document
  ([_instance] api/*is-superuser?*)
  ([_ _pk] api/*is-superuser?*))

(methodical/defmethod t2/table-name :model/Document [_model] :document)

(doto :model/Document
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn validate-collection-move-permissions
  "Validates that the current user has write permissions for both old and new collections
   when moving a document. Uses the same permission pattern as check-allowed-to-change-collection.
   Throws 403 exception if permissions are insufficient."
  [old-collection-id new-collection-id]
  (when old-collection-id
    (collection/check-write-perms-for-collection old-collection-id))
  (when new-collection-id
    (collection/check-write-perms-for-collection new-collection-id))
  (when new-collection-id
    (api/check-400 (t2/exists? :model/Collection :id new-collection-id :archived false))))

(defn sync-document-cards-collection!
  "Updates all cards associated with a document to match the document's collection_id.
   Takes a document-id and new-collection-id as parameters.
   Uses bulk t2/update! operation for efficiency and operates within a transaction.
   Only updates cards with type = :in_document and matching document_document_id."
  [document-id new-collection-id]
  (let [updated-count (t2/update! :model/Card
                                  {:document_id document-id
                                   :type :in_document}
                                  {:collection_id new-collection-id})]
    (when (> updated-count 0)
      (log/debugf "Successfully updated %d cards to collection %s"
                  updated-count new-collection-id))
    updated-count))

(t2/define-after-update :model/Document
  [{document-id :id new-collection-id :collection_id}]
  (sync-document-cards-collection! document-id new-collection-id))
