(ns metabase.collections.db
  "Application database queries for the collections module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [malli.util :as mut]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private PermissionsRow
  "The writable columns of a Permissions row (excluding `:id`)."
  [:map {:closed true}
   [:object      {:optional true} [:maybe :string]]
   [:group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:perm_value  {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:perm_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]])

;;; ---------------------------------------------- Single Collections ----------------------------------------------

(def ^:private Collection
  "Rows returned by [[collection]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn collection :- [:maybe Collection]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(def ^:private CollectionIdAndNamespace
  "Rows returned by [[collection-id-and-namespace]]."
  [:map {:closed true}
   [:id        ::lib.schema.id/collection]
   [:namespace [:maybe [:or :keyword :string]]]])

(mu/defn collection-id-and-namespace :- [:maybe CollectionIdAndNamespace]
  "The ID and namespace of the Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one [:model/Collection :id :namespace] :id collection-id))

(def ^:private CollectionOfType
  "Rows returned by [[collection-of-type]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn collection-of-type :- [:maybe CollectionOfType]
  "The Collection of `type`, or nil."
  [type :- :string]
  (t2/select-one :model/Collection :type type))

(def ^:private RootRemoteSyncedCollection
  "Rows returned by [[root-remote-synced-collection]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn root-remote-synced-collection :- [:maybe RootRemoteSyncedCollection]
  "The top-level remote-synced Collection, or nil."
  []
  (t2/select-one :model/Collection :is_remote_synced true :location "/"))

(def ^:private PersonalCollectionOfUser
  "Rows returned by [[personal-collection-of-user]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn personal-collection-of-user :- [:maybe PersonalCollectionOfUser]
  "The personal Collection of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/Collection :personal_owner_id user-id))

(mu/defn collection-exists? :- :boolean
  "Whether a Collection with `collection-id` exists. `collection-id` may be nil for an item in the root
  Collection, which always answers false."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/exists? :model/Collection :id collection-id))

(mu/defn unarchived-collection-exists? :- :boolean
  "Whether an unarchived Collection with `collection-id` exists."
  [collection-id :- ::lib.schema.id/collection]
  (t2/exists? :model/Collection :id collection-id :archived false))

(mu/defn remote-synced-collection-exists? :- :boolean
  "Whether a remote-synced Collection with `collection-id` exists."
  [collection-id :- ::lib.schema.id/collection]
  (t2/exists? :model/Collection :id collection-id :is_remote_synced true))

(mu/defn personal-collection? :- :boolean
  "Whether the Collection with `collection-id` is a personal Collection."
  [collection-id :- ::lib.schema.id/collection]
  (t2/exists? :model/Collection :id collection-id :personal_owner_id [:not= nil]))

(mu/defn collection-remote-synced? :- [:maybe :boolean]
  "Whether the Collection with `collection-id` is remote-synced, or nil if `collection-id` is nil (the root
  Collection) or the Collection does not exist."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-one-fn :is_remote_synced :model/Collection :id collection-id))

(mu/defn collection-namespace :- [:maybe :keyword]
  "The namespace of the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :namespace :model/Collection :id collection-id))

(mu/defn collection-location :- [:maybe :string]
  "The location of the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :location :model/Collection :id collection-id))

(mu/defn root-collection-type-by-id :- [:maybe :string]
  "The type of the top-level Collection with `collection-id`, or nil if it is not top-level."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :type :model/Collection :id collection-id :location "/"))

;;; ---------------------------------------------- Collection sets ----------------------------------------------

(def ^:private CollectionsById
  "Rows returned by [[collections-by-id]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn collections-by-id :- [:map-of CollectionsById [:map {:closed true}
                                                        [:id                   ::lib.schema.id/collection]
                                                        [:name                 [:or :string :map sequential?]]
                                                        [:description          [:maybe [:or :string :map sequential?]]]
                                                        [:archived             :boolean]
                                                        [:location             :string]
                                                        [:personal_owner_id    [:maybe ::lib.schema.id/user]]
                                                        [:slug                 :string]
                                                        [:namespace            [:maybe [:or :keyword :string]]]
                                                        [:authority_level      [:maybe [:or :keyword :string]]]
                                                        [:entity_id            :string]
                                                        [:created_at           ms/TemporalInstant]
                                                        [:type                 [:maybe [:or :keyword :string]]]
                                                        [:is_sample            :boolean]
                                                        [:archive_operation_id [:maybe :string]]
                                                        [:archived_directly    [:maybe :boolean]]
                                                        [:is_remote_synced     [:maybe :boolean]]]]
  "A map of ID to Collection for `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pk->fn identity :model/Collection :id [:in collection-ids]))

(def ^:private CollectionColumnsById
  "Rows returned by [[collection-columns-by-id]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn collection-columns-by-id :- [:map-of ms/PositiveInt CollectionColumnsById]
  "A map of ID to the `columns` of the Collections with `collection-ids`."
  [columns        :- [:sequential :keyword]
   collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pk->fn identity (into [:model/Collection] columns) :id [:in collection-ids]))

(def ^:private CollectionArchivedFlag
  "Rows returned by [[collection-archived-flags]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn collection-archived-flags :- [:map-of CollectionArchivedFlag :boolean]
  "A map of ID to `:archived` for `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pk->fn :archived :model/Collection :id [:in collection-ids]))

(def ^:private CollectionsInNamespace
  "Rows returned by [[collections-in-namespace]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn collections-in-namespace :- [:sequential CollectionsInNamespace]
  "The Collections in the namespace named `namespace-name`."
  [namespace-name :- :string]
  (t2/select :model/Collection :namespace namespace-name))

(def ^:private ArchivedCollectionsInOperation
  "Rows returned by [[archived-collections-in-operations]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn archived-collections-in-operations :- [:sequential ArchivedCollectionsInOperation]
  "The archived Collections belonging to the archive operations with `archive-operation-ids`."
  [archive-operation-ids :- [:sequential :string]]
  (t2/select :model/Collection :archive_operation_id [:in archive-operation-ids] :archived true))

(def ^:private AncestorSummarie
  "Rows returned by [[ancestor-summaries]]."
  [:map {:closed true}
   [:name              [:or :string :map sequential?]]
   [:id                ::lib.schema.id/collection]
   [:personal_owner_id [:maybe ::lib.schema.id/user]]])

(mu/defn ancestor-summaries :- [:sequential AncestorSummarie]
  "The name, ID, and owner of the Collections with `collection-ids`, ordered by location."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select [:model/Collection :name :id :personal_owner_id] :id [:in collection-ids] {:order-by [:location]}))

(def ^:private DescendantSummarie
  "Rows returned by [[descendant-summaries]]."
  [:map {:closed true}
   [:name        [:or :string :map sequential?]]
   [:id          ::lib.schema.id/collection]
   [:location    :string]
   [:description [:maybe [:or :string :map sequential?]]]])

(mu/defn descendant-summaries :- [:sequential DescendantSummarie]
  "The name, ID, location, and description of the descendant Collections of the Collection at
  `children-location-prefix` (see `metabase.collections.models.collection/children-location`), excluding other
  users' Personal Collections (Personal Collections owned by `current-user-id` are still included). When
  `archived?` is given (true or false, not nil), further restricted to that archived status.
  `additional-where-clauses` are ANDed in as-is (nil, from a caller with none to add, is treated as empty); used
  by callers that need a permission-filter builder like `visible-collection-filter-clause`, which lives in
  `metabase.collections.models.collection` and so can't be called from here without a require cycle (that
  namespace already requires this one)."
  [children-location-prefix :- :string
   current-user-id          :- [:maybe ::lib.schema.id/user]
   archived?                :- [:maybe :boolean]
   additional-where-clauses :- [:maybe [:sequential vector?]]]
  (t2/select [:model/Collection :name :id :location :description]
             {:where (into [:and
                            [:like :location (str children-location-prefix "%")]
                            [:or
                             [:= :personal_owner_id nil]
                             [:= :personal_owner_id current-user-id]]
                            (when (some? archived?)
                              [:= :archived archived?])]
                           additional-where-clauses)}))

(def ^:private DescendantSummariesWithType
  "Rows returned by [[descendant-summaries-with-type]]."
  [:map {:closed true}
   [:name        [:or :string :map sequential?]]
   [:id          ::lib.schema.id/collection]
   [:location    :string]
   [:description [:maybe [:or :string :map sequential?]]]
   [:type        [:maybe [:or :keyword :string]]]])

(mu/defn descendant-summaries-with-type :- [:sequential DescendantSummariesWithType]
  "The name, ID, location, description, and type of the Collections directly under any of `location-prefixes`
  (compared with SQL `LIKE`), excluding personal Collections that don't belong to `current-user-id`."
  [location-prefixes :- [:sequential :string]
   current-user-id   :- [:maybe ::lib.schema.id/user]]
  (t2/select [:model/Collection :name :id :location :description :type]
             {:where [:and
                      (into [:or] (map (fn [prefix] [:like :location prefix])) location-prefixes)
                      [:or [:= :personal_owner_id nil] [:= :personal_owner_id current-user-id]]]}))

(def ^:private EffectiveChildrenWhere
  "Rows returned by [[effective-children-where]]."
  [:map {:closed true}
   [:id          ::lib.schema.id/collection]
   [:name        [:or :string :map sequential?]]
   [:description [:maybe [:or :string :map sequential?]]]
   [:type        [:maybe [:or :keyword :string]]]])

(mu/defn effective-children-where :- [:sequential EffectiveChildrenWhere]
  "The ID, name, description, and type of the Collections matching the Honey SQL `where`."
  [where :- [:maybe vector?]]
  (t2/select [:model/Collection :id :name :description :type] {:where where}))

(mu/defn collections-for-serdes-reducible
  "Reducible Collections matching the Honey SQL `where` in stable storage order."
  [where :- [:maybe vector?]]
  (t2/reducible-select :model/Collection {:where where, :order-by serdes/stable-storage-order}))

(mu/defn collection-count-by-ids :- ms/IntGreaterThanOrEqualToZero
  "The number of Collections among `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/count :model/Collection :id [:in collection-ids]))

(mu/defn collection-count-of-types :- ms/IntGreaterThanOrEqualToZero
  "The number of Collections with `collection-id` whose type is one of `types`."
  [collection-id :- ::lib.schema.id/collection
   types         :- [:sequential :string]]
  (t2/count :model/Collection :id collection-id :type [:in types]))

(mu/defn remote-synced-collection-count :- ms/IntGreaterThanOrEqualToZero
  "The number of remote-synced Collections."
  []
  (t2/count :model/Collection :is_remote_synced true))

(def ^:private CollectionIdsWithLocationLike
  "Rows returned by [[collection-ids-with-location-like]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn collection-ids-with-location-like :- [:maybe [:set CollectionIdsWithLocationLike]]
  "The IDs of the Collections whose location matches the SQL `pattern`."
  [pattern :- :string]
  (t2/select-pks-set :model/Collection :location [:like pattern]))

(def ^:private UnarchivedCollectionIdsWithLocationLike
  "Rows returned by [[unarchived-collection-ids-with-location-like]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn unarchived-collection-ids-with-location-like :- [:maybe [:set UnarchivedCollectionIdsWithLocationLike]]
  "The IDs of the unarchived Collections whose location matches the SQL `pattern`."
  [pattern :- :string]
  (t2/select-pks-set :model/Collection :location [:like pattern] :archived false))

(def ^:private NotYetArchivedCollectionIdsWithLocationLike
  "Rows returned by [[not-yet-archived-collection-ids-with-location-like]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn not-yet-archived-collection-ids-with-location-like :- [:maybe [:set NotYetArchivedCollectionIdsWithLocationLike]]
  "The IDs of the Collections whose location matches the SQL `pattern` and that are not marked archived."
  [pattern :- :string]
  (t2/select-pks-set :model/Collection :location [:like pattern] :archived [:not= true]))

(def ^:private ArchivedCollectionIdsInOperationWithLocationLike
  "Rows returned by [[archived-collection-ids-in-operation-with-location-like]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn archived-collection-ids-in-operation-with-location-like :- [:maybe [:set ArchivedCollectionIdsInOperationWithLocationLike]]
  "The IDs of the archived Collections of the archive operation with `archive-operation-id` whose location matches
  the SQL `pattern`."
  [pattern              :- :string
   archive-operation-id :- :string]
  (t2/select-pks-set :model/Collection
                     :location [:like pattern]
                     :archive_operation_id [:= archive-operation-id]
                     :archived [:= true]))

(def ^:private CollectionIdsOfType
  "Rows returned by [[collection-ids-of-type]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn collection-ids-of-type :- [:maybe [:set CollectionIdsOfType]]
  "The IDs of the Collections among `collection-ids` of `type`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   type           :- :string]
  (t2/select-pks-set :model/Collection :id [:in collection-ids] :type type))

(def ^:private ChildCollectionId
  "Rows returned by [[child-collection-ids]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn child-collection-ids :- [:maybe [:set ChildCollectionId]]
  "The IDs of the non-trash Collections directly at `location`, excluding archived ones when `skip-archived?`."
  [location       :- :string
   trash-type     :- :string
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Collection
                     {:where [:and
                              [:= :location location]
                              (when skip-archived? [:not :archived])
                              [:or
                               [:not= :type trash-type]
                               [:= :type nil]]]}))

(def ^:private RemoteSyncedRootCollectionId
  "Rows returned by [[remote-synced-root-collection-ids]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn remote-synced-root-collection-ids :- [:maybe [:set RemoteSyncedRootCollectionId]]
  "The IDs of the top-level remote-synced Collections."
  []
  (t2/select-pks-set :model/Collection {:where [:and
                                                [:= :is_remote_synced true]
                                                [:= :location "/"]]}))

(def ^:private PersonalCollectionId
  "Rows returned by [[personal-collection-ids]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn personal-collection-ids :- [:maybe [:set PersonalCollectionId]]
  "The IDs of every personal Collection."
  []
  (t2/select-pks-set :model/Collection :personal_owner_id [:not= nil]))

(def ^:private PersonalCollectionIdsByOwner
  "Rows returned by [[personal-collection-ids-by-owner]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn personal-collection-ids-by-owner :- [:map-of PersonalCollectionIdsByOwner ms/PositiveInt]
  "A map of owner User ID to personal Collection ID for `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-fn->pk :personal_owner_id :model/Collection :personal_owner_id [:in user-ids]))

;;; ---------------------------------------------- Collection writes ----------------------------------------------

(mu/defn insert-collection! :- (mut/optional-keys [:map {:closed true}
                                                   [:id                   ::lib.schema.id/collection]
                                                   [:name                 [:or :string :map sequential?]]
                                                   [:description          [:maybe [:or :string :map sequential?]]]
                                                   [:archived             :boolean]
                                                   [:location             :string]
                                                   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
                                                   [:slug                 :string]
                                                   [:namespace            [:maybe [:or :keyword :string]]]
                                                   [:authority_level      [:maybe [:or :keyword :string]]]
                                                   [:entity_id            :string]
                                                   [:created_at           ms/TemporalInstant]
                                                   [:type                 [:maybe [:or :keyword :string]]]
                                                   [:is_sample            :boolean]
                                                   [:archive_operation_id [:maybe :string]]
                                                   [:archived_directly    [:maybe :boolean]]
                                                   [:is_remote_synced     [:maybe :boolean]]])
  "Insert `collection` and return the new instance."
  [collection :- (mut/select-keys ::collections.schema/collection.update [:name :description :archived :location :personal_owner_id :slug :namespace :authority_level :entity_id :created_at :type :is_sample :archive_operation_id :archived_directly :is_remote_synced])]
  (t2/insert-returning-instance! :model/Collection collection))

(mu/defn update-collection! :- :int
  "Apply `changes` to the Collection with `collection-id`, returning the number updated."
  [collection-id :- ::lib.schema.id/collection
   changes       :- (mut/select-keys ::collections.schema/collection.update [:name :description :archived :location :personal_owner_id :slug :namespace :authority_level :entity_id :created_at :type :is_sample :archive_operation_id :archived_directly :is_remote_synced])]
  (t2/update! :model/Collection collection-id changes))

(mu/defn clear-remote-synced-flags! :- :int
  "Mark every remote-synced Collection as not remote-synced, returning the number updated."
  []
  (t2/update! :model/Collection :is_remote_synced true {:is_remote_synced false}))

(mu/defn archive-descendant-collections! :- :int
  "Archive, as part of the archive operation with `archive-operation-id`, the unarchived Collections whose location
  matches the SQL `pattern`, returning the number updated."
  [pattern              :- :string
   archive-operation-id :- :string]
  (t2/query-one {:update :collection
                 :set    {:archive_operation_id archive-operation-id
                          :archived_directly    false
                          :archived             true}
                 :where  [:and
                          [:like :location pattern]
                          [:not :archived]]}))

(mu/defn unarchive-descendant-collections! :- :int
  "Unarchive the Collections of the archive operation with `archive-operation-id` that were not archived directly,
  moving them from `orig-children-location` to `new-children-location` and setting `remote-synced?`, returning the
  number updated."
  [orig-children-location :- :string
   new-children-location  :- :string
   remote-synced?         :- :boolean
   archive-operation-id   :- :string]
  (t2/query-one {:update :collection
                 :set    {:location             [:replace :location orig-children-location new-children-location]
                          :is_remote_synced     remote-synced?
                          :archive_operation_id nil
                          :archived_directly    nil
                          :archived             false}
                 :where  [:and
                          [:like :location (str orig-children-location "%")]
                          [:= :archive_operation_id archive-operation-id]
                          [:not= :archived_directly true]]}))

(mu/defn move-descendant-collections! :- :int
  "Move the Collections under `orig-children-location` to `new-children-location` and set `remote-synced?`,
  returning the number updated."
  [orig-children-location :- :string
   new-children-location  :- :string
   remote-synced?         :- :boolean]
  (t2/query-one {:update :collection
                 :set    {:location         [:replace :location orig-children-location new-children-location]
                          :is_remote_synced remote-synced?}
                 :where  [:like :location (str orig-children-location "%")]}))

(mu/defn delete-collections-at-location! :- :int
  "Delete the Collections directly at `location`, returning the number deleted."
  [location :- :string]
  (t2/delete! :model/Collection :location location))

;;; ---------------------------------------------- Collection contents ----------------------------------------------

(mu/defn instances-with-columns :- [:sequential :map]
  "The `columns` of the instances with `ids`."
  [columns :- [:sequential :keyword]
   ids     :- [:set ms/PositiveInt]]
  (t2/select columns :id [:in ids]))

(mu/defn instance-by-id :- [:maybe :map]
  "The instance of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one model :id id))

(mu/defn collection-namespaces-of :- [:map-of ms/PositiveInt [:maybe [:or :keyword :string]]]
  "A map of ID to the namespace of the Collection holding each instance of `model` with `ids`."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :namespace [model :id [:c.namespace :namespace]]
                    {:where [:in (keyword (str (name (t2/table-name model)) ".id")) ids]
                     :join  [[:collection :c] [:= :collection_id :c.id]]}))

(mu/defn set-pulse-archived-in-collections! :- :int
  "Set `archived?` on the Pulses in the Collections with `collection-ids`, returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Pulse {:collection_id [:in collection-ids]} {:archived archived?}))

(mu/defn set-native-query-snippet-archived-in-collections! :- :int
  "Set `archived?` on the NativeQuerySnippets in the Collections with `collection-ids`, returning the number
  updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/NativeQuerySnippet {:collection_id [:in collection-ids]} {:archived archived?}))

(mu/defn set-timeline-archived-in-collections! :- :int
  "Set `archived?` on the Timelines in the Collections with `collection-ids`, returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Timeline {:collection_id [:in collection-ids]} {:archived archived?}))

(mu/defn set-card-archived-in-collections-not-directly! :- :int
  "Set `archived?` on the Cards in the Collections with `collection-ids` that were not archived directly, returning
  the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Card {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(mu/defn set-dashboard-archived-in-collections-not-directly! :- :int
  "Set `archived?` on the Dashboards in the Collections with `collection-ids` that were not archived directly,
  returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Dashboard {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(mu/defn set-document-archived-in-collections-not-directly! :- :int
  "Set `archived?` on the Documents in the Collections with `collection-ids` that were not archived directly,
  returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Document {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(mu/defn set-exploration-archived-in-collections-not-directly! :- :int
  "Set `archived?` on the Explorations in the Collections with `collection-ids` that were not archived directly,
  returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Exploration {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(mu/defn delete-cards-in-collections! :- :int
  "Delete the Cards in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Card :collection_id [:in collection-ids]))

(mu/defn delete-dashboards-in-collections! :- :int
  "Delete the Dashboards in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Dashboard :collection_id [:in collection-ids]))

(mu/defn delete-native-query-snippets-in-collections! :- :int
  "Delete the NativeQuerySnippets in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/NativeQuerySnippet :collection_id [:in collection-ids]))

(mu/defn delete-pulses-in-collections! :- :int
  "Delete the Pulses in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Pulse :collection_id [:in collection-ids]))

(mu/defn delete-timelines-in-collections! :- :int
  "Delete the Timelines in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Timeline :collection_id [:in collection-ids]))

(def ^:private DashboardIdsInCollection
  "Rows returned by [[dashboard-ids-in-collection]]."
  [:map {:closed true}
   [:id                      ::lib.schema.id/dashboard]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:name                    :string]
   [:description             [:maybe [:or :string :map sequential?]]]
   [:creator_id              ::lib.schema.id/user]
   [:parameters              [:or :string :map sequential?]]
   [:points_of_interest      [:maybe [:or :string :map sequential?]]]
   [:caveats                 [:maybe [:or :string :map sequential?]]]
   [:show_in_getting_started :boolean]
   [:public_uuid             [:maybe [:or :string uuid?]]]
   [:made_public_by_id       [:maybe ms/PositiveInt]]
   [:enable_embedding        :boolean]
   [:embedding_params        [:maybe [:or :string :map sequential?]]]
   [:archived                :boolean]
   [:position                [:maybe :int]]
   [:collection_id           [:maybe ::lib.schema.id/collection]]
   [:collection_position     [:maybe :int]]
   [:cache_ttl               [:maybe :int]]
   [:entity_id               :string]
   [:auto_apply_filters      :boolean]
   [:width                   :string]
   [:initially_published_at  [:maybe ms/TemporalInstant]]
   [:view_count              :int]
   [:archived_directly       :boolean]
   [:last_viewed_at          ms/TemporalInstant]
   [:embedding_type          [:maybe [:or :keyword :string]]]
   [:public_uuid_prefix      [:maybe :string]]])

(mu/defn dashboard-ids-in-collection :- [:maybe [:set DashboardIdsInCollection]]
  "The IDs of the Dashboards in the Collection with `collection-id` (nil for the root Collection), excluding archived
  ones when `skip-archived?`."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Dashboard
                     {:where [:and [:= :collection_id collection-id] (when skip-archived? [:not :archived])]}))

(def ^:private CardIdsInCollection
  "Rows returned by [[card-ids-in-collection]]."
  [:map {:closed true}
   [:id                                        ::lib.schema.id/card]
   [:created_at                                ms/TemporalInstant]
   [:updated_at                                ms/TemporalInstant]
   [:name                                      :string]
   [:description                               [:maybe [:or :string :map sequential?]]]
   [:display                                   [:or :keyword :string]]
   [:dataset_query                             [:or :string :map sequential?]]
   [:visualization_settings                    [:or :string :map sequential?]]
   [:creator_id                                ::lib.schema.id/user]
   [:database_id                               ::lib.schema.id/database]
   [:table_id                                  [:maybe ::lib.schema.id/table]]
   [:query_type                                [:maybe [:or :keyword :string]]]
   [:archived                                  :boolean]
   [:collection_id                             [:maybe ::lib.schema.id/collection]]
   [:public_uuid                               [:maybe [:or :string uuid?]]]
   [:made_public_by_id                         [:maybe ms/PositiveInt]]
   [:enable_embedding                          :boolean]
   [:embedding_params                          [:maybe [:or :string :map sequential?]]]
   [:cache_ttl                                 [:maybe :int]]
   [:result_metadata                           [:maybe [:or :string :map sequential?]]]
   [:collection_position                       [:maybe :int]]
   [:entity_id                                 :string]
   [:parameters                                [:maybe [:or :string :map sequential?]]]
   [:parameter_mappings                        [:maybe [:or :string :map sequential?]]]
   [:collection_preview                        :boolean]
   [:metabase_version                          [:maybe :string]]
   [:type                                      [:or :keyword :string]]
   [:initially_published_at                    [:maybe ms/TemporalInstant]]
   [:cache_invalidated_at                      [:maybe ms/TemporalInstant]]
   [:last_used_at                              ms/TemporalInstant]
   [:view_count                                :int]
   [:archived_directly                         :boolean]
   [:dataset_query_metrics_v2_migration_backup [:maybe [:or :string :map sequential?]]]
   [:source_card_id                            [:maybe ::lib.schema.id/card]]
   [:dashboard_id                              [:maybe ::lib.schema.id/dashboard]]
   [:card_schema                               :int]
   [:document_id                               [:maybe ms/PositiveInt]]
   [:legacy_query                              [:maybe [:or :string :map sequential?]]]
   [:embedding_type                            [:maybe [:or :keyword :string]]]
   [:public_uuid_prefix                        [:maybe :string]]
   [:dimensions                                [:maybe [:or :string :map sequential?]]]
   [:dimension_mappings                        [:maybe [:or :string :map sequential?]]]
   [:metabot_conversation_id                   [:maybe :string]]
   [:metabot_chart_id                          [:maybe :string]]])

(mu/defn card-ids-in-collection :- [:maybe [:set (mut/optional-keys (mut/open-schema CardIdsInCollection))]]
  "The IDs of the Cards in the Collection with `collection-id`, excluding archived ones when `skip-archived?` and
  excluding Cards materialized by an exploration Summary."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Card {:where [:and
                                          [:= :collection_id collection-id]
                                          (when skip-archived? [:not :archived])
                                          [:or
                                           [:= :document_id nil]
                                           [:in :document_id
                                            ^:allow-subquery {:select [:id]
                                                              :from   [:document]
                                                              :where  [:= :exploration_id nil]}]]]}))

(mu/defn document-ids-in-collection :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the non-exploration Documents in the Collection with `collection-id`, excluding archived ones when
  `skip-archived?`."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Document {:where [:and
                                              [:= :collection_id collection-id]
                                              [:= :exploration_id nil]
                                              (when skip-archived? [:not :archived])]}))

(mu/defn timeline-ids-in-collection :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Timelines in the Collection with `collection-id`, excluding archived ones when `skip-archived?`."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Timeline
                     {:where [:and [:= :collection_id collection-id] (when skip-archived? [:not :archived])]}))

(def ^:private PublishedTableIdsInCollectionRow
  "Rows returned by [[published-table-ids-in-collection]]."
  [:map {:closed true}
   [:id                      ::lib.schema.id/table]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:name                    :string]
   [:description             [:maybe [:or :string :map sequential?]]]
   [:entity_type             [:maybe [:or :keyword :string]]]
   [:active                  :boolean]
   [:db_id                   ::lib.schema.id/database]
   [:display_name            [:maybe :string]]
   [:visibility_type         [:maybe [:or :keyword :string]]]
   [:schema                  [:maybe :string]]
   [:points_of_interest      [:maybe [:or :string :map sequential?]]]
   [:caveats                 [:maybe [:or :string :map sequential?]]]
   [:show_in_getting_started :boolean]
   [:field_order             [:or :keyword :string]]
   [:initial_sync_status     [:or :keyword :string]]
   [:is_upload               :boolean]
   [:database_require_filter [:maybe :boolean]]
   [:estimated_row_count     [:maybe :int]]
   [:view_count              :int]
   [:is_defective_duplicate  :boolean]
   [:unique_table_helper     [:maybe :string]]
   [:deactivated_at          [:maybe ms/TemporalInstant]]
   [:archived_at             [:maybe ms/TemporalInstant]]
   [:is_writable             [:maybe :boolean]]
   [:data_authority          [:or :keyword :string :map sequential?]]
   [:data_source             [:maybe [:or :keyword :string :map sequential?]]]
   [:data_layer              [:maybe [:or :keyword :string :map sequential?]]]
   [:owner_email             [:maybe [:or :string :map sequential?]]]
   [:owner_user_id           [:maybe ::lib.schema.id/user]]
   [:collection_id           [:maybe ::lib.schema.id/collection]]
   [:is_published            :boolean]
   [:transform_id            [:maybe ::lib.schema.id/transform]]
   [:transform_target        :boolean]])

(mu/defn published-table-ids-in-collection :- [:maybe [:set PublishedTableIdsInCollectionRow]]
  "The IDs of the published Tables in the Collection with `collection-id`, excluding archived ones when
  `skip-archived?`."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Table {:where [:and
                                           [:= :collection_id collection-id]
                                           [:= :is_published true]
                                           (when skip-archived? [:= :archived_at nil])]}))

(def ^:private TransformIdsInCollection
  "Rows returned by [[transform-ids-in-collection]]."
  [:map {:closed true}
   [:id                    ::lib.schema.id/transform]
   [:name                  [:or :string :map sequential?]]
   [:description           [:maybe [:or :string :map sequential?]]]
   [:source                [:or :keyword :string :map sequential?]]
   [:target                [:or :string :map sequential?]]
   [:entity_id             :string]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:source_type           [:or :keyword :string]]
   [:creator_id            ::lib.schema.id/user]
   [:source_database_id    [:maybe ::lib.schema.id/database]]
   [:collection_id         [:maybe ::lib.schema.id/collection]]
   [:owner_user_id         [:maybe ::lib.schema.id/user]]
   [:owner_email           [:maybe [:or :string :map sequential?]]]
   [:target_db_id          [:maybe ::lib.schema.id/database]]
   [:last_checkpoint_value [:maybe [:or :string :map sequential?]]]
   [:target_table_id       [:maybe ::lib.schema.id/table]]
   [:table_dependencies    [:maybe [:or :string :map sequential?]]]])

(mu/defn transform-ids-in-collection :- [:maybe [:set TransformIdsInCollection]]
  "The IDs of the Transforms in the Collection with `collection-id`."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-pks-set :model/Transform {:where [:= :collection_id collection-id]}))

(def ^:private PublishedTableIdsInCollection
  "Rows returned by [[published-table-ids-in-collections]]."
  [:map {:closed true}
   [:id                      ::lib.schema.id/table]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:name                    :string]
   [:description             [:maybe [:or :string :map sequential?]]]
   [:entity_type             [:maybe [:or :keyword :string]]]
   [:active                  :boolean]
   [:db_id                   ::lib.schema.id/database]
   [:display_name            [:maybe :string]]
   [:visibility_type         [:maybe [:or :keyword :string]]]
   [:schema                  [:maybe :string]]
   [:points_of_interest      [:maybe [:or :string :map sequential?]]]
   [:caveats                 [:maybe [:or :string :map sequential?]]]
   [:show_in_getting_started :boolean]
   [:field_order             [:or :keyword :string]]
   [:initial_sync_status     [:or :keyword :string]]
   [:is_upload               :boolean]
   [:database_require_filter [:maybe :boolean]]
   [:estimated_row_count     [:maybe :int]]
   [:view_count              :int]
   [:is_defective_duplicate  :boolean]
   [:unique_table_helper     [:maybe :string]]
   [:deactivated_at          [:maybe ms/TemporalInstant]]
   [:archived_at             [:maybe ms/TemporalInstant]]
   [:is_writable             [:maybe :boolean]]
   [:data_authority          [:or :keyword :string :map sequential?]]
   [:data_source             [:maybe [:or :keyword :string :map sequential?]]]
   [:data_layer              [:maybe [:or :keyword :string :map sequential?]]]
   [:owner_email             [:maybe [:or :string :map sequential?]]]
   [:owner_user_id           [:maybe ::lib.schema.id/user]]
   [:collection_id           [:maybe ::lib.schema.id/collection]]
   [:is_published            :boolean]
   [:transform_id            [:maybe ::lib.schema.id/transform]]
   [:transform_target        :boolean]])

(mu/defn published-table-ids-in-collections :- [:maybe [:set PublishedTableIdsInCollection]]
  "The IDs of the published Tables in the Collections with `collection-ids`."
  [collection-ids :- [:or [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]
  (t2/select-pks-set :model/Table :collection_id [:in collection-ids] :is_published true))

(mu/defn unpublish-tables-in-collections! :- :int
  "Unpublish the Tables in the Collections with `collection-ids` and detach them from their Collection, returning
  the number updated."
  [collection-ids :- [:or [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]
  (t2/update! :model/Table {:collection_id [:in collection-ids]} {:collection_id nil, :is_published false}))

(def ^:private DashboardIdsWithCard
  "Rows returned by [[dashboard-ids-with-cards]]."
  [:map {:closed true}
   [:id                      ::lib.schema.id/dashboard]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:name                    :string]
   [:description             [:maybe [:or :string :map sequential?]]]
   [:creator_id              ::lib.schema.id/user]
   [:parameters              [:or :string :map sequential?]]
   [:points_of_interest      [:maybe [:or :string :map sequential?]]]
   [:caveats                 [:maybe [:or :string :map sequential?]]]
   [:show_in_getting_started :boolean]
   [:public_uuid             [:maybe [:or :string uuid?]]]
   [:made_public_by_id       [:maybe ms/PositiveInt]]
   [:enable_embedding        :boolean]
   [:embedding_params        [:maybe [:or :string :map sequential?]]]
   [:archived                :boolean]
   [:position                [:maybe :int]]
   [:collection_id           [:maybe ::lib.schema.id/collection]]
   [:collection_position     [:maybe :int]]
   [:cache_ttl               [:maybe :int]]
   [:entity_id               :string]
   [:auto_apply_filters      :boolean]
   [:width                   :string]
   [:initially_published_at  [:maybe ms/TemporalInstant]]
   [:view_count              :int]
   [:archived_directly       :boolean]
   [:last_viewed_at          ms/TemporalInstant]
   [:embedding_type          [:maybe [:or :keyword :string]]]
   [:public_uuid_prefix      [:maybe :string]]])

(mu/defn dashboard-ids-with-cards :- [:sequential [:map {:closed true} [:dashboard_id (mut/optional-keys (mut/open-schema DashboardIdsWithCard))]]]
  "The `:dashboard_id` rows of the Dashboards among `dashboard-ids` holding an unarchived dashboard question."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (t2/query {:select-distinct [:dashboard_id]
             :from            :report_card
             :where           [:and
                               [:= :archived false]
                               [:in :dashboard_id dashboard-ids]
                               [:exists ^:allow-subquery {:select 1
                                                          :from   :report_dashboardcard
                                                          :where  [:and
                                                                   [:= :report_dashboardcard.card_id :report_card.id]
                                                                   [:= :report_dashboardcard.dashboard_id :report_card.dashboard_id]]}]]}))

;;; ------------------------------------------------ Permissions ------------------------------------------------

(mu/defn user-has-root-collection-permission? :- :boolean
  "Whether the User with `user-id` belongs to a group holding a Permissions row for one of the root collection
  `objects`."
  [user-id :- ::lib.schema.id/user
   objects :- [:sequential :string]]
  (t2/exists? :model/Permissions {:select [:p.*]
                                  :from   [[:permissions :p]]
                                  :join   [[:permissions_group :pg] [:= :pg.id :p.group_id]
                                           [:permissions_group_membership :pgm] [:= :pgm.group_id :pg.id]]
                                  :where  [:and
                                           [:= :pgm.user_id user-id]
                                           [:in :p.object objects]]}))

(mu/defn group-ids-with-permission-object :- [:maybe [:set ms/PositiveInt]]
  "The set of group IDs holding a Permissions row for `object`."
  [object :- :string]
  (t2/select-fn-set :group_id :model/Permissions :object object))

(mu/defn insert-permissions! :- :int
  "Insert the Permissions `rows`, returning the number inserted."
  [rows :- [:sequential PermissionsRow]]
  (t2/insert! :model/Permissions rows))

(mu/defn delete-permissions-for-collection! :- :int
  "Delete the Permissions rows attached to the Collection with `collection-id`, returning the number deleted."
  [collection-id :- ::lib.schema.id/collection]
  (t2/delete! :model/Permissions :collection_id collection-id))

(mu/defn delete-permissions-with-objects! :- :int
  "Delete the Permissions rows for `objects`, returning the number deleted."
  [objects :- [:sequential :string]]
  (t2/query-one {:delete-from :permissions
                 :where       [:in :object objects]}))

;;; ---------------------------------------------------- Users ----------------------------------------------------

(mu/defn user-type :- [:maybe :keyword]
  "The type of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :type :model/User user-id))

(def ^:private UserNamePartsById
  "Rows returned by [[user-name-parts-by-id]]."
  [:map {:closed true}
   [:id              ::lib.schema.id/user]
   [:email           :string]
   [:date_joined     ms/TemporalInstant]
   [:first_name      [:maybe :string]]
   [:last_name       [:maybe :string]]
   [:last_login      [:maybe ms/TemporalInstant]]
   [:is_superuser    :boolean]
   [:is_data_analyst :boolean]
   [:is_qbnewb       :boolean]
   [:tenant_id       [:maybe ms/PositiveInt]]
   [:common_name     [:maybe :string]]])

(mu/defn user-name-parts-by-id :- [:map-of UserNamePartsById [:map {:closed true}
                                                              [:id              ::lib.schema.id/user]
                                                              [:email           :string]
                                                              [:date_joined     ms/TemporalInstant]
                                                              [:first_name      [:maybe :string]]
                                                              [:last_name       [:maybe :string]]
                                                              [:last_login      [:maybe ms/TemporalInstant]]
                                                              [:is_superuser    :boolean]
                                                              [:is_data_analyst :boolean]
                                                              [:is_qbnewb       :boolean]
                                                              [:tenant_id       [:maybe ms/PositiveInt]]
                                                              [:common_name     [:maybe :string]]]]
  "A map of ID to the first name, last name, and email of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :first_name :last_name :email :id] :id [:in user-ids]))

(def ^:private NonApiKeyUserId
  "Rows returned by [[non-api-key-user-ids]]."
  [:map {:closed true}
   [:id              ::lib.schema.id/user]
   [:email           :string]
   [:date_joined     ms/TemporalInstant]
   [:first_name      [:maybe :string]]
   [:last_name       [:maybe :string]]
   [:last_login      [:maybe ms/TemporalInstant]]
   [:is_superuser    :boolean]
   [:is_data_analyst :boolean]
   [:is_qbnewb       :boolean]
   [:tenant_id       [:maybe ms/PositiveInt]]
   [:common_name     [:maybe :string]]])

(mu/defn non-api-key-user-ids :- [:maybe [:set NonApiKeyUserId]]
  "The IDs of the Users among `user-ids` that are not API key users."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pks-set :model/User :id [:in user-ids] :type [:not= :api-key]))

;;; -------------------------------------------------- Hydration --------------------------------------------------
