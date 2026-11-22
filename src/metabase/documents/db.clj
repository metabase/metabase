(ns metabase.documents.db
  "Application database queries for the documents module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.listing :as collections.listing]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.collections.schema :as collections.schema]
   [metabase.documents.schema :as documents.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
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

(defn- parent-archived-clause
  "The subquery for whether the row of `table` that the column `k` of the updated Document names is archived, the value of
  `k` in `changes` when it gives one."
  [changes table k]
  ^:allow-subquery {:select [:parent.archived]
                    :from   [[table :parent]]
                    :where  [:= :parent.id (if (contains? changes k)
                                             [:auto/param (get changes k)]
                                             (keyword (str "document." (name k))))]})

(mu/defn archived-directly-clause :- :any
  "The expression for the `archived_directly` of a Document that `changes` archives or restores: true when it is
  archived and neither its Collection nor its Exploration is, false when it is restored."
  [changes :- :map]
  (if (:archived changes)
    [:case [:or [:= (parent-archived-clause changes :collection :collection_id) true]
            [:= (parent-archived-clause changes :exploration :exploration_id) true]]
     false
     :else true]
    [:inline false]))

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

(mu/defn archived-exploration-ids
  "The IDs among `exploration-ids` of the Explorations that are archived."
  [exploration-ids :- [:set ms/PositiveInt]]
  (if (seq exploration-ids)
    (set (t2/select-pks-set :model/Exploration :id [:in exploration-ids] :archived true))
    #{}))

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

(mu/defn documents
  "The Documents with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (if (seq ids)
    (t2/select :model/Document :id [:in ids])
    []))

(mu/defn insert-documents!
  "Insert the Document `rows` and return the inserted instances, in the order of the rows."
  [rows :- [:sequential ::documents.schema/document.create]]
  (mdb/insert-returning-instances! :model/Document rows))

(mu/defn update-documents!
  "Apply `changes` to the Documents with `ids`, with one statement for each distinct set of columns that change in them,
  returning nil."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- ::documents.schema/document.update]
  (let [stored (m/index-by :id (t2/select :model/Document :id [:in ids]))
        rows   (mapv #(assoc changes :id %) ids)]
    (doseq [[effective group] (mi/group-ids-by-changes stored rows)]
      (t2/update! :model/Document :id [:in group] effective)))
  nil)

(mu/defn delete-documents!
  "Delete the Documents with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/Document :id [:in ids]))

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

(mu/defn cards-by-ids
  "The Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select :model/Card :id [:in card-ids]))

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

(mu/defn cards-archived-with-document
  "The unarchived Cards in the Document with `document-id`, which archiving it archives along with it."
  [document-id :- ms/PositiveInt]
  (t2/select :model/Card :document_id document-id :archived false))

(mu/defn cards-restored-with-document
  "The Cards in the Document with `document-id` that were archived along with it, which restoring it restores."
  [document-id :- ms/PositiveInt]
  (t2/select :model/Card :document_id document-id :archived true :archived_directly false))

(mu/defn card-ids-archived-with-documents
  "The IDs of the unarchived Cards in the Documents with `document-ids`, which archiving them archives along with them."
  [document-ids :- [:sequential ms/PositiveInt]]
  (t2/select-pks-vec :model/Card :document_id [:in document-ids] :archived false))

(mu/defn card-ids-restored-with-documents
  "The IDs of the Cards in the Documents with `document-ids` that were archived along with them, which restoring them
  restores."
  [document-ids :- [:sequential ms/PositiveInt]]
  (t2/select-pks-vec :model/Card :document_id [:in document-ids] :archived true :archived_directly false))

(mu/defn card-ids-of-documents
  "The IDs of the Cards in the Documents with `document-ids`."
  [document-ids :- [:sequential ms/PositiveInt]]
  (t2/select-pks-vec :model/Card :document_id [:in document-ids]))

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

(mu/defn increment-document-view-counts! :- :int
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Documents with `ids`, in one raw
  statement that publishes no event, returning the number updated."
  [count->ids :- [:map-of ms/PositiveInt [:sequential ms/PositiveInt]]]
  (mdb/increment-counts! :model/Document :view_count count->ids))

(mu/defn set-document-last-viewed-at!
  "Set `last_viewed_at` of the Document with `document-id`, returning the number updated."
  [document-id    :- ms/PositiveInt
   last-viewed-at :- ms/TemporalInstant]
  (t2/update! :model/Document :id document-id {:last_viewed_at last-viewed-at}))

(mu/defn shift-document-positions! :- :int
  "Add or subtract one from the `collection_position` of the Documents in the Collection with `collection-id` whose position is
  in `positions`, `{:from n :to m}` with either bound left out, as `direction` says, returning the number updated."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   positions     :- ::collections.schema/positions
   direction     :- ::collections.schema/position-direction]
  (t2/update! :model/Document {:collection_id       collection-id
                               :collection_position (collection/position-clause positions)}
              {:collection_position [direction :collection_position 1]}))

(mu/defn update-document-columns!
  "Apply `changes` to the Document with `document-id` in one statement through the model, returning the number
  updated."
  [document-id :- ms/PositiveInt
   changes     :- :map]
  (t2/update! :model/Document :id document-id changes))
