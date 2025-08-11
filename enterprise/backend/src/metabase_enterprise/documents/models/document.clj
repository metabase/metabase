(ns metabase-enterprise.documents.models.document
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.search.spec :as search.spec]
   [metabase.users.models.user]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Document [_model] :document)

(t2/deftransforms :model/Document
  {:document mi/transform-json})

(doto :model/Document
  (derive :metabase/model)
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

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

(methodical/defmethod t2/batched-hydrate [:model/Document :creator]
  "Hydrate the creator (user) of a document based on the creator_id."
  [_model k documents]
  (mi/instances-with-hydrated-data
   documents k
   #(-> (t2/select [:model/User :id :email :first_name :last_name] :id (keep :creator_id documents))
        (map (juxt :id identity))
        (into {}))
   :creator_id {:default {}}))

(defn sync-document-cards-collection!
  "Updates all cards associated with a document to match the document's collection.
  If the document is archived, also archives all associated cards.
  When collection_position is provided, it's also synced to associated cards.
  Returns the number of cards updated."
  [document-id collection-id & {:keys [archived archived-directly collection-position]}]
  (let [update-map (cond-> {:collection_id collection-id
                            :archived (boolean archived)
                            :archived_directly (boolean archived-directly)}
                     ;; Only include collection_position if it's explicitly provided
                     (some? collection-position)
                     (assoc :collection_position collection-position))]
    (t2/update! :model/Card
                :document_id document-id
                update-map)))

(t2/define-before-insert :model/Document
  [document]
  ;; Handle collection position reconciliation for new documents
  (when (and (:collection_id document) (:collection_position document))
    (api/maybe-reconcile-collection-position! {:collection_id (:collection_id document)
                                               :collection_position (:collection_position document)}))
  document)

(t2/define-before-update :model/Document
  [document]
  ;; Handle collection position reconciliation for document updates
  (let [changes (t2/changes document)]
    (api/maybe-reconcile-collection-position! document changes)
    document))

(t2/define-after-update :model/Document
  [{:keys [id collection_id archived archived_directly collection_position]}]
  ;; Sync cards to match document's collection, archival status, and position
  (sync-document-cards-collection! id collection_id
                                   :archived archived
                                   :archived-directly archived_directly
                                   :collection-position collection_position))

;;; ------------------------------------------------ Serdes Hashing -------------------------------------------------

(defmethod serdes/hash-fields :model/Document
  [_table]
  [:name (serdes/hydrated-hash :collection) :created-at])

(defmethod serdes/make-spec "Document"
  [_model-name _opts]
  {:copy [:archived :archived_directly :collection_position :description :entity_id :name :view_count]
   :skip [;; instance-specific stats
          :last_viewed_at
               ;; skip until we implement serdes for documents
          :document_id]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :creator_id (serdes/fk :model/User)
               :document :skip}})

 ;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search.spec/define-spec "document"
  {:model :model/Document
   :attrs {:archived true
           :collection-id :collection_id
           :creator-id :creator_id
           :view-count :view_count
           :created-at :created_at
           :updated-at :updated_at
           :last-viewed-at :last_viewed_at
           :pinned [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]}
   :search-terms [:name]
   :render-terms {:document-name :name
                  :document-id :id
                  :collection-position true}})
