(ns metabase.documents.db
  "Application database queries for the documents module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [java-time.api :as t]
   [metabase.collections.models.collection :as collection]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private DocumentRow
  "The writable columns of a Document row (excluding `:id`, `:created_at`, `:updated_at`)."
  [:map {:closed true}
   [:name                {:optional true} :any]
   [:document             {:optional true} :any]
   [:content_type         {:optional true} :any]
   [:creator_id           {:optional true} :any]
   [:collection_id        {:optional true} :any]
   [:archived             {:optional true} :any]
   [:archived_directly    {:optional true} :any]
   [:entity_id            {:optional true} :any]
   [:last_viewed_at       {:optional true} :any]
   [:view_count           {:optional true} :any]
   [:collection_position  {:optional true} :any]
   [:public_uuid          {:optional true} :any]
   [:made_public_by_id    {:optional true} :any]
   [:public_uuid_prefix   {:optional true} :any]
   [:exploration_id       {:optional true} :any]
   [:is_placeholder       {:optional true} :any]])

(mu/defn document :- [:maybe (ms/InstanceOf :model/Document)]
  "The Document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Document :id id))

(mu/defn unarchived-document :- [:maybe (ms/InstanceOf :model/Document)]
  "The Document with `id` if it is not archived, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Document :id id :archived false))

(mu/defn visible-unarchived-documents :- [:sequential (ms/InstanceOf :model/Document)]
  "The unarchived Documents not attached to an Exploration, in a Collection visible to the current user."
  []
  (t2/select :model/Document {:where [:and
                                      (collection/visible-collection-filter-clause)
                                      [:= :archived false]
                                      [:= :exploration_id nil]]}))

(mu/defn insert-document! :- ms/PositiveInt
  "Insert the Document `row` and return its id."
  [row :- DocumentRow]
  (t2/insert-returning-pk! :model/Document row))

(mu/defn update-document! :- :int
  "Apply `changes` to the Document with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- DocumentRow]
  (t2/update! :model/Document id changes))

(mu/defn delete-document! :- :int
  "Delete the Document with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Document :id id))

(mu/defn document-public-uuid :- [:maybe :string]
  "The public uuid of the Document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :public_uuid :model/Document :id id))

(mu/defn document-exploration-id :- [:maybe ms/PositiveInt]
  "The Exploration id of the Document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :exploration_id :model/Document :id id))

(mu/defn public-documents :- [:sequential (ms/InstanceOf :model/Document)]
  "The name, id, and public uuid of the unarchived Documents that are publicly shared."
  []
  (t2/select [:model/Document :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card card-id))

(mu/defn cards-not-in-document :- [:sequential (ms/InstanceOf :model/Card)]
  "The Cards with `card-ids` that do not belong to the Document with `document-id`."
  [card-ids    :- [:seqable ms/PositiveInt]
   document-id :- ms/PositiveInt]
  (t2/select :model/Card {:where [:and [:in :id card-ids]
                                  [:or [:<> :document_id document-id]
                                   [:= :document_id nil]]]}))

(mu/defn cards-for-document :- [:sequential (ms/InstanceOf :model/Card)]
  "The Cards of the Document with `document-id`."
  [document-id :- ms/PositiveInt]
  (t2/select :model/Card :document_id document-id))

(mu/defn unarchived-cards-for-documents :- [:sequential (ms/InstanceOf :model/Card)]
  "The unarchived Cards of the Documents with `document-ids`."
  [document-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Card :document_id [:in document-ids] :archived false))

(mu/defn unarchived-card-in-document-exists? :- :boolean
  "Whether the unarchived Card with `card-id` belongs to the Document with `document-id`."
  [card-id     :- ms/PositiveInt
   document-id :- ms/PositiveInt]
  (t2/exists? :model/Card :id card-id :document_id document-id :archived false))

(mu/defn update-card! :- :int
  "Apply `changes` to the Card with `card-id`, returning the number updated."
  [card-id :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:archived          :boolean]
               [:archived_directly :boolean]]]
  (t2/update! :model/Card card-id changes))

(mu/defn update-cards-for-document! :- :int
  "Apply `changes` to the Cards of the Document with `document-id`, returning the number updated."
  [document-id :- ms/PositiveInt
   changes     :- [:map {:closed true}
                   [:collection_id     [:maybe ms/PositiveInt]]
                   [:archived          :boolean]
                   [:archived_directly :boolean]]]
  (t2/update! :model/Card :document_id document-id changes))

(mu/defn unarchived-collection-exists? :- :boolean
  "Whether an unarchived Collection with `collection-id` exists."
  [collection-id :- ms/PositiveInt]
  (t2/exists? :model/Collection :id collection-id :archived false))

(mu/defn user-columns :- [:sequential (ms/InstanceOf :model/User)]
  "The id, email, and name of the Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Table :id id))

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Dashboard :id id))

(mu/defn update-documents-last-viewed-at! :- [:sequential :int]
  "Move `last_viewed_at` of each Document in `document-id->timestamp` forward to its timestamp, without touching
  `updated_at`, returning the number updated (as a one-element sequence -- `t2/query` on an UPDATE, unlike
  `t2/update!`, does not unwrap it)."
  [document-id->timestamp :- [:map-of ms/PositiveInt ms/TemporalInstant]]
  ;; A raw update rather than `t2/update!` so Toucan 2 model hooks don't fire: the :model/Document after-update
  ;; publishes :event/document-update and syncs card collections, side effects that must not re-run on retry.
  (t2/query {:update (t2/table-name :model/Document)
             :set    {:last_viewed_at (into [:case]
                                            (mapcat (fn [[id timestamp]]
                                                      [[:= :id id] [:greatest [:coalesce :last_viewed_at (t/offset-date-time 0)] timestamp]])
                                                    document-id->timestamp))
                      :updated_at :updated_at}
             :where  [:in :id (keys document-id->timestamp)]}))
