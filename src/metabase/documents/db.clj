(ns metabase.documents.db
  "Application database queries for the documents module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [java-time.api :as t]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(defn document
  "The Document with `id`, or nil."
  [id]
  (t2/select-one :model/Document :id id))

(defn unarchived-document
  "The Document with `id` if it is not archived, or nil."
  [id]
  (t2/select-one :model/Document :id id :archived false))

(defn visible-unarchived-documents
  "The unarchived Documents not attached to an Exploration, in a Collection visible to the current user."
  []
  (t2/select :model/Document {:where [:and
                                      (collection/visible-collection-filter-clause)
                                      [:= :archived false]
                                      [:= :exploration_id nil]]}))

(defn insert-document!
  "Insert the Document `row` and return its id."
  [row]
  (t2/insert-returning-pk! :model/Document row))

(defn update-document!
  "Apply `changes` to the Document with `id`."
  [id changes]
  (t2/update! :model/Document id changes))

(defn delete-document!
  "Delete the Document with `id`."
  [id]
  (t2/delete! :model/Document :id id))

(defn document-public-uuid
  "The public uuid of the Document with `id`, or nil."
  [id]
  (t2/select-one-fn :public_uuid :model/Document :id id))

(defn document-exploration-id
  "The Exploration id of the Document with `id`, or nil."
  [id]
  (t2/select-one-fn :exploration_id :model/Document :id id))

(defn public-documents
  "The name, id, and public uuid of the unarchived Documents that are publicly shared."
  []
  (t2/select [:model/Document :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card card-id))

(defn cards-not-in-document
  "The Cards with `card-ids` that do not belong to the Document with `document-id`."
  [card-ids document-id]
  (t2/select :model/Card {:where [:and [:in :id card-ids]
                                  [:or [:<> :document_id document-id]
                                   [:= :document_id nil]]]}))

(defn cards-for-document
  "The Cards of the Document with `document-id`."
  [document-id]
  (t2/select :model/Card :document_id document-id))

(defn unarchived-cards-for-documents
  "The unarchived Cards of the Documents with `document-ids`."
  [document-ids]
  (t2/select :model/Card :document_id [:in document-ids] :archived false))

(defn unarchived-card-in-document-exists?
  "Whether the unarchived Card with `card-id` belongs to the Document with `document-id`."
  [card-id document-id]
  (t2/exists? :model/Card :id card-id :document_id document-id :archived false))

(defn update-card!
  "Apply `changes` to the Card with `card-id`."
  [card-id changes]
  (t2/update! :model/Card card-id changes))

(defn update-cards-for-document!
  "Apply `changes` to the Cards of the Document with `document-id`."
  [document-id changes]
  (t2/update! :model/Card :document_id document-id changes))

(defn unarchived-collection-exists?
  "Whether an unarchived Collection with `collection-id` exists."
  [collection-id]
  (t2/exists? :model/Collection :id collection-id :archived false))

(defn user-columns
  "The id, email, and name of the Users with `user-ids`."
  [user-ids]
  (t2/select [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(defn table
  "The Table with `id`, or nil."
  [id]
  (t2/select-one :model/Table :id id))

(defn dashboard
  "The Dashboard with `id`, or nil."
  [id]
  (t2/select-one :model/Dashboard :id id))

(defn update-documents-last-viewed-at!
  "Move `last_viewed_at` of each Document in `document-id->timestamp` forward to its timestamp, without touching
  `updated_at`."
  [document-id->timestamp]
  ;; A raw update rather than `t2/update!` so Toucan 2 model hooks don't fire: the :model/Document after-update
  ;; publishes :event/document-update and syncs card collections, side effects that must not re-run on retry.
  (t2/query {:update (t2/table-name :model/Document)
             :set    {:last_viewed_at (into [:case]
                                            (mapcat (fn [[id timestamp]]
                                                      [[:= :id id] [:greatest [:coalesce :last_viewed_at (t/offset-date-time 0)] timestamp]])
                                                    document-id->timestamp))
                      :updated_at :updated_at}
             :where  [:in :id (keys document-id->timestamp)]}))
