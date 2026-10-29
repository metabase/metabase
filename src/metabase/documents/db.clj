(ns metabase.documents.db
  "Application database queries for the documents module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [java-time.api :as t]
   [malli.util :as mut]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.schema :as documents.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn document :- [:maybe ::documents.schema/document]
  "The ::documents.schema/document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Document :id [:auto/param id]))

(mu/defn visible-unarchived-documents
  "The unarchived Documents not attached to an Exploration, in a Collection visible to the current user."
  []
  (t2/select :model/Document {:where [:and
                                      (collection/visible-collection-filter-clause)
                                      [:= :archived false]
                                      [:= :exploration_id nil]]}))

(mu/defn documents-for-serdes-reducible
  "A reducible of the Documents to export via serdes: those whose `:collection_id` is in `collection-set` (nil in the
  set counts as the root collection; an empty or nil set means every collection), further restricted to the rows
  whose `filter-column` is one of `filter-ids` when `filter-column` is given, and ordered ascending by
  `order-columns` (unordered when empty).

  Exploration documents are always excluded: such a document is not first-class content, it is reachable only through
  its owning exploration, its body embeds values computed under its creator's data-access lens, and
  `:exploration_id` is in the serdes spec's `:skip` list — so an exported document would import as an ordinary,
  ungated document detached from any exploration."
  [collection-set :- [:maybe [:or [:set [:maybe ::lib.schema.id/collection]] [:sequential [:maybe ::lib.schema.id/collection]]]]
   filter-column  :- [:maybe :keyword]
   filter-ids     :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   order-columns  :- [:maybe [:sequential :keyword]]]
  (t2/reducible-select :model/Document
                       (cond-> {:where [:and
                                        (when (seq collection-set)
                                          [:or
                                           [:in :collection_id collection-set]
                                           (when (some nil? collection-set)
                                             [:= :collection_id nil])])
                                        (when filter-column
                                          [:in filter-column filter-ids])
                                        [:= :exploration_id nil]]}
                         (seq order-columns) (assoc :order-by (mapv (fn [column] [column :asc]) order-columns)))))

(mu/defn insert-document!
  "Insert the Document `row` and return its id."
  [row :- ::documents.schema/document.update]
  (t2/insert-returning-pk! :model/Document row))

(mu/defn update-document!
  "Apply `changes` to the Document with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- ::documents.schema/document.update]
  (t2/update! :model/Document id changes))

(mu/defn delete-document!
  "Delete the Document with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Document :id id))

(mu/defn public-documents
  "The name, id, and public uuid of the unarchived Documents that are publicly shared."
  []
  (t2/select [:model/Document :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(mu/defn update-card!
  "Apply `changes` to the Card with `card-id`, returning the number updated."
  [card-id :- ::lib.schema.id/card
   changes :- (mut/select-keys ::queries.schema/card.update [:archived :archived_directly])]
  (t2/update! :model/Card card-id changes))

(mu/defn update-cards-for-document!
  "Apply `changes` to the Cards of the Document with `document-id`, returning the number updated."
  [document-id :- ms/PositiveInt
   changes     :- (mut/select-keys ::queries.schema/card.update [:collection_id :archived :archived_directly])]
  (t2/update! :model/Card :document_id document-id changes))

(mu/defn update-documents-last-viewed-at!
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

(mu/defn unarchived-document-summaries-in-collection
  "The ID, name, collection, and exploration of the unarchived Documents in the Collection with `collection-id` (the
  root when nil) that are not attached to an Exploration, ordered by name."
  [{:keys [collection-id]} :- [:map {:closed true} [:collection-id [:maybe ::lib.schema.id/collection]]]]
  (t2/select [:model/Document :id :name :collection_id :exploration_id]
             :collection_id [:auto/param collection-id]
             :archived false
             :exploration_id nil
             {:order-by [[:%lower.name :asc]]}))

(mu/defn documents-in-archived-state
  "The Documents with `document-ids` whose archived flag is `archived?`."
  [{:keys [document-ids archived?]}
   :- [:map {:closed true}
       [:document-ids [:set ms/PositiveInt]]
       [:archived? :boolean]]]
  (t2/select :model/Document :id [:in document-ids] :archived [:auto/param archived?]))

(mu/defn summary-documents-for-explorations
  "The summary columns of the Documents attached to the Explorations with `exploration-ids`, oldest first."
  [{:keys [exploration-ids]} :- [:map {:closed true} [:exploration-ids [:or [:sequential ms/PositiveInt] [:set ms/PositiveInt]]]]]
  (t2/select [:model/Document :id :name :exploration_id :creator_id :content_type :created_at :updated_at :archived :is_placeholder]
             :exploration_id [:in exploration-ids]
             {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn unarchived-document-of-exploration
  "The unarchived Document attached to the Exploration with `exploration-id`, or nil."
  [{:keys [exploration-id]} :- [:map {:closed true} [:exploration-id ms/PositiveInt]]]
  (t2/select-one :model/Document :exploration_id [:auto/param exploration-id] :archived false))

(mu/defn document-exists?
  "Whether a Document with `document-id` exists."
  [{:keys [document-id]} :- [:map {:closed true} [:document-id ms/PositiveInt]]]
  (t2/exists? :model/Document :id [:auto/param document-id]))

(mu/defn unarchived-documents-by-public-uuid-prefix
  "The unarchived Documents whose public UUID prefix is `prefix`, only their `columns` when given."
  [{:keys [prefix columns]}
   :- [:map {:closed true}
       [:prefix :string]
       [:columns {:optional true} [:maybe [:sequential :keyword]]]]]
  (t2/select (if (seq columns) (into [:model/Document] columns) :model/Document)
             :public_uuid_prefix [:auto/param prefix]
             :archived false))

(mu/defn document-archived-flags
  "The archived flag of every Document."
  []
  (t2/select [:model/Document :archived]))

(mu/defn documents-exist-in-collections?
  "Whether any Document is in the Collections with `collection-ids`."
  [{:keys [collection-ids]} :- [:map {:closed true} [:collection-ids [:sequential ::lib.schema.id/collection]]]]
  (t2/exists? :model/Document :collection_id [:in collection-ids]))

(mu/defn documents-with-collections
  "The ID, name, archived flag, and Collection details of the Documents with `document-ids`."
  [{:keys [document-ids]} :- [:map {:closed true} [:document-ids [:or [:sequential ms/PositiveInt] [:set ms/PositiveInt]]]]]
  (t2/select :model/Document
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
                           [:= :c.archived false]]]}))
