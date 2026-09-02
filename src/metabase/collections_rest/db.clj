(ns metabase.collections-rest.db
  "Application database queries for the collections REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn other-users-personal-collection-ids
  "The ids of the personal Collections owned by Users other than `user-id`."
  [user-id]
  (t2/select-fn-set :id :model/Collection
                    {:where [:and [:!= :personal_owner_id nil] [:!= :personal_owner_id user-id]]}))

(defn collections
  "The Collections selected by the Honey SQL `query`."
  [query]
  (t2/select :model/Collection query))

(defn collection
  "The Collection with `id`, or nil."
  [id]
  (t2/select-one :model/Collection :id id))

(defn collection-location-columns
  "The location, id, and type of the Collection with `id`, or nil."
  [id]
  (t2/select-one [:model/Collection :location :id :type] :id id))

(defn directly-archived-descendant-collections
  "The directly archived Collections whose location starts with `location-prefix`."
  [location-prefix]
  (t2/select :model/Collection :location [:like (str location-prefix "%")] :archived_directly true))

(defn update-collection!
  "Apply `changes` to the Collection with `id`."
  [id changes]
  (t2/update! :model/Collection id changes))

(defn delete-collection!
  "Delete the Collection with `id`."
  [id]
  (t2/delete! :model/Collection :id id))

(defn hydrate
  "Hydrate the `hydration` keys onto `instances`."
  [instances hydration]
  (apply t2/hydrate instances hydration))

(defn hydrate-collection-flags
  "Hydrate the write, personal, delete, remote-sync, and parent flags onto `collections`."
  [collections]
  (t2/hydrate collections :can_write :is_personal :can_delete :is_remote_synced :parent_id))

(defn hydrate-can-write
  "Hydrate `:can_write` onto `collections`."
  [collections]
  (t2/hydrate collections :can_write))

(defn hydrate-child-flags
  "Hydrate the write, restore, delete, remote-sync, and namespace flags onto collection `children`."
  [children]
  (t2/hydrate children :can_write :can_restore :can_delete :is_remote_synced :collection_namespace))

(defn hydrate-exploration-flags
  "Hydrate the write, restore, and delete flags onto `explorations`."
  [explorations]
  (t2/hydrate explorations :can_write :can_restore :can_delete))

(defn hydrate-effective-parent-and-remote-synced
  "Hydrate `:effective_parent` and `:is_remote_synced` onto `collections`."
  [collections]
  (t2/hydrate collections :effective_parent :is_remote_synced))

(defn hydrate-collection-child-flags
  "Hydrate the write, location, restore, delete, and shared-tenant flags onto child `collections`."
  [collections]
  (t2/hydrate collections :can_write :effective_location :can_restore :can_delete :is_shared_tenant_collection))

(defn hydrate-measures
  "Hydrate `:measures` onto `tables`."
  [tables]
  (t2/hydrate tables :measures))

(defn hydrate-collection-detail
  "Hydrate the parent, locations, ancestors, and permission flags onto `collection`."
  [collection]
  (t2/hydrate collection
              :parent_id
              :effective_location
              [:effective_ancestors :can_write]
              :can_write
              :is_personal
              :can_restore
              :can_delete))

(defn hydrate-in-dashboards
  "Hydrate `:in_dashboards` onto `cards`."
  [cards]
  (t2/hydrate cards :in_dashboards))

(defn hydrate-parent-id
  "Hydrate `:parent_id` onto `collection`."
  [collection]
  (t2/hydrate collection :parent_id))

(defn unarchived-card-collection-types-reducible
  "A reducible of the distinct Collection id and type of the unarchived Cards."
  []
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:= :archived false]}))

(defn unarchived-card-collection-types-in-reducible
  "A reducible of the distinct Collection id and type of the unarchived Cards in the Collections with
  `collection-ids` also matching the Honey SQL `dashboard-clause` (nil for any)."
  [collection-ids dashboard-clause]
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:and
                                         dashboard-clause
                                         [:= :archived false]
                                         [:in :collection_id collection-ids]]}))

(defn published-table-collection-ids
  "The distinct `:collection_id`s of the published, unarchived Tables."
  []
  (t2/query {:select-distinct [:collection_id]
             :from :metabase_table
             :where [:and
                     [:= :is_published true]
                     [:= :archived_at nil]]}))

(defn published-table-collection-ids-in
  "The distinct `:collection_id`s of the published, unarchived Tables in the Collections with `collection-ids`."
  [collection-ids]
  (t2/query {:select-distinct [:collection_id]
             :from :metabase_table
             :where [:and
                     [:= :is_published true]
                     [:= :archived_at nil]
                     [:in :collection_id collection-ids]]}))

(defn transform-collection-ids-in
  "The distinct `:collection_id`s of the Transforms with one of `source-types` in the Collections with
  `collection-ids`."
  [collection-ids source-types]
  (t2/query {:select-distinct [:collection_id]
             :from :transform
             :where [:and
                     [:in :collection_id collection-ids]
                     [:in :source_type source-types]]}))

(defn unarchived-dashboard-collection-ids-in
  "The distinct `:collection_id`s of the unarchived Dashboards in the Collections with `collection-ids`."
  [collection-ids]
  (t2/query {:select-distinct [:collection_id]
             :from :report_dashboard
             :where [:and
                     [:= :archived false]
                     [:in :collection_id collection-ids]]}))

(defn top-level-cards-in-collection
  "The Cards in the Collection with `collection-id` that belong to no Dashboard, newest first."
  [collection-id]
  (t2/select :model/Card {:where [:and
                                  [:= :collection_id collection-id]
                                  [:= :dashboard_id nil]]
                          :order-by [[:id :desc]]}))

(defn cards-in-collection
  "The Cards in the Collection with `collection-id`."
  [collection-id]
  (t2/select :model/Card :collection_id collection-id))
