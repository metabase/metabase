(ns metabase.collections-rest.db
  "Application database queries for the collections REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn other-users-personal-collection-ids :- [:maybe [:set ::lib.schema.id/collection]]
  "The ids of the personal Collections owned by Users other than `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-fn-set :id :model/Collection
                    {:where [:and [:!= :personal_owner_id nil] [:!= :personal_owner_id user-id]]}))

(defn- location-from-collection-id-clause
  "Clause to restrict which collections are being selected based off collection-id. If collection-id is nil,
   then restrict to the children and the grandchildren of the root collection. If collection-id is an an integer,
   then restrict to that collection's parents and children."
  [collection-id]
  (if collection-id
    [:and
     [:like :location (str "%/" collection-id "/%")]
     [:not [:like :location (str "%/" collection-id "/%/%/%")]]]
    [:not [:like :location "/%/%/"]]))

(mu/defn collections-for-listing :- [:sequential ::collections.schema/collection]
  "The Collections the User with `current-user-id` can read, for the listing endpoint: archived or unarchived ones
  (`archived`), only those around `collection-id` when `shallow`, only personal ones when `personal-only`, only the
  user's own personal ones when `exclude-other-user-collections`, library ones only when `include-library?`, and
  those in `namespaces`; official and non-trash Collections first, then by name."
  [{:keys [archived exclude-other-user-collections namespaces shallow collection-id personal-only include-library?]}
   :- [:map {:closed true}
       [:archived                       {:optional true} [:maybe :boolean]]
       [:exclude-other-user-collections {:optional true} [:maybe :boolean]]
       [:namespaces                     {:optional true} [:maybe [:or [:set [:maybe :string]] [:sequential [:maybe :string]]]]]
       [:shallow                        {:optional true} [:maybe :boolean]]
       [:collection-id                  {:optional true} [:maybe ::lib.schema.id/collection]]
       [:personal-only                  {:optional true} [:maybe :boolean]]
       [:include-library?               {:optional true} [:maybe :boolean]]
       [:permissions-set                {:optional true} [:maybe [:set :string]]]]
   current-user-id :- ::lib.schema.id/user]
  (t2/select :model/Collection
             {:where [:and
                      (case archived
                        nil nil
                        false [:and
                               [:not= :id (collection/trash-collection-id)]
                               [:not :archived]]
                        true [:or
                              [:= :id (collection/trash-collection-id)]
                              :archived])
                      (when shallow
                        (location-from-collection-id-clause collection-id))
                      (when personal-only
                        [:!= :personal_owner_id nil])
                      (when exclude-other-user-collections
                        [:or [:= :personal_owner_id nil] [:= :personal_owner_id current-user-id]])
                      (when-not include-library?
                        [:or [:= nil :type]
                         [:not-in :type [collection/library-collection-type
                                         collection/library-data-collection-type
                                         collection/library-metrics-collection-type]]])
                      [:or
                       (when (contains? namespaces nil)
                         [:= :namespace nil])
                       (when (seq namespaces)
                         [:in :namespace namespaces])]
                      (collection/visible-collection-filter-clause
                       :id
                       {:include-archived-items    (if archived
                                                     :only
                                                     :exclude)
                        :include-trash-collection? true
                        :permission-level          :read
                        :archive-operation-id      nil})]
              ;; Order NULL collection types first so that audit collections are last
              :order-by [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
                         [[[:case
                            [:= :type nil] 0
                            [:= :type collection/trash-collection-type] 1
                            :else 2]] :asc]
                         [:%lower.name :asc]]}))

(mu/defn collection :- [:maybe ::collections.schema/collection]
  "The Collection with `id`, or nil."
  [id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-one :model/Collection :id id))

(def ^:private CollectionLocationColumn
  "Rows returned by [[collection-location-columns]]."
  (mut/select-keys ::collections.schema/collection [:location :id :type]))

(mu/defn collection-location-columns :- [:maybe CollectionLocationColumn]
  "The location, id, and type of the Collection with `id`, or nil."
  [id :- ::lib.schema.id/collection]
  (t2/select-one [:model/Collection :location :id :type] :id id))

(mu/defn directly-archived-descendant-collections :- [:sequential ::collections.schema/collection]
  "The directly archived Collections whose location starts with `location-prefix`."
  [location-prefix :- :string]
  (t2/select :model/Collection :location [:like (str location-prefix "%")] :archived_directly true))

(mu/defn update-collection! :- :int
  "Apply `changes` to the Collection with `id`."
  [id :- ::lib.schema.id/collection
   changes :- (mut/select-keys ::collections.schema/collection.update [:name :description :authority_level])]
  (t2/update! :model/Collection id changes))

(mu/defn delete-collection! :- :int
  "Delete the Collection with `id`."
  [id :- ::lib.schema.id/collection]
  (t2/delete! :model/Collection :id id))

(mu/defn unarchived-card-collection-types-reducible
  "A reducible of the distinct Collection id and type of the unarchived Cards."
  []
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:= :archived false]}))

(mu/defn unarchived-card-collection-types-in-reducible
  "A reducible of the distinct Collection id and type of the unarchived Cards in the Collections with
  `collection-ids`, leaving out dashboard questions when `exclude-dashboard-questions?`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   exclude-dashboard-questions? :- :boolean]
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:and
                                         (when exclude-dashboard-questions?
                                           [:= :dashboard_id nil])
                                         [:= :archived false]
                                         [:in :collection_id collection-ids]]}))

(def ^:private PublishedTableCollectionId
  "Rows returned by [[published-table-collection-ids]]."
  [:map {:closed true}
   [:collection_id [:maybe ::lib.schema.id/collection]]])

(mu/defn published-table-collection-ids :- [:sequential PublishedTableCollectionId]
  "The distinct `:collection_id`s of the published, unarchived Tables."
  []
  (t2/query {:select-distinct [:collection_id]
             :from :metabase_table
             :where [:and
                     [:= :is_published true]
                     [:= :archived_at nil]]}))

(def ^:private PublishedTableCollectionIdsIn
  "Rows returned by [[published-table-collection-ids-in]]."
  [:map {:closed true}
   [:collection_id [:maybe ::lib.schema.id/collection]]])

(mu/defn published-table-collection-ids-in :- [:sequential PublishedTableCollectionIdsIn]
  "The distinct `:collection_id`s of the published, unarchived Tables in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/query {:select-distinct [:collection_id]
             :from :metabase_table
             :where [:and
                     [:= :is_published true]
                     [:= :archived_at nil]
                     [:in :collection_id collection-ids]]}))

(def ^:private TransformCollectionIdsIn
  "Rows returned by [[transform-collection-ids-in]]."
  [:map {:closed true}
   [:collection_id [:maybe ::lib.schema.id/collection]]])

(mu/defn transform-collection-ids-in :- [:sequential TransformCollectionIdsIn]
  "The distinct `:collection_id`s of the Transforms with one of `source-types` in the Collections with
  `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   source-types :- [:set :string]]
  (t2/query {:select-distinct [:collection_id]
             :from :transform
             :where [:and
                     [:in :collection_id collection-ids]
                     [:in :source_type source-types]]}))

(def ^:private UnarchivedDashboardCollectionIdsIn
  "Rows returned by [[unarchived-dashboard-collection-ids-in]]."
  [:map {:closed true}
   [:collection_id [:maybe ::lib.schema.id/collection]]])

(mu/defn unarchived-dashboard-collection-ids-in :- [:sequential UnarchivedDashboardCollectionIdsIn]
  "The distinct `:collection_id`s of the unarchived Dashboards in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/query {:select-distinct [:collection_id]
             :from :report_dashboard
             :where [:and
                     [:= :archived false]
                     [:in :collection_id collection-ids]]}))

(mu/defn top-level-cards-in-collection :- [:sequential ::queries.schema/card]
  "The Cards in the Collection with `collection-id` that belong to no Dashboard, newest first."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select :model/Card {:where [:and
                                  [:= :collection_id collection-id]
                                  [:= :dashboard_id nil]]
                          :order-by [[:id :desc]]}))

(mu/defn cards-in-collection :- [:sequential ::queries.schema/card]
  "The Cards in the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select :model/Card :collection_id collection-id))

(mu/defn collection-children-rows :- [:sequential :map]
  "The rows matching the collection-children Honey SQL `query`, built by `metabase.collections-rest.api` from the
  per-model item queries for a Collection's paginated child listing. Follows the same exception as
  `metabase.search.db` for spec-driven Honey SQL that can't be reduced to plain-data parameters."
  [query :- :map]
  (app-db/query query))

(mu/defn collection-filter-metadata-rows :- [:sequential :map]
  "The rows matching the collection-filter-metadata Honey SQL `query`, built by `metabase.collections-rest.api` to
  probe which item models have at least one visible child in a Collection. Follows the same exception as
  `metabase.search.db` for spec-driven Honey SQL that can't be reduced to plain-data parameters."
  [query :- :map]
  (app-db/query query))
