(ns metabase.documents.db
  "Application database queries for the documents module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [java-time.api :as t]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.collections.listing :as collections.listing]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.documents.schema :as documents.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.queries.schema :as queries.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.revisions.sql :as revisions.sql]
   [metabase.settings.core :as setting]
   [metabase.staleness.core :as staleness]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn synced-documents-clause :- [:fn vector?]
  "The clause over the Document table aliased `alias` selecting the documents remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  [:and
   (when-not (:include-archived? opts)
     [:= (u/qualified-key alias :archived) false])
   [:= (u/qualified-key alias :exploration_id) nil]
   (remote-sync/synced-fk-clause alias :collection_id :model/Collection opts)])

(mu/defn document
  "The Document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Document :id id))

(mu/defn exploration-archived?
  "Whether the Exploration with `exploration-id` is archived."
  [exploration-id :- ms/PositiveInt]
  (t2/exists? :model/Exploration :id exploration-id :archived true))

(mu/defn explorations
  "The Explorations with `exploration-ids`."
  [exploration-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Exploration :id [:in exploration-ids]))

(mu/defn unarchived-document
  "The Document with `id` if it is not archived, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Document :id id :archived false))

(mu/defn visible-unarchived-documents
  "The unarchived Documents not attached to an Exploration, in a Collection visible to the current user."
  []
  (t2/select :model/Document {:where [:and
                                      (perms/visible-collections-filter-clause :document.collection_id (api/current-user-info) {:root-namespace nil})
                                      [:= :archived false]
                                      [:= :exploration_id nil]]}))

(mu/defn insert-document!
  "Insert the Document `row` and return its id."
  [row :- ::documents.schema/document.update]
  (t2/insert-returning-pk! :model/Document row))

(mu/defn update-document!
  "Apply `changes` to the Document with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- ::documents.schema/document.update]
  (t2/update! :model/Document :id id changes))

(mu/defn delete-document!
  "Delete the Document with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Document :id id))

(mu/defn document-public-uuid
  "The public uuid of the Document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :public_uuid :model/Document :id id))

(mu/defn document-exploration-id
  "The Exploration id of the Document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :exploration_id :model/Document :id id))

(mu/defn public-documents
  "The name, id, and public uuid of the unarchived Documents that are publicly shared."
  []
  (t2/select [:model/Document :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id [:auto/param card-id]))

(mu/defn cards-not-in-document
  "The Cards with `card-ids` that do not belong to the Document with `document-id`."
  [card-ids    :- [:sequential ::lib.schema.id/card]
   document-id :- ms/PositiveInt]
  (t2/select :model/Card {:where [:and [:in :id card-ids]
                                  [:or [:<> :document_id document-id]
                                   [:= :document_id nil]]]}))

(mu/defn cards-for-document
  "The Cards of the Document with `document-id`."
  [document-id :- ms/PositiveInt]
  (t2/select :model/Card :document_id document-id))

(mu/defn unarchived-cards-for-documents
  "The unarchived Cards of the Documents with `document-ids`."
  [document-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Card :document_id [:in document-ids] :archived false))

(mu/defn unarchived-card-in-document-exists?
  "Whether the unarchived Card with `card-id` belongs to the Document with `document-id`."
  [card-id     :- ::lib.schema.id/card
   document-id :- ms/PositiveInt]
  (t2/exists? :model/Card :id card-id :document_id document-id :archived false))

(mu/defn update-card!
  "Apply `changes` to the Card with `card-id`, returning the number updated."
  [card-id :- ::lib.schema.id/card
   changes :- (mut/select-keys ::queries.schema/card.update [:archived :archived_directly])]
  (t2/update! :model/Card :id card-id changes))

(defn- archivable-card-conditions
  "The key-value conditions of the Cards in the Document with `document-id` that archiving it archives."
  [document-id]
  [:document_id document-id :archived false])

(defn- restorable-card-conditions
  "The key-value conditions of the Cards in the Document with `document-id` that restoring it restores."
  [document-id]
  [:document_id document-id :archived true :archived_directly false])

(mu/defn cards-archived-with-document
  "The unarchived Cards in the Document with `document-id`, which archiving it archives along with it."
  [document-id :- ms/PositiveInt]
  (apply t2/select :model/Card (archivable-card-conditions document-id)))

(mu/defn cards-restored-with-document
  "The Cards in the Document with `document-id` that were archived along with it, which restoring it restores."
  [document-id :- ms/PositiveInt]
  (apply t2/select :model/Card (restorable-card-conditions document-id)))

(mu/defn archive-document-cards!
  "Archive, through their model, the rows of [[cards-archived-with-document]], returning the number updated."
  [document-id :- ms/PositiveInt]
  (apply t2/update! :model/Card (concat (archivable-card-conditions document-id) [{:archived true}])))

(mu/defn restore-document-cards!
  "Restore, through their model, the rows of [[cards-restored-with-document]], returning the number updated."
  [document-id :- ms/PositiveInt]
  (apply t2/update! :model/Card (concat (restorable-card-conditions document-id) [{:archived false}])))

(mu/defn update-cards-for-document!
  "Apply `changes` to the Cards of the Document with `document-id`, returning the number updated."
  [document-id :- ms/PositiveInt
   changes     :- (mut/select-keys ::queries.schema/card.update [:collection_id :archived :archived_directly])]
  (t2/update! :model/Card :document_id document-id changes))

(mu/defn user-columns
  "The id, email, and name of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn table
  "The Table with `id`, or nil."
  [id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id id))

(mu/defn dashboard
  "The Dashboard with `id`, or nil."
  [id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id id))

(mu/defn update-documents-last-viewed-at!
  "Move `last_viewed_at` of each Document in `document-id->timestamp` forward to its timestamp, without touching
  `updated_at`, as a raw update rather than `t2/update!`, which would publish `:event/document-update`, returning
  the number updated as a one-element sequence."
  [document-id->timestamp :- [:map-of ms/PositiveInt ms/TemporalInstant]]
  (t2/query {:update (t2/table-name :model/Document)
             :set    {:last_viewed_at (into [:case]
                                            (mapcat (fn [[id timestamp]]
                                                      [[:= :id id] [:greatest [:coalesce :last_viewed_at (t/offset-date-time 0)] timestamp]])
                                                    document-id->timestamp))
                      :updated_at :updated_at}
             :where  [:in :id (keys document-id->timestamp)]}))

(mu/defn synced-document-items :- [:sequential ::documents.schema/document]
  "The Documents with `ids`, with their Collection and its ancestors, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (t2/select [:model/Document :id :name :collection_id] :id [:in ids])
        (t2/hydrate [:collection :effective_ancestors])
        (->> (mapv #(collection.root/hydrate-root-collection % root))))))

(mu/defn stale-document-candidates :- ::staleness/query
  "The query of the Documents that are stale for `opts`, `{:collection-ids (:all | #{int|nil}), :cutoff-date local-date}`:
  those not viewed since the cutoff, or never viewed and created before it, in regular collections. `last_viewed_at`
  is never null, so the recency is null for a Document that was never viewed."
  [opts :- ::staleness/candidates-options]
  ^:allow-subquery
  {:select [:document.id
            [(h2x/literal "Document") :model]
            [:document.name :name]
            [[:case [:= :document.view_count [:inline 0]] nil :else :document.last_viewed_at] :last_used_at]
            :document.collection_id]
   :from :document
   :left-join [:collection [:= :collection.id :document.collection_id]]
   :where [:and
           [:= :document.archived false]
           [:or
            [:<= :document.last_viewed_at (:cutoff-date opts)]
            [:and
             [:= :document.view_count 0]
             [:<= :document.created_at (:cutoff-date opts)]]]
           [:= :collection.type nil]
           (when (setting/get :enable-public-sharing)
             [:= :document.public_uuid nil])
           (staleness/collection-filter :document.collection_id opts)]})

(mu/defn dependency-document-items :- :map
  "The query of the Documents the dependencies lists hold for `opts`, as `entity_id`, `name` and `location`: in the
  collections the user reads, without those in personal collections unless `:include-personal-collections?`, located
  by their collection."
  [{:keys [include-archived include-personal-collections?] :as opts}
   :- :metabase.dependencies.items/items-opts]
  (let [location (collections.listing/collection-location :collection nil)]
    {:select    [[:document.id :entity_id] [:document.name :name] [location :location]]
     :from      [:document]
     :left-join [:collection [:= :document.collection_id :collection.id]]
     :where     (into [:and]
                      (remove nil?)
                      [(collections.listing/visible-in-collections-clause :document opts include-archived nil)
                       (collections.listing/archived-clause :document include-archived)
                       (when-not include-personal-collections?
                         (collections.listing/outside-personal-collections-clause :document :collection))])}))

(mu/defn collection-document-items :- :map
  "The query of the Documents in `collection` that the collection items listing of `opts` holds. The Documents of an Exploration are only listed when `:show-exploration-documents?`."
  [collection :- :map
   {:keys [archived? pinned-state created-by-id show-exploration-documents?]} :- :map]
  {:select [:document.id
            :document.name
            :document.collection_id
            :document.collection_position
            :document.archived
            :document.archived_directly
            :document.exploration_id
            [:u.id :last_edit_user]
            [:u.email :last_edit_email]
            [:u.first_name :last_edit_first_name]
            [:u.last_name :last_edit_last_name]
            [:r.timestamp :last_edit_timestamp]
            [(h2x/literal "document") :model]]
   :from [[:document :document]]
   :left-join [[:revision :r] [:and
                               [:= :r.model_id :document.id]
                               [:= :r.model (h2x/literal "Document")]
                               (revisions.sql/newest-revision-clause :r "Document" :document.id)]
               [:core_user :u] [:= :u.id :r.user_id]]
   :where [:and
           (collections.listing/visible-items-clause :document.collection_id archived? {:root-namespace nil})
           (if (collection/is-trash? collection)
             [:= :document.archived_directly true]
             [:and
              [:= :document.collection_id (:id collection)]
              [:= :document.archived_directly false]])
           (when created-by-id
             [:= :document.creator_id created-by-id])
           [:= :document.archived (boolean archived?)]
           (when-not show-exploration-documents?
             [:= :document.exploration_id nil])
           (collections.listing/pinned-state->clause pinned-state :document.collection_position)]})

(mu/defn recent-view-documents
  "The Documents with `document-ids` with their Collection, none for no ids."
  [document-ids :- [:maybe [:sequential ms/PositiveInt]]]
  (if (empty? document-ids)
    []
    (t2/hydrate
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
                              [:= :c.archived false]]]}) :can_read :can_write)))
