(ns metabase-enterprise.documents.recent-views
  "Enterprise multimethod implementations for documents in recent views."
  (:require
   [metabase.activity-feed.core :as activity-feed]
   [metabase.collections.models.collection.root :as root]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise select-documents-for-recents
  "Query to select recent document data. Returns documents with their collection information
  for use in recent views display."
  :feature :documents
  [document-ids]
  (if-not (seq document-ids)
    []
    (let [documents (t2/select :model/Document
                               {:select [:d.id
                                         :d.name
                                         :d.archived
                                         [:d.collection_id :entity-coll-id]
                                         [:c.id :collection_id]
                                         [:c.name :collection_name]
                                         [:c.authority_level :collection_authority_level]]
                                :from [[:document :d]]
                                :where [:in :d.id document-ids]
                                :left-join [[:collection :c]
                                            [:and
                                             [:= :c.id :d.collection_id]
                                             [:= :c.archived false]]]})]
      documents)))

(defn- fill-parent-coll
  "Fill in parent collection information for a document, following the same pattern
  as other recent view implementations."
  [model-object]
  (if (:collection_id model-object)
    {:id (:collection_id model-object)
     :name (:collection_name model-object)
     :authority_level (some-> (:collection_authority_level model-object) name)}
    (select-keys
     (root/root-collection-with-ui-details {})
     [:id :name :authority_level])))

(defn- parent-collection-valid?
  "Returns true when a parent collection actually exists for this document.
  Follows the same pattern as cards - returns false when the collection has a
  collection_id but no collection_name (indicating the collection no longer exists)."
  [{:keys [collection_id entity-coll-id]}]
  (not (and entity-coll-id (nil? collection_id))))

(defn- ellide-archived
  "Returns the model when it's not archived.
  We use this to ensure that archived models are not returned in the recent views."
  [model]
  (when (false? (:archived model)) model))

(defmethod activity-feed/fill-recent-view-info :document
  [{:keys [_model model_id timestamp model_object]}]
  (when-let [document (and
                       (mi/can-read? model_object)
                       (parent-collection-valid? model_object)
                       (ellide-archived model_object))]
    {:id model_id
     :name (:name document)
     :description ""
     :model :document
     :can_write (mi/can-write? document)
     :timestamp (str timestamp)
     :parent_collection (fill-parent-coll document)}))
