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
   [:perm_value  {:optional true} [:maybe [:or :keyword :string]]]
   [:perm_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]])

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

(mu/defn collection-of-type-in-worktree
  "The ::collections.schema/collection of `type` belonging to the remote-sync worktree with `worktree-id` (nil for the
  main app), or nil."
  [type        :- :string
   worktree-id :- [:maybe ::lib.schema.id/worktree]]
  (t2/select-one :model/Collection :type type :worktree_id worktree-id))

(mu/defn collection-worktree-id
  "The `:worktree_id` of the ::collections.schema/collection with `collection-id`: the remote-sync worktree it was
  checked out into, or nil for the main app."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :worktree_id :model/Collection :id collection-id))

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

(mu/defn root-collection-type-by-id
  "The type of the top-level ::collections.schema/collection with `collection-id`, or nil if it is not top-level."
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

(mu/defn descendant-summaries-with-type
  "The name, ID, location, description, and type of the Collections directly under any of `location-prefixes`
  (compared with SQL `LIKE`), excluding personal Collections that don't belong to `current-user-id`."
  [location-prefixes :- [:sequential :string]
   current-user-id   :- [:maybe ::lib.schema.id/user]]
  (t2/select [:model/Collection :name :id :location :description :type]
             {:where [:and
                      (into [:or] (map (fn [prefix] [:like :location prefix])) location-prefixes)
                      [:or [:= :personal_owner_id nil] [:= :personal_owner_id current-user-id]]]}))

(mu/defn worktree-collection-counterpart-rows
  "For each worktree Collection among `collection-ids`, a row of its `:worktree_collection_id` and the
  `:main_collection_id` of the main-app Collection it is a copy of, resolved through the `worktree_remapping` table.
  Queries the table rather than `:model/WorktreeRemapping`: the model is enterprise-only, while the table exists on
  both editions."
  [collection-ids :- [:or [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]
  (t2/query {:select [[:wt.id :worktree_collection_id] [:mc.id :main_collection_id]]
             :from   [[:collection :wt]]
             :join   [[:worktree_remapping :wr] [:= :wr.local_entity_id :wt.entity_id]
                      [:collection :mc]         [:= :mc.entity_id :wr.source_entity_id]]
             :where  [:and
                      [:= :wr.type "Collection"]
                      [:= :mc.worktree_id nil]
                      [:in :wt.id collection-ids]]}))

(mu/defn effective-children-where
  "The ID, name, description, and type of the Collections matching the Honey SQL `where`."
  [where :- [:maybe vector?]]
  (t2/select [:model/Collection :id :name :description :type] {:where where}))

(mu/defn collections-for-serdes-reducible
  "Reducible Collections matching the Honey SQL `where` in stable storage order."
  [where :- [:maybe vector?]]
  (t2/reducible-select :model/Collection {:where where, :order-by serdes/stable-storage-order}))

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
  "The number of remote-synced main-app Collections. A worktree's collections are all remote-synced -- a worktree is
  a checkout of a branch -- and say nothing about whether the main app syncs."
  []
  (t2/count :model/Collection :is_remote_synced true :worktree_id nil))

(mu/defn collection-ids-with-location-like
  "The IDs of the Collections whose location matches the SQL `pattern`."
  [pattern :- :string]
  (t2/select-pks-set :model/Collection :location [:like pattern]))

(mu/defn unarchived-collection-ids-with-location-like
  "The IDs of the unarchived Collections whose location matches the SQL `pattern`."
  [pattern :- :string]
  (t2/select-pks-set :model/Collection :location [:like pattern] :archived false))

(mu/defn not-yet-archived-collection-ids-with-location-like
  "The IDs of the Collections whose location matches the SQL `pattern` and that are not marked archived."
  [pattern :- :string]
  (t2/select-pks-set :model/Collection :location [:like pattern] :archived [:not= true]))

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

;;; ---------------------------------------------- ::collections.schema/collection writes ----------------------------------------------

(mu/defn insert-collection!
  "Insert `collection` and return the new instance."
  [collection :- (mut/select-keys ::collections.schema/collection.update [:name :description :archived :location :personal_owner_id :slug :namespace :authority_level :entity_id :created_at :type :is_sample :archive_operation_id :archived_directly :is_remote_synced :worktree_id])]
  (t2/insert-returning-instance! :model/Collection collection))

(mu/defn update-collection!
  "Apply `changes` to the ::collections.schema/collection with `collection-id`, returning the number updated."
  [collection-id :- ::lib.schema.id/collection
   changes       :- (mut/select-keys ::collections.schema/collection.update [:name :description :archived :location :personal_owner_id :slug :namespace :authority_level :entity_id :created_at :type :is_sample :archive_operation_id :archived_directly :is_remote_synced :worktree_id])]
  (t2/update! :model/Collection collection-id changes))

(mu/defn clear-remote-synced-flags!
  "Mark every remote-synced main-app ::collections.schema/collection as not remote-synced, returning the number
  updated. A worktree's collections keep the flag: they are a checkout of a branch, and turning the main app's
  remote sync off does not un-check-them-out."
  []
  (t2/update! :model/Collection :is_remote_synced true :worktree_id nil {:is_remote_synced false}))

(mu/defn archive-descendant-collections!
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

(mu/defn unarchive-descendant-collections!
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

(mu/defn move-descendant-collections!
  "Move the Collections under `orig-children-location` to `new-children-location` and set `remote-synced?`,
  returning the number updated."
  [orig-children-location :- :string
   new-children-location  :- :string
   remote-synced?         :- :boolean]
  (t2/query-one {:update :collection
                 :set    {:location         [:replace :location orig-children-location new-children-location]
                          :is_remote_synced remote-synced?}
                 :where  [:like :location (str orig-children-location "%")]}))

(mu/defn delete-collections-at-location!
  "Delete the Collections directly at `location`, returning the number deleted."
  [location :- :string]
  (t2/delete! :model/Collection :location location))

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

(mu/defn set-pulse-archived-in-collections!
  "Set `archived?` on the Pulses in the Collections with `collection-ids`, returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Pulse {:collection_id [:in collection-ids]} {:archived archived?}))

(mu/defn set-native-query-snippet-archived-in-collections!
  "Set `archived?` on the NativeQuerySnippets in the Collections with `collection-ids`, returning the number
  updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/NativeQuerySnippet {:collection_id [:in collection-ids]} {:archived archived?}))

(mu/defn set-timeline-archived-in-collections!
  "Set `archived?` on the Timelines in the Collections with `collection-ids`, returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Timeline {:collection_id [:in collection-ids]} {:archived archived?}))

(mu/defn set-card-archived-in-collections-not-directly!
  "Set `archived?` on the Cards in the Collections with `collection-ids` that were not archived directly, returning
  the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Card {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(mu/defn set-dashboard-archived-in-collections-not-directly!
  "Set `archived?` on the Dashboards in the Collections with `collection-ids` that were not archived directly,
  returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Dashboard {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(mu/defn set-document-archived-in-collections-not-directly!
  "Set `archived?` on the Documents in the Collections with `collection-ids` that were not archived directly,
  returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Document {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(mu/defn set-exploration-archived-in-collections-not-directly!
  "Set `archived?` on the Explorations in the Collections with `collection-ids` that were not archived directly,
  returning the number updated."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   archived?      :- :boolean]
  (t2/update! :model/Exploration {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(mu/defn delete-cards-in-collections!
  "Delete the Cards in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Card :collection_id [:in collection-ids]))

(mu/defn delete-dashboards-in-collections!
  "Delete the Dashboards in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Dashboard :collection_id [:in collection-ids]))

(mu/defn delete-native-query-snippets-in-collections!
  "Delete the NativeQuerySnippets in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/NativeQuerySnippet :collection_id [:in collection-ids]))

(mu/defn delete-pulses-in-collections!
  "Delete the Pulses in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Pulse :collection_id [:in collection-ids]))

(mu/defn delete-timelines-in-collections!
  "Delete the Timelines in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Timeline :collection_id [:in collection-ids]))

(mu/defn dashboard-ids-in-collection
  "The IDs of the Dashboards in the ::collections.schema/collection with `collection-id` (nil for the root ::collections.schema/collection), excluding archived
  ones when `skip-archived?`."
  [collection-id  :- [:maybe ::lib.schema.id/collection]
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Dashboard
                     {:where [:and [:= :collection_id collection-id] (when skip-archived? [:not :archived])]}))

(mu/defn card-ids-in-collection
  "The IDs of the Cards in the ::collections.schema/collection with `collection-id`, excluding archived ones when `skip-archived?` and
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
  (t2/select-pks-set :model/Table {:where [:and
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
  (t2/select-pks-set :model/Table :collection_id [:in collection-ids] :is_published true))

(mu/defn unpublish-tables-in-collections!
  "Unpublish the Tables in the Collections with `collection-ids` and detach them from their ::collections.schema/collection, returning
  the number updated."
  [collection-ids :- [:or [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]
  (t2/update! :model/Table {:collection_id [:in collection-ids]} {:collection_id nil, :is_published false}))

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

(mu/defn group-ids-with-permission-object
  "The set of group IDs holding a Permissions row for `object`."
  [object :- :string]
  (t2/select-fn-set :group_id :model/Permissions :object object))

(mu/defn insert-permissions!
  "Insert the Permissions `rows`, returning the number inserted."
  [rows :- [:sequential PermissionsRow]]
  (t2/insert! :model/Permissions rows))

(mu/defn delete-permissions-for-collection!
  "Delete the Permissions rows attached to the ::collections.schema/collection with `collection-id`, returning the number deleted."
  [collection-id :- ::lib.schema.id/collection]
  (t2/delete! :model/Permissions :collection_id collection-id))

(mu/defn delete-permissions-with-objects!
  "Delete the Permissions rows for `objects`, returning the number deleted."
  [objects :- [:sequential :string]]
  (t2/query-one {:delete-from :permissions
                 :where       [:in :object objects]}))

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
