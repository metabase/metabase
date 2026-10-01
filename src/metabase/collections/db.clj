(ns metabase.collections.db
  "Application database queries for the collections module. Every function here is a direct Toucan 2 call, with no
  logic beyond verifying its proof, so the rest of the module only touches `toucan2.core` for model definitions,
  hydration methods, and transactions.

  The module is proof-gated, so the mutating functions take a proof from [[metabase.proof.core]] as their only
  argument and write exactly the subject and change set it covers. The writes to a Collection's contents (its
  descendant Collections and the Cards, Dashboards and so on inside them) take cascade proofs derived from the
  Collection's own proof; their subject is a where-clause."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.serialization :as serdes]
   [metabase.proof.core :as proof]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

;;; ---------------------------------------------- Single Collections ----------------------------------------------

(mu/defn collection
  "The ::collections.schema/collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn collection-id-and-namespace
  "The ID and namespace of the ::collections.schema/collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one [:model/Collection :id :namespace] :id collection-id))

(mu/defn collection-of-type
  "The ::collections.schema/collection of `type`, or nil."
  [type :- :string]
  (t2/select-one :model/Collection :type type))

(mu/defn root-remote-synced-collection
  "The top-level remote-synced ::collections.schema/collection, or nil."
  []
  (t2/select-one :model/Collection :is_remote_synced true :location "/"))

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

(mu/defn remote-synced-collection-exists?
  "Whether a remote-synced ::collections.schema/collection with `collection-id` exists."
  [collection-id :- ::lib.schema.id/collection]
  (t2/exists? :model/Collection :id collection-id :is_remote_synced true))

(mu/defn personal-collection?
  "Whether the ::collections.schema/collection with `collection-id` is a personal ::collections.schema/collection."
  [collection-id :- ::lib.schema.id/collection]
  (t2/exists? :model/Collection :id collection-id :personal_owner_id [:not= nil]))

(mu/defn collection-remote-synced?
  "Whether the ::collections.schema/collection with `collection-id` is remote-synced, or nil if `collection-id` is nil (the root
  ::collections.schema/collection) or the ::collections.schema/collection does not exist."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-one-fn :is_remote_synced :model/Collection :id collection-id))

(mu/defn collection-namespace
  "The namespace of the ::collections.schema/collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :namespace :model/Collection :id collection-id))

(mu/defn collection-location
  "The location of the ::collections.schema/collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :location :model/Collection :id collection-id))

(defn collection-location-columns
  "The location, id, and type of the Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one [:model/Collection :location :id :type] :id collection-id))

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
  `metabase.collections.models.collection/visible-collection-filter-clause`. That builder needs this namespace (it
  looks up the Trash, the user's personal Collection subtree, and their root-Collection permission), so this
  namespace cannot call it back without a require cycle — building the clause here means first moving the whole
  Collection-visibility machinery below this namespace."
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

(mu/defn collections-for-serdes-reducible
  "A reducible of the Collections to export via serdes, in stable storage order (which keeps filename de-dup suffixes
  stable across exports, see GHY-3754). The Trash is never exported, nor are archived Collections when
  `skip-archived?`. When `collection-set` is non-empty only those Collections are exported (nil in the set counts as
  the root collection); otherwise every non-personal Collection is. `filter-column` and `filter-ids`, when given,
  further restrict the export to the rows whose `filter-column` is one of `filter-ids`."
  [collection-set :- [:maybe [:or [:set [:maybe ::lib.schema.id/collection]] [:sequential [:maybe ::lib.schema.id/collection]]]]
   skip-archived? :- [:maybe :boolean]
   filter-column  :- [:maybe :keyword]
   filter-ids     :- [:maybe [:sequential [:maybe [:or :int :string]]]]]
  (t2/reducible-select :model/Collection
                       {:where    [:and
                                   (when skip-archived? [:not :archived])
                                   (if (seq collection-set)
                                     [:or
                                      [:in :id collection-set]
                                      (when (some nil? collection-set)
                                        [:= :id nil])]
                                     [:= :personal_owner_id nil])
                                   [:or
                                    [:= :type nil]
                                    [:not= :type collections.schema/trash-collection-type]]
                                   (when filter-column
                                     [:in filter-column filter-ids])]
                        :order-by serdes/stable-storage-order}))

(mu/defn collection-count-by-ids
  "The number of Collections among `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/count :model/Collection :id [:in collection-ids]))

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

(mu/defn child-collection-ids
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

(mu/defn remote-synced-root-collection-ids
  "The IDs of the top-level remote-synced Collections."
  []
  (t2/select-pks-set :model/Collection {:where [:and
                                                [:= :is_remote_synced true]
                                                [:= :location "/"]]}))

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
  "The Collections matching the Honey SQL `query` map. The caller builds the whole query because it needs clause
  builders like `visible-collection-filter-clause`, which live in `metabase.collections.models.collection` and so
  can't be called from here without a require cycle (that namespace already requires this one)."
  [query]
  (t2/select :model/Collection query))

;;; ---------------------------------------------- Collection writes ----------------------------------------------

(defn insert-collection!
  "Insert the Collection row that `proof` covers and return the new instance."
  [proof]
  (let [{:keys [changes]} (proof/verify proof {:model :model/Collection, :operation :create, :subject-kind :none})]
    (t2/insert-returning-instance! :model/Collection changes)))

(def ^:private editable-collection-columns
  "The columns a Collection's editors and its archive, unarchive and move operations write."
  #{:name :description :authority_level :location :is_remote_synced :archive_operation_id :archived_directly :archived})

(defn update-collection!
  "Apply the change set that `proof` covers, over [[editable-collection-columns]], to the Collection it names."
  [proof]
  (let [{:keys [subject changes]} (proof/verify proof {:model        :model/Collection
                                                       :operation    :update
                                                       :subject-kind :id
                                                       :columns      editable-collection-columns})]
    (t2/update! :model/Collection subject changes)))

(defn clear-remote-synced-flags!
  "Mark the Collections that `proof` names as not remote-synced, through the model's update hooks. The proof must
  cover exactly that change set."
  [proof]
  (let [{:keys [subject changes]} (proof/verify proof {:model        :model/Collection
                                                       :operation    :update
                                                       :subject-kind :where
                                                       :columns      #{:is_remote_synced}})]
    (when-not (= changes {:is_remote_synced false})
      (throw (ex-info "Invalid proof: clear-remote-synced-flags! only clears the flag"
                      {:status-code 500, :error :proof/invalid, :actual changes})))
    (t2/update! :model/Collection (proof/where->conditions subject) changes)))

(defn update-descendant-collections!
  "Apply the change set that the cascade `proof` covers (a move, archive or unarchive of the subtree) to the descendant
  Collections its where-clause names, as one SQL statement."
  [proof]
  (let [{:keys [subject changes]} (proof/verify proof {:model        :model/Collection
                                                       :operation    :update
                                                       :subject-kind :where
                                                       :columns      #{:location :is_remote_synced
                                                                       :archive_operation_id :archived_directly
                                                                       :archived}})]
    ;; not `t2/update!`: the change set rewrites `location` with a SQL expression, which the model's update hooks
    ;; could not validate
    (t2/query-one {:update :collection
                   :set    changes
                   :where  subject})))

(defn delete-collection!
  "Delete the Collection that `proof` names."
  [proof]
  (let [{:keys [subject]} (proof/verify proof {:model :model/Collection, :operation :delete, :subject-kind :id})]
    (t2/delete! :model/Collection :id subject)))

(defn delete-descendant-collections!
  "Delete the descendant Collections that the cascade `proof` names."
  [proof]
  (let [{:keys [subject]} (proof/verify proof {:model :model/Collection, :operation :delete, :subject-kind :where})]
    (t2/delete! :model/Collection {:where subject})))

;;; ---------------------------------------------- ::collections.schema/collection contents ----------------------------------------------

(mu/defn instances-with-columns
  "The `columns` of the instances with `ids`."
  [columns :- [:sequential :keyword]
   ids     :- [:set ms/PositiveInt]]
  (t2/select columns :id [:in ids]))

(mu/defn instance-by-id
  "The instance of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one model :id id))

(mu/defn collection-namespaces-of
  "A map of ID to the namespace of the ::collections.schema/collection holding each instance of `model` with `ids`."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :namespace [model :id [:c.namespace :namespace]]
                    {:where [:in (keyword (str (name (t2/table-name model)) ".id")) ids]
                     :join  [[:collection :c] [:= :collection_id :c.id]]}))

(mu/defn dashboard-ids-in-collection
  "The IDs of the Dashboards in the ::collections.schema/collection with `collection-id` (nil for the root ::collections.schema/collection), excluding archived
  ones when `skip-archived?`."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Dashboard
                     {:where [:and [:= :collection_id collection-id] (when skip-archived? [:not :archived])]}))

(defn cards-in-collection
  "The Cards in the Collection with `collection-id`."
  [collection-id]
  (t2/select :model/Card :collection_id collection-id))

(mu/defn card-ids-in-collection
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

(mu/defn document-ids-in-collection
  "The IDs of the non-exploration Documents in the ::collections.schema/collection with `collection-id`, excluding archived ones when
  `skip-archived?`."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Document {:where [:and
                                              [:= :collection_id collection-id]
                                              [:= :exploration_id nil]
                                              (when skip-archived? [:not :archived])]}))

(mu/defn timeline-ids-in-collection
  "The IDs of the Timelines in the ::collections.schema/collection with `collection-id`, excluding archived ones when `skip-archived?`."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Timeline
                     {:where [:and [:= :collection_id collection-id] (when skip-archived? [:not :archived])]}))

(mu/defn published-table-ids-in-collection
  "The IDs of the published Tables in the ::collections.schema/collection with `collection-id`, excluding archived ones when
  `skip-archived?`."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Table {:from [(warehouse-schema-overlay/table-query)]
                                   :where [:and
                                           [:= :collection_id collection-id]
                                           [:= :is_published true]
                                           (when skip-archived? [:= :archived_at nil])]}))

(mu/defn transform-ids-in-collection
  "The IDs of the Transforms in the ::collections.schema/collection with `collection-id`."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-pks-set :model/Transform {:where [:= :collection_id collection-id]}))

(mu/defn published-table-ids-in-collections
  "The IDs of the published Tables in the Collections with `collection-ids`."
  [collection-ids :- [:or [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]
  (t2/select-pks-set :model/Table :collection_id [:in collection-ids] :is_published true {:from [(warehouse-schema-overlay/table-query)]}))

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
             :from            [(warehouse-schema-overlay/table-query)]
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

(defn unarchived-dashboard-collection-ids-in
  "The distinct `:collection_id`s of the unarchived Dashboards in the Collections with `collection-ids`."
  [collection-ids]
  (t2/query {:select-distinct [:collection_id]
             :from            :report_dashboard
             :where           [:and
                               [:= :archived false]
                               [:in :collection_id collection-ids]]}))

(defn collection-children-rows
  "The rows matching the collection-children Honey SQL `query`, built by `metabase.collections.children` from the
  per-model item queries for a Collection's paginated child listing. Follows the same exception as
  `metabase.search.db` for spec-driven Honey SQL that can't be reduced to plain-data parameters."
  [query]
  (app-db/query query))

(defn collection-filter-metadata-rows
  "The rows matching the collection-filter-metadata Honey SQL `query`, built by `metabase.collections.children` to
  probe which item models have at least one visible child in a Collection. Follows the same exception as
  `metabase.search.db` for spec-driven Honey SQL that can't be reduced to plain-data parameters."
  [query]
  (app-db/query query))

;;; ------------------------------------------------ Permissions ------------------------------------------------

(mu/defn user-has-root-collection-permission?
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

;;; ---------------------------------------------------- Users ----------------------------------------------------

(mu/defn user-type
  "The type of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :type :model/User user-id))

(mu/defn user-name-parts-by-id
  "A map of ID to the first name, last name, and email of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :first_name :last_name :email :id] :id [:in user-ids]))

(mu/defn non-api-key-user-ids
  "The IDs of the Users among `user-ids` that are not API key users."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pks-set :model/User :id [:in user-ids] :type [:not= :api-key]))

;;; -------------------------------------------------- Hydration --------------------------------------------------
