(ns metabase.collections.db
  "Application database queries for the collections module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [metabase.models.serialization :as serdes]
   [toucan2.core :as t2]))

;;; ---------------------------------------------- Single Collections ----------------------------------------------

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn collection-id-and-namespace
  "The ID and namespace of the Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one [:model/Collection :id :namespace] :id collection-id))

(defn collection-of-type
  "The Collection of `type`, or nil."
  [type]
  (t2/select-one :model/Collection :type type))

(defn root-remote-synced-collection
  "The top-level remote-synced Collection, or nil."
  []
  (t2/select-one :model/Collection :is_remote_synced true :location "/"))

(defn personal-collection-of-user
  "The personal Collection of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/Collection :personal_owner_id user-id))

(defn collection-exists?
  "Whether a Collection with `collection-id` exists."
  [collection-id]
  (t2/exists? :model/Collection :id collection-id))

(defn unarchived-collection-exists?
  "Whether an unarchived Collection with `collection-id` exists."
  [collection-id]
  (t2/exists? :model/Collection :id collection-id :archived false))

(defn remote-synced-collection-exists?
  "Whether a remote-synced Collection with `collection-id` exists."
  [collection-id]
  (t2/exists? :model/Collection :id collection-id :is_remote_synced true))

(defn personal-collection?
  "Whether the Collection with `collection-id` is a personal Collection."
  [collection-id]
  (t2/exists? :model/Collection :id collection-id :personal_owner_id [:not= nil]))

(defn collection-remote-synced?
  "Whether the Collection with `collection-id` is remote-synced."
  [collection-id]
  (t2/select-one-fn :is_remote_synced :model/Collection :id collection-id))

(defn collection-namespace
  "The namespace of the Collection with `collection-id`."
  [collection-id]
  (t2/select-one-fn :namespace :model/Collection :id collection-id))

(defn collection-location
  "The location of the Collection with `collection-id`."
  [collection-id]
  (t2/select-one-fn :location :model/Collection :id collection-id))

(defn root-collection-type-by-id
  "The type of the top-level Collection with `collection-id`, or nil if it is not top-level."
  [collection-id]
  (t2/select-one-fn :type :model/Collection :id collection-id :location "/"))

;;; ---------------------------------------------- Collection sets ----------------------------------------------

(defn collections-by-id
  "A map of ID to Collection for `collection-ids`."
  [collection-ids]
  (t2/select-pk->fn identity :model/Collection :id [:in collection-ids]))

(defn collection-columns-by-id
  "A map of ID to the `columns` of the Collections with `collection-ids`."
  [columns collection-ids]
  (t2/select-pk->fn identity (into [:model/Collection] columns) :id [:in collection-ids]))

(defn collection-archived-flags
  "A map of ID to `:archived` for `collection-ids`."
  [collection-ids]
  (t2/select-pk->fn :archived :model/Collection :id [:in collection-ids]))

(defn collections-in-namespace
  "The Collections in the namespace named `namespace-name`."
  [namespace-name]
  (t2/select :model/Collection :namespace namespace-name))

(defn archived-collections-in-operations
  "The archived Collections belonging to the archive operations with `archive-operation-ids`."
  [archive-operation-ids]
  (t2/select :model/Collection :archive_operation_id [:in archive-operation-ids] :archived true))

(defn ancestor-summaries
  "The name, ID, and owner of the Collections with `collection-ids`, ordered by location."
  [collection-ids]
  (t2/select [:model/Collection :name :id :personal_owner_id] :id [:in collection-ids] {:order-by [:location]}))

(defn descendant-summaries-where
  "The name, ID, location, and description of the Collections matching the Honey SQL `where`."
  [where]
  (t2/select [:model/Collection :name :id :location :description] {:where where}))

(defn descendant-summaries-with-type
  "The name, ID, location, description, and type of the Collections directly under any of `location-prefixes`
  (compared with SQL `LIKE`), excluding personal Collections that don't belong to `current-user-id`."
  [location-prefixes current-user-id]
  (t2/select [:model/Collection :name :id :location :description :type]
             {:where [:and
                      (into [:or] (map (fn [prefix] [:like :location prefix])) location-prefixes)
                      [:or [:= :personal_owner_id nil] [:= :personal_owner_id current-user-id]]]}))

(defn effective-children-where
  "The ID, name, description, and type of the Collections matching the Honey SQL `where`."
  [where]
  (t2/select [:model/Collection :id :name :description :type] {:where where}))

(defn collections-for-serdes-reducible
  "Reducible Collections matching the Honey SQL `where` in stable storage order."
  [where]
  (t2/reducible-select :model/Collection {:where where, :order-by serdes/stable-storage-order}))

(defn collection-count-by-ids
  "The number of Collections among `collection-ids`."
  [collection-ids]
  (t2/count :model/Collection :id [:in collection-ids]))

(defn collection-count-of-types
  "The number of Collections with `collection-id` whose type is one of `types`."
  [collection-id types]
  (t2/count :model/Collection :id collection-id :type [:in types]))

(defn remote-synced-collection-count
  "The number of remote-synced Collections."
  []
  (t2/count :model/Collection :is_remote_synced true))

(defn collection-ids-with-location-like
  "The IDs of the Collections whose location matches the SQL `pattern`."
  [pattern]
  (t2/select-pks-set :model/Collection :location [:like pattern]))

(defn unarchived-collection-ids-with-location-like
  "The IDs of the unarchived Collections whose location matches the SQL `pattern`."
  [pattern]
  (t2/select-pks-set :model/Collection :location [:like pattern] :archived false))

(defn not-yet-archived-collection-ids-with-location-like
  "The IDs of the Collections whose location matches the SQL `pattern` and that are not marked archived."
  [pattern]
  (t2/select-pks-set :model/Collection :location [:like pattern] :archived [:not= true]))

(defn archived-collection-ids-in-operation-with-location-like
  "The IDs of the archived Collections of the archive operation with `archive-operation-id` whose location matches
  the SQL `pattern`."
  [pattern archive-operation-id]
  (t2/select-pks-set :model/Collection
                     :location [:like pattern]
                     :archive_operation_id [:= archive-operation-id]
                     :archived [:= true]))

(defn collection-ids-of-type
  "The IDs of the Collections among `collection-ids` of `type`."
  [collection-ids type]
  (t2/select-pks-set :model/Collection :id [:in collection-ids] :type type))

(defn child-collection-ids
  "The IDs of the non-trash Collections directly at `location`, excluding archived ones when `skip-archived?`."
  [location trash-type skip-archived?]
  (t2/select-pks-set :model/Collection
                     {:where [:and
                              [:= :location location]
                              (when skip-archived? [:not :archived])
                              [:or
                               [:not= :type trash-type]
                               [:= :type nil]]]}))

(defn remote-synced-root-collection-ids
  "The IDs of the top-level remote-synced Collections."
  []
  (t2/select-pks-set :model/Collection {:where [:and
                                                [:= :is_remote_synced true]
                                                [:= :location "/"]]}))

(defn personal-collection-ids
  "The IDs of every personal Collection."
  []
  (t2/select-pks-set :model/Collection :personal_owner_id [:not= nil]))

(defn personal-collection-ids-by-owner
  "A map of owner User ID to personal Collection ID for `user-ids`."
  [user-ids]
  (t2/select-fn->pk :personal_owner_id :model/Collection :personal_owner_id [:in user-ids]))

;;; ---------------------------------------------- Collection writes ----------------------------------------------

(defn insert-collection!
  "Insert `collection` and return the new instance."
  [collection]
  (t2/insert-returning-instance! :model/Collection collection))

(defn update-collection!
  "Apply `changes` to the Collection with `collection-id`."
  [collection-id changes]
  (t2/update! :model/Collection collection-id changes))

(defn clear-remote-synced-flags!
  "Mark every remote-synced Collection as not remote-synced."
  []
  (t2/update! :model/Collection :is_remote_synced true {:is_remote_synced false}))

(defn archive-descendant-collections!
  "Archive, as part of the archive operation with `archive-operation-id`, the unarchived Collections whose location
  matches the SQL `pattern`."
  [pattern archive-operation-id]
  (t2/query-one {:update :collection
                 :set    {:archive_operation_id archive-operation-id
                          :archived_directly    false
                          :archived             true}
                 :where  [:and
                          [:like :location pattern]
                          [:not :archived]]}))

(defn unarchive-descendant-collections!
  "Unarchive the Collections of the archive operation with `archive-operation-id` that were not archived directly,
  moving them from `orig-children-location` to `new-children-location` and setting `remote-synced?`."
  [orig-children-location new-children-location remote-synced? archive-operation-id]
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

(defn move-descendant-collections!
  "Move the Collections under `orig-children-location` to `new-children-location` and set `remote-synced?`."
  [orig-children-location new-children-location remote-synced?]
  (t2/query-one {:update :collection
                 :set    {:location         [:replace :location orig-children-location new-children-location]
                          :is_remote_synced remote-synced?}
                 :where  [:like :location (str orig-children-location "%")]}))

(defn delete-collections-at-location!
  "Delete the Collections directly at `location`."
  [location]
  (t2/delete! :model/Collection :location location))

;;; ---------------------------------------------- Collection contents ----------------------------------------------

(defn instances-with-columns
  "The `columns` of the instances with `ids`."
  [columns ids]
  (t2/select columns :id [:in ids]))

(defn instance-by-id
  "The instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one model :id id))

(defn collection-namespaces-of
  "A map of ID to the namespace of the Collection holding each instance of `model` with `ids`."
  [model ids]
  (t2/select-pk->fn :namespace [model :id [:c.namespace :namespace]]
                    {:where [:in (keyword (str (name (t2/table-name model)) ".id")) ids]
                     :join  [[:collection :c] [:= :collection_id :c.id]]}))

(defn set-pulse-archived-in-collections!
  "Set `archived?` on the Pulses in the Collections with `collection-ids`."
  [collection-ids archived?]
  (t2/update! :model/Pulse {:collection_id [:in collection-ids]} {:archived archived?}))

(defn set-native-query-snippet-archived-in-collections!
  "Set `archived?` on the NativeQuerySnippets in the Collections with `collection-ids`."
  [collection-ids archived?]
  (t2/update! :model/NativeQuerySnippet {:collection_id [:in collection-ids]} {:archived archived?}))

(defn set-timeline-archived-in-collections!
  "Set `archived?` on the Timelines in the Collections with `collection-ids`."
  [collection-ids archived?]
  (t2/update! :model/Timeline {:collection_id [:in collection-ids]} {:archived archived?}))

(defn set-card-archived-in-collections-not-directly!
  "Set `archived?` on the Cards in the Collections with `collection-ids` that were not archived directly."
  [collection-ids archived?]
  (t2/update! :model/Card {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(defn set-dashboard-archived-in-collections-not-directly!
  "Set `archived?` on the Dashboards in the Collections with `collection-ids` that were not archived directly."
  [collection-ids archived?]
  (t2/update! :model/Dashboard {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(defn set-document-archived-in-collections-not-directly!
  "Set `archived?` on the Documents in the Collections with `collection-ids` that were not archived directly."
  [collection-ids archived?]
  (t2/update! :model/Document {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(defn set-exploration-archived-in-collections-not-directly!
  "Set `archived?` on the Explorations in the Collections with `collection-ids` that were not archived directly."
  [collection-ids archived?]
  (t2/update! :model/Exploration {:collection_id [:in collection-ids], :archived_directly false} {:archived archived?}))

(defn delete-cards-in-collections!
  "Delete the Cards in the Collections with `collection-ids`."
  [collection-ids]
  (t2/delete! :model/Card :collection_id [:in collection-ids]))

(defn delete-dashboards-in-collections!
  "Delete the Dashboards in the Collections with `collection-ids`."
  [collection-ids]
  (t2/delete! :model/Dashboard :collection_id [:in collection-ids]))

(defn delete-native-query-snippets-in-collections!
  "Delete the NativeQuerySnippets in the Collections with `collection-ids`."
  [collection-ids]
  (t2/delete! :model/NativeQuerySnippet :collection_id [:in collection-ids]))

(defn delete-pulses-in-collections!
  "Delete the Pulses in the Collections with `collection-ids`."
  [collection-ids]
  (t2/delete! :model/Pulse :collection_id [:in collection-ids]))

(defn delete-timelines-in-collections!
  "Delete the Timelines in the Collections with `collection-ids`."
  [collection-ids]
  (t2/delete! :model/Timeline :collection_id [:in collection-ids]))

(defn dashboard-ids-in-collection
  "The IDs of the Dashboards in the Collection with `collection-id`, excluding archived ones when `skip-archived?`."
  [collection-id skip-archived?]
  (t2/select-pks-set :model/Dashboard
                     {:where [:and [:= :collection_id collection-id] (when skip-archived? [:not :archived])]}))

(defn card-ids-in-collection
  "The IDs of the Cards in the Collection with `collection-id`, excluding archived ones when `skip-archived?` and
  excluding Cards materialized by an exploration Summary."
  [collection-id skip-archived?]
  (t2/select-pks-set :model/Card {:where [:and
                                          [:= :collection_id collection-id]
                                          (when skip-archived? [:not :archived])
                                          [:or
                                           [:= :document_id nil]
                                           [:in :document_id
                                            ^:allow-subquery {:select [:id]
                                                              :from   [:document]
                                                              :where  [:= :exploration_id nil]}]]]}))

(defn document-ids-in-collection
  "The IDs of the non-exploration Documents in the Collection with `collection-id`, excluding archived ones when
  `skip-archived?`."
  [collection-id skip-archived?]
  (t2/select-pks-set :model/Document {:where [:and
                                              [:= :collection_id collection-id]
                                              [:= :exploration_id nil]
                                              (when skip-archived? [:not :archived])]}))

(defn timeline-ids-in-collection
  "The IDs of the Timelines in the Collection with `collection-id`, excluding archived ones when `skip-archived?`."
  [collection-id skip-archived?]
  (t2/select-pks-set :model/Timeline
                     {:where [:and [:= :collection_id collection-id] (when skip-archived? [:not :archived])]}))

(defn published-table-ids-in-collection
  "The IDs of the published Tables in the Collection with `collection-id`, excluding archived ones when
  `skip-archived?`."
  [collection-id skip-archived?]
  (t2/select-pks-set :model/Table {:where [:and
                                           [:= :collection_id collection-id]
                                           [:= :is_published true]
                                           (when skip-archived? [:= :archived_at nil])]}))

(defn transform-ids-in-collection
  "The IDs of the Transforms in the Collection with `collection-id`."
  [collection-id]
  (t2/select-pks-set :model/Transform {:where [:= :collection_id collection-id]}))

(defn published-table-ids-in-collections
  "The IDs of the published Tables in the Collections with `collection-ids`."
  [collection-ids]
  (t2/select-pks-set :model/Table :collection_id [:in collection-ids] :is_published true))

(defn unpublish-tables-in-collections!
  "Unpublish the Tables in the Collections with `collection-ids` and detach them from their Collection."
  [collection-ids]
  (t2/update! :model/Table {:collection_id [:in collection-ids]} {:collection_id nil, :is_published false}))

(defn dashboard-ids-with-cards
  "The `:dashboard_id` rows of the Dashboards among `dashboard-ids` holding an unarchived dashboard question."
  [dashboard-ids]
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

(defn user-has-root-collection-permission?
  "Whether the User with `user-id` belongs to a group holding a Permissions row for one of the root collection
  `objects`."
  [user-id objects]
  (t2/exists? :model/Permissions {:select [:p.*]
                                  :from   [[:permissions :p]]
                                  :join   [[:permissions_group :pg] [:= :pg.id :p.group_id]
                                           [:permissions_group_membership :pgm] [:= :pgm.group_id :pg.id]]
                                  :where  [:and
                                           [:= :pgm.user_id user-id]
                                           [:in :p.object objects]]}))

(defn group-ids-with-permission-object
  "The set of group IDs holding a Permissions row for `object`."
  [object]
  (t2/select-fn-set :group_id :model/Permissions :object object))

(defn insert-permissions!
  "Insert the Permissions `rows`."
  [rows]
  (t2/insert! :model/Permissions rows))

(defn delete-permissions-for-collection!
  "Delete the Permissions rows attached to the Collection with `collection-id`."
  [collection-id]
  (t2/delete! :model/Permissions :collection_id collection-id))

(defn delete-permissions-with-objects!
  "Delete the Permissions rows for `objects`."
  [objects]
  (t2/query-one {:delete-from :permissions
                 :where       [:in :object objects]}))

;;; ---------------------------------------------------- Users ----------------------------------------------------

(defn user-type
  "The type of the User with `user-id`."
  [user-id]
  (t2/select-one-fn :type :model/User user-id))

(defn user-name-parts-by-id
  "A map of ID to the first name, last name, and email of the Users with `user-ids`."
  [user-ids]
  (t2/select-pk->fn identity [:model/User :first_name :last_name :email :id] :id [:in user-ids]))

(defn non-api-key-user-ids
  "The IDs of the Users among `user-ids` that are not API key users."
  [user-ids]
  (t2/select-pks-set :model/User :id [:in user-ids] :type [:not= :api-key]))

;;; -------------------------------------------------- Hydration --------------------------------------------------
