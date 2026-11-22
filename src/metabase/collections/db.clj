(ns metabase.collections.db
  "Application database queries for the collections module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ---------------------------------------------- Single Collections ----------------------------------------------

(mu/defn synced-collections-clause :- [:fn vector?]
  "The clause over the Collection table aliased `alias` selecting the collections remote sync syncs: the synced
  top-level ones with their descendants, and those of the `always-synced` namespaces."
  [always-synced :- [:sequential :keyword]
   alias         :- :keyword
   opts          :- ::remote-sync.schema/synced-filter-opts]
  (let [column #(u/qualified-key alias %)]
    [:and
     (when-not (:include-archived? opts)
       [:= (column :archived) false])
     [:or
      [:exists ^:allow-subquery {:select [[[:inline 1] :one]]
                                 :from   [[(t2/table-name :model/Collection) :synced_root]]
                                 :where  [:and
                                          [:= :synced_root.is_remote_synced true]
                                          [:= :synced_root.location "/"]
                                          [:or
                                           [:= :synced_root.id (column :id)]
                                           [:like (column :location)
                                            [:concat (h2x/literal "/") :synced_root.id (h2x/literal "/%")]]]]}]
      [:in (column :namespace) (mapv name always-synced)]]]))

(mu/defn collection
  "The ::collections.schema/collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn collection-for-content-checks
  "The ID, namespace, type and `archived` flag of the ::collections.schema/collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one [:model/Collection :id :namespace :type :archived] :id [:auto/param collection-id]))

(mu/defn collection-of-type
  "The ::collections.schema/collection of `type`, or nil."
  [type :- :string]
  (t2/select-one :model/Collection :type type))

(mu/defn collection-ids-with-type
  "The IDs of the Collections of `type`."
  [type :- :string]
  (t2/select-pks-set :model/Collection :type type))

(mu/defn personal-collection-of-user
  "The personal ::collections.schema/collection of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/Collection :personal_owner_id user-id))

(mu/defn collection-exists?
  "Whether a ::collections.schema/collection with `collection-id` exists. `collection-id` may be nil for an item in the root
  ::collections.schema/collection, which always answers false."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/exists? :model/Collection :id collection-id))

(mu/defn unarchived-collection-exists?
  "Whether an unarchived ::collections.schema/collection with `collection-id` exists."
  [collection-id :- ::lib.schema.id/collection]
  (t2/exists? :model/Collection :id collection-id :archived false))

(mu/defn personal-collection?
  "Whether the ::collections.schema/collection with `collection-id` is a personal ::collections.schema/collection."
  [collection-id :- ::lib.schema.id/collection]
  (t2/exists? :model/Collection :id collection-id :personal_owner_id [:not= nil]))

(mu/defn collection-sync-columns
  "The id, type, namespace and `is_remote_synced` of the Collections with `collection-ids`, which tell whether remote
  sync syncs each."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select [:model/Collection :id :type :namespace :is_remote_synced] :id [:in collection-ids]))

(mu/defn collection-remote-synced?
  "Whether the ::collections.schema/collection with `collection-id` is remote-synced, or nil if `collection-id` is nil (the root
  ::collections.schema/collection) or the ::collections.schema/collection does not exist."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-one-fn :is_remote_synced :model/Collection :id collection-id))

(mu/defn collection-locations :- [:map-of ::lib.schema.id/collection :string]
  "The map from id to location of the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-fn->fn :id :location :model/Collection :id [:in [:auto/param collection-ids]]))

(defn collection-location-columns
  "The location, id, and type of the Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one [:model/Collection :location :id :type :namespace :is_remote_synced] :id collection-id))

(mu/defn root-collection-type-by-id
  "The type of the top-level Collection with `collection-id`, or nil if it is not top-level."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :type :model/Collection :id collection-id :location "/"))

;;; ---------------------------------------------- ::collections.schema/collection sets ----------------------------------------------

(mu/defn collections-by-id
  "A map of ID to ::collections.schema/collection for `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pk->fn identity :model/Collection :id [:in collection-ids]))

(mu/defn collection-columns-by-id
  "A map of ID to the `columns` of the Collections with `collection-ids`."
  [columns        :- [:sequential :keyword]
   collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pk->fn identity (into [:model/Collection] columns) :id [:in collection-ids]))

(mu/defn collection-archived-flags
  "A map of ID to `:archived` for `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pk->fn :archived :model/Collection :id [:in collection-ids]))

(mu/defn archived-collection-ids-among
  "The IDs among `collection-ids` of the Collections that are archived."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (if (seq collection-ids)
    (set (t2/select-pks-set :model/Collection :id [:in collection-ids] :archived true))
    #{}))

(mu/defn collection-archived?
  "Whether the Collection with `collection-id` is archived, which the root, nil, never is."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (boolean (when collection-id
             (t2/select-one-fn :archived :model/Collection :id collection-id))))

(mu/defn collections-in-namespace
  "The Collections in the namespace named `namespace-name`."
  [namespace-name :- :string]
  (t2/select :model/Collection :namespace namespace-name))

(mu/defn archived-collections-in-operations
  "The archived Collections belonging to the archive operations with `archive-operation-ids`."
  [archive-operation-ids :- [:sequential :string]]
  (t2/select :model/Collection :archive_operation_id [:in archive-operation-ids] :archived true))

(mu/defn ancestor-summaries
  "The name, ID, and owner of the Collections with `collection-ids`, ordered by location."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select [:model/Collection :name :id :personal_owner_id] :id [:in collection-ids] {:order-by [:location]}))

(mu/defn descendant-summaries
  "The name, ID, location, and description of the descendant Collections of the ::collections.schema/collection at
  `children-location-prefix` (see `metabase.collections.models.collection/children-location`), excluding other
  users' Personal Collections (Personal Collections owned by `current-user-id` are still included). When
  `archived?` is given (true or false, not nil), further restricted to that archived status.

  `visibility-clause` is the one Honey SQL argument left in this namespace, and is always a
  `perms/visible-collections-filter-clause` built by the caller."
  [children-location-prefix :- :string
   current-user-id          :- [:maybe ::lib.schema.id/user]
   archived?                :- [:maybe :boolean]
   visibility-clause        :- [:maybe vector?]]
  (t2/select [:model/Collection :name :id :location :description]
             {:where [:and
                      [:like :location (str children-location-prefix "%")]
                      [:or
                       [:= :personal_owner_id nil]
                       [:= :personal_owner_id current-user-id]]
                      (when (some? archived?)
                        [:= :archived archived?])
                      visibility-clause]}))

(mu/defn descendant-summaries-with-type
  "The name, ID, location, description, and type of the Collections directly under any of `location-prefixes`
  (compared with SQL `LIKE`), excluding personal Collections that don't belong to `current-user-id`."
  [location-prefixes :- [:sequential :string]
   current-user-id   :- [:maybe ::lib.schema.id/user]]
  (t2/select [:model/Collection :name :id :location :description :type]
             {:where [:and
                      (into [:or] (map (fn [prefix] [:like :location prefix])) location-prefixes)
                      [:or [:= :personal_owner_id nil] [:= :personal_owner_id current-user-id]]]}))

(mu/defn effective-children
  "The ID, name, description, and type of the Collections matching `effective-children-clause`, a
  `metabase.collections.models.collection/effective-children-where-clause`.

  Like [[descendant-summaries]]'s `visibility-clause`, that builder needs this namespace and so cannot be called
  from here."
  [effective-children-clause :- [:maybe vector?]]
  (t2/select [:model/Collection :id :name :description :type] {:where effective-children-clause}))

(mu/defn collection-count-of-types
  "The number of Collections with `collection-id` whose type is one of `types`."
  [collection-id :- ::lib.schema.id/collection
   types         :- [:sequential :string]]
  (t2/count :model/Collection :id collection-id :type [:in types]))

(mu/defn remote-synced-collection-count
  "The number of remote-synced Collections."
  []
  (t2/count :model/Collection :is_remote_synced true))

(mu/defn collection-ids-with-location-like
  "The IDs of the Collections whose location matches the SQL `pattern`."
  [pattern :- :string]
  (t2/select-pks-set :model/Collection :location [:like pattern]))

(mu/defn collection-ids-with-location-like-any
  "The IDs of the Collections whose location matches any of the SQL `patterns`."
  [patterns :- [:sequential {:min 1} :string]]
  (t2/select-pks-set :model/Collection {:where (into [:or] (map (fn [pattern] [:like :location pattern])) patterns)}))

(mu/defn unarchived-collection-ids-with-location-like
  "The IDs of the unarchived Collections whose location matches the SQL `pattern`."
  [pattern :- :string]
  (t2/select-pks-set :model/Collection :location [:like pattern] :archived false))

(mu/defn archived-collection-ids-in-operation-with-location-like
  "The IDs of the archived Collections of the archive operation with `archive-operation-id` whose location matches
  the SQL `pattern`."
  [pattern              :- :string
   archive-operation-id :- :string]
  (t2/select-pks-set :model/Collection
                     :location [:like pattern]
                     :archive_operation_id [:= archive-operation-id]
                     :archived [:= true]))

(mu/defn collection-ids-of-type
  "The IDs of the Collections among `collection-ids` of `type`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   type           :- :string]
  (t2/select-pks-set :model/Collection :id [:in collection-ids] :type type))

(mu/defn personal-collection-ids
  "The IDs of every personal ::collections.schema/collection."
  []
  (t2/select-pks-set :model/Collection :personal_owner_id [:not= nil]))

(mu/defn personal-collection-ids-by-owner
  "A map of owner User ID to personal ::collections.schema/collection ID for `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-fn->pk :personal_owner_id :model/Collection :personal_owner_id [:in user-ids]))

(defn other-users-personal-collection-ids
  "The IDs of the personal Collections owned by Users other than `user-id`."
  [user-id]
  (t2/select-fn-set :id :model/Collection
                    {:where [:and [:!= :personal_owner_id nil] [:!= :personal_owner_id user-id]]}))

(defn collections-matching
  "The Collections matching the Honey SQL `query` map, which the caller builds."
  [query]
  (t2/select :model/Collection (h2x/assert-map-or-nil! query)))

;;; ------------------------------------------- Reference check clauses --------------------------------------------

(mu/defn- collection-ok-clause :- [:fn vector?]
  "The condition that is true for a row of the table aliased `alias` whose `column` is nil, the root Collection, or
  names a Collection that satisfies `parent-condition`, a condition over the Collection aliased `parent`."
  [alias            :- :keyword
   column           :- :keyword
   parent-condition :- [:fn vector?]]
  (let [reference (u/qualified-key alias column)]
    [:or
     [:= reference nil]
     [:exists ^:allow-subquery {:select [[[:inline 1] :one]]
                                :from   [[(t2/table-name :model/Collection) :parent]]
                                :where  [:and [:= :parent.id reference] parent-condition]}]]))

(mu/defn namespace-ok-clause :- [:fn vector?]
  "The condition that is true for a row of the table aliased `alias` whose Collection in `column`, if any, is in one of
  `namespaces`, keywords where nil is the default namespace."
  [alias      :- :keyword
   column     :- :keyword
   namespaces :- [:set [:maybe :keyword]]]
  (collection-ok-clause alias column
                        (into [:or]
                              (cond-> []
                                (seq (remove nil? namespaces)) (conj [:in :parent.namespace (mapv name (remove nil? namespaces))])
                                (contains? namespaces nil)     (conj [:= :parent.namespace nil])))))

(mu/defn type-ok-clause :- [:fn vector?]
  "The condition that is true for a row of the table aliased `alias` whose Collection in `column`, if any, has no type
  or one of `types`, strings."
  [alias  :- :keyword
   column :- :keyword
   types  :- [:sequential :string]]
  (collection-ok-clause alias column
                        [:or [:= :parent.type nil] [:in :parent.type types]]))

(mu/defn type-not-in-ok-clause :- [:fn vector?]
  "The condition that is true for a row of the table aliased `alias` whose Collection in `column`, if any, has none of
  `types`, strings."
  [alias  :- :keyword
   column :- :keyword
   types  :- [:sequential :string]]
  (collection-ok-clause alias column
                        [:or [:= :parent.type nil] [:not-in :parent.type types]]))

(mu/defn not-archived-ok-clause :- [:fn vector?]
  "The condition that is true for a row of the table aliased `alias` whose Collection in `column`, if any, is not
  archived."
  [alias  :- :keyword
   column :- :keyword]
  (collection-ok-clause alias column [:= :parent.archived false]))

(mu/defn not-trash-ok-clause :- [:fn vector?]
  "The condition that is true for a row of the table aliased `alias` whose Collection in `column`, if any, is not the
  Trash."
  [alias  :- :keyword
   column :- :keyword]
  (collection-ok-clause alias column [:or [:= :parent.type nil] [:not= :parent.type "trash"]]))

;;; ---------------------------------------------- Collection writes ----------------------------------------------

(def ^:private collection-write-keys
  [:name :description :archived :location :personal_owner_id :slug :namespace :authority_level :entity_id :created_at :type :is_sample :archive_operation_id :archived_directly :is_remote_synced])

(mu/defn insert-collections!
  "Insert the Collection `rows`, with one statement for each set of columns they have, and return the new instances, in the order of `rows`."
  [rows :- [:sequential (mut/select-keys ::collections.schema/collection collection-write-keys)]]
  (app-db/insert-returning-instances! :model/Collection rows))

(mu/defn update-collections!
  "Apply `changes` to the Collections with `collection-ids`, returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   changes        :- (mut/select-keys ::collections.schema/collection collection-write-keys)]
  (t2/update! :model/Collection :id [:in collection-ids] changes))

(mu/defn update-collections-by-columns!
  "Apply the columns of each of `id+columns`, a pair of the id of a Collection and the columns to write to it, with one
  statement for each distinct set of columns, returning nil."
  [id+columns :- [:sequential [:tuple ::lib.schema.id/collection (mut/select-keys ::collections.schema/collection collection-write-keys)]]]
  (doseq [[columns pairs] (group-by second id+columns)]
    (update-collections! (mapv first pairs) columns))
  nil)

(mu/defn delete-collections!
  "Delete the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Collection :id [:in collection-ids]))

(defn- location-below
  "The condition that the location matches the prefix `children-location`, that of a Collection's descendants."
  [children-location]
  [:like :location (str children-location "%")])

(mu/defn collections-below
  "The ID and location of the Collections under any of `children-locations`, those of their parents."
  [children-locations :- [:sequential :string]]
  (if (seq children-locations)
    (t2/select [:model/Collection :id :location] {:where (into [:or] (map location-below) children-locations)})
    []))

(mu/defn unarchived-collections-below
  "The unarchived Collections under any of `children-locations`, those of their parents."
  [children-locations :- [:sequential :string]]
  (if (seq children-locations)
    (t2/select :model/Collection
               {:where [:and [:= :archived false] (into [:or] (map location-below) children-locations)]})
    []))

(mu/defn restorable-collections-below
  "The archived Collections of the archive operation `operation-id` under `children-location`, for each
  `[children-location operation-id]` of `locations+operations`."
  [locations+operations :- [:sequential [:tuple :string :string]]]
  (if (seq locations+operations)
    (t2/select :model/Collection
               {:where [:and
                        [:= :archived true]
                        (into [:or]
                              (map (fn [[children-location operation-id]]
                                     [:and (location-below children-location) [:= :archive_operation_id operation-id]]))
                              locations+operations)]})
    []))

(mu/defn move-descendant-collections!
  "Move the Collections under the old children locations of `moves`, each `{:old-location :new-location
  :remote-synced?}`, to the new ones and set their `is_remote_synced`, except the Collections with `except-ids`, which
  a Collection under more than one location follows the nearest of, in one statement, returning the number updated."
  [moves      :- [:sequential [:map [:old-location :string] [:new-location :string] [:remote-synced? :boolean]]]
   except-ids :- [:sequential ::lib.schema.id/collection]]
  (let [nearest-first (sort-by (comp - count :old-location) moves)]
    (t2/query-one {:update :collection
                   :set    {:location         (into [:case]
                                                    (mapcat (fn [{:keys [old-location new-location]}]
                                                              [(location-below old-location)
                                                               [:replace :location old-location new-location]]))
                                                    nearest-first)
                            :is_remote_synced (into [:case]
                                                    (mapcat (fn [{:keys [old-location remote-synced?]}]
                                                              [(location-below old-location) remote-synced?]))
                                                    nearest-first)}
                   :where  [:and
                            (into [:or] (map (comp location-below :old-location)) moves)
                            (when (seq except-ids) [:not-in :id except-ids])]})))

(mu/defn collection-remote-synced-by-item-id
  "The `:id` of each of the `model` rows with `ids` and the `:is_remote_synced` of its Collection, as stored."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select [model :id [:c.is_remote_synced :is_remote_synced]]
             {:where [:in (keyword (str (name (t2/table-name model)) ".id")) ids]
              :join  [[:collection :c] [:= :collection_id :c.id]]}))

(mu/defn subtree-locations-to-flag :- [:sequential [:map [:id ::lib.schema.id/collection] [:location :string]]]
  "The `:id` and `:location` of the ::collections.schema/collection with `collection-id` and of the Collections whose
  location starts with `children-location`, among those whose `:is_remote_synced` is not `remote-synced?`."
  [collection-id     :- ::lib.schema.id/collection
   children-location :- :string
   remote-synced?    :- :boolean]
  (t2/select [:model/Collection :id :location]
             {:where [:and
                      [:not= :is_remote_synced remote-synced?]
                      [:or [:= :id collection-id] [:like :location (str children-location "%")]]]}))

(mu/defn remote-synced-collection-locations :- [:sequential [:map [:id ::lib.schema.id/collection] [:location :string]]]
  "The `:id` and `:location` of every remote-synced ::collections.schema/collection."
  []
  (t2/select [:model/Collection :id :location] :is_remote_synced true))

;;; ---------------------------------------------- ::collections.schema/collection contents ----------------------------------------------

(mu/defn collection-namespaces-of
  "A map of ID to the namespace of the ::collections.schema/collection holding each instance of `model` with `ids`."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :namespace [model :id [:c.namespace :namespace]]
                    {:where [:in (keyword (str (name (t2/table-name model)) ".id")) ids]
                     :join  [[:collection :c] [:= :collection_id :c.id]]}))

(defn- archivable-conditions
  "The key-value conditions of the rows in the Collections with `collection-ids` that archiving them archives."
  [collection-ids]
  [:collection_id [:in collection-ids] :archived false])

(mu/defn items-archived-with-collections
  "The unarchived `model` rows in the Collections with `collection-ids`, which archiving them archives along with
  them."
  [model          :- :keyword
   collection-ids :- [:sequential ::lib.schema.id/collection]]
  (apply t2/select model (archivable-conditions collection-ids)))

(mu/defn item-ids-archived-with-collections
  "The IDs of the rows of [[items-archived-with-collections]]."
  [model          :- :keyword
   collection-ids :- [:sequential ::lib.schema.id/collection]]
  (apply t2/select-pks-vec model (archivable-conditions collection-ids)))

(defn- archived-parent-exists
  "The condition that the `parent-table` row that `child-column` names is archived."
  [parent-table child-column]
  [:exists ^:allow-subquery {:select [:parent.id]
                             :from   [[parent-table :parent]]
                             :where  [:and [:= :parent.id child-column] [:= :parent.archived true]]}])

(def ^:private archived-parent-clauses
  "The conditions that keep a row from being restored along with its Collection while the Dashboard, Document or
  Exploration it belongs to stays archived, by model."
  {:model/Card     [[:not (archived-parent-exists :report_dashboard :report_card.dashboard_id)]
                    [:not (archived-parent-exists :document :report_card.document_id)]]
   :model/Document [[:not (archived-parent-exists :exploration :document.exploration_id)]]})

(defn- restorable-where
  "The condition on the `model` rows in the Collections with `collection-ids` that restoring them restores."
  [model collection-ids]
  (into [:and
         [:in :collection_id collection-ids]
         [:= :archived true]
         [:= :archived_directly false]]
        (get archived-parent-clauses model)))

(mu/defn items-restored-with-collections
  "The `model` rows in the Collections with `collection-ids` that were archived along with them, unless the Dashboard,
  Document or Exploration they belong to is still archived, which restoring them restores along with them."
  [model          :- :keyword
   collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select model {:where (restorable-where model collection-ids)}))

(mu/defn item-ids-restored-with-collections
  "The IDs of the rows of [[items-restored-with-collections]]."
  [model          :- :keyword
   collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pks-vec model {:where (restorable-where model collection-ids)}))

(mu/defn pulse-ids-archived-with-collections
  "The IDs of the unarchived Pulses in the Collections with `collection-ids`, which archiving them archives along with
  them, leaving out dashboard subscriptions, which follow their Dashboard's `archived` flag."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pks-vec :model/Pulse :collection_id [:in collection-ids], :dashboard_id nil, :archived false))

(mu/defn pulse-ids-restored-with-collections
  "The IDs of the Pulses in the Collections with `collection-ids` that were archived along with them, leaving out
  dashboard subscriptions as [[pulse-ids-archived-with-collections]] does."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pks-vec :model/Pulse :collection_id [:in collection-ids], :dashboard_id nil, :archived true
                     :archived_directly false))

(mu/defn card-ids-in-collections
  "The IDs of the Cards in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pks-vec :model/Card :collection_id [:in collection-ids]))

(mu/defn dashboard-ids-in-collections
  "The IDs of the Dashboards in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pks-vec :model/Dashboard :collection_id [:in collection-ids]))

(mu/defn pulse-ids-in-collections
  "The IDs of the Pulses in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pks-vec :model/Pulse :collection_id [:in collection-ids]))

(mu/defn published-table-ids-in-collections
  "The IDs of the published Tables in the Collections with `collection-ids`."
  [collection-ids :- [:or [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]
  (set (t2/select-pks-set :model/Table :collection_id [:in collection-ids] :is_published true)))

(defn cards-in-collection
  "The Cards in the Collection with `collection-id`."
  [collection-id]
  (t2/select :model/Card :collection_id collection-id))

(mu/defn dashboard-ids-with-cards
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

(defn unarchived-card-collection-types-in-reducible
  "A reducible of the distinct Collection ID and type of the unarchived Cards in the Collections with
  `collection-ids`, leaving out dashboard questions when `exclude-dashboard-questions?`."
  [collection-ids exclude-dashboard-questions?]
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:and
                                         (when exclude-dashboard-questions?
                                           [:= :dashboard_id nil])
                                         [:= :archived false]
                                         [:in :collection_id collection-ids]]}))

(defn published-table-collection-ids-in
  "The distinct `:collection_id`s of the published, unarchived Tables in the Collections with `collection-ids`."
  [collection-ids]
  (t2/query {:select-distinct [:collection_id]
             :from            [(t2/table-name :model/Table)]
             :where           [:and
                               [:= :is_published true]
                               [:= :archived_at nil]
                               [:in :collection_id collection-ids]]}))

(defn transform-collection-ids-in
  "The distinct `:collection_id`s of the Transforms with one of `source-types` in the Collections with
  `collection-ids`."
  [collection-ids source-types]
  (t2/query {:select-distinct [:collection_id]
             :from            :transform
             :where           [:and
                               [:in :collection_id collection-ids]
                               [:in :source_type source-types]]}))

(defn unarchived-action-collection-ids-in
  "The distinct `:collection_id`s of the unarchived Actions in the Collections with `collection-ids`."
  [collection-ids]
  (t2/query {:select-distinct [:collection_id]
             :from            :action
             :where           [:and
                               [:= :archived false]
                               [:in :collection_id collection-ids]]}))

(defn unarchived-dashboard-collection-ids-in
  "The distinct `:collection_id`s of the unarchived Dashboards in the Collections with `collection-ids`."
  [collection-ids]
  (t2/query {:select-distinct [:collection_id]
             :from            :report_dashboard
             :where           [:and
                               [:= :archived false]
                               [:in :collection_id collection-ids]]}))

(defn collection-children-rows
  "The rows matching the collection-children Honey SQL `query`, built by `metabase.collection-items.core` from the
  per-model item queries for a Collection's paginated child listing. Follows the same exception as
  `metabase.search.db` for spec-driven Honey SQL that can't be reduced to plain-data parameters."
  [query]
  (app-db/query query))

(defn collection-filter-metadata-rows
  "The rows matching the collection-filter-metadata Honey SQL `query`, built by `metabase.collection-items.core` to
  probe which item models have at least one visible child in a Collection. Follows the same exception as
  `metabase.search.db` for spec-driven Honey SQL that can't be reduced to plain-data parameters."
  [query]
  (app-db/query query))

;;; ------------------------------------------------ Permissions ------------------------------------------------

(mu/defn group-ids-by-permission-object :- [:map-of :string [:set ms/PositiveInt]]
  "A map of each of `objects` that a Permissions row exists for to the set of the IDs of the groups holding it."
  [objects :- [:sequential :string]]
  (if (seq objects)
    (reduce (fn [m {:keys [object group_id]}] (update m object (fnil conj #{}) group_id))
            {}
            (t2/select [:model/Permissions :object :group_id] :object [:in objects]))
    {}))

;;; ---------------------------------------------------- Users ----------------------------------------------------

(mu/defn user-type
  "The type of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :type :model/User :id user-id))

(mu/defn user-name-parts-by-id
  "A map of ID to the first name, last name, and email of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :first_name :last_name :email :id] :id [:in user-ids]))

(mu/defn api-key-user-ids
  "The IDs of the Users among `user-ids` that are API key users."
  [user-ids :- [:set ::lib.schema.id/user]]
  (set (t2/select-pks-set :model/User :id [:in user-ids] :type :api-key)))

(mu/defn personal-collection-ids-among
  "The IDs of the personal Collections among `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (if (seq collection-ids)
    (set (t2/select-pks-set :model/Collection :id [:in collection-ids] :personal_owner_id [:not= nil]))
    #{}))

(mu/defn non-api-key-user-ids
  "The IDs of the Users among `user-ids` that are not API key users."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pks-set :model/User :id [:in user-ids] :type [:not= :api-key]))

(mu/defn synced-collection-items :- [:sequential ::collections.schema/collection]
  "The Collections with `ids`, with their ancestors, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (-> (t2/select [:model/Collection :id :name :type :location] :id [:in ids])
      (t2/hydrate :effective_ancestors)))

(mu/defn personal-root-collection-ids :- [:sequential ::lib.schema.id/collection]
  "The IDs of the personal Collections at the root, those of the users."
  []
  (or (t2/select-pks-vec :model/Collection :personal_owner_id [:not= nil] :location "/") []))
