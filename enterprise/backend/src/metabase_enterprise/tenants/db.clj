(ns metabase-enterprise.tenants.db
  "Application database queries for the tenants module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [toucan2.core :as t2]))

(defn tenant
  "The Tenant with `tenant-id`, or nil."
  [tenant-id]
  (t2/select-one :model/Tenant :id tenant-id))

(defn tenant-by-slug
  "The Tenant with `slug`, or nil."
  [slug]
  (t2/select-one :model/Tenant :slug slug))

(defn tenant-slug
  "The slug of the Tenant with `tenant-id`."
  [tenant-id]
  (t2/select-one-fn :slug :model/Tenant :id tenant-id))

(defn tenant-collection-id
  "The root Collection ID of the Tenant with `tenant-id`."
  [tenant-id]
  (t2/select-one-fn :tenant_collection_id :model/Tenant :id tenant-id))

(defn tenants-page
  "The Tenants in ID order, restricted by `status` (`\"all\"`, `\"active\"`, or `\"deactivated\"`) and paged by the
  optional `limit` and `offset`."
  [status limit offset]
  (t2/select :model/Tenant (cond-> {:order-by [[:id :asc]]
                                    :where    (case status
                                                "all"         [:= [:inline 1] [:inline 1]]
                                                "active"      [:= :is_active true]
                                                "deactivated" [:= :is_active false])}
                             limit (assoc :limit limit :offset offset))))

(defn tenant-attributes-reducible
  "Reducible attribute maps of the Tenants that have attributes."
  []
  (t2/select-fn-reducible :attributes [:model/Tenant :attributes]
                          {:where [:and
                                   [:not= :attributes nil]
                                   [:not= :attributes "{}"]]}))

(defn tenant-names-and-ids-by-collection
  "A map of root Collection ID to `[name id]` for the Tenants owning `collection-ids`."
  [collection-ids]
  (t2/select-fn->fn :tenant_collection_id (juxt :name :id) :model/Tenant :tenant_collection_id [:in collection-ids]))

(defn active-tenant-exists?
  "Whether the Tenant with `tenant-id` exists and is active."
  [tenant-id]
  (t2/exists? :model/Tenant :id tenant-id :is_active true))

(defn tenant-name-or-slug-exists?
  "Whether a Tenant named `tenant-name` or with `slug` exists."
  [tenant-name slug]
  (t2/exists? :model/Tenant {:where [:or
                                     [:= :slug slug]
                                     [:= :name tenant-name]]}))

(defn other-tenant-named?
  "Whether a Tenant other than `tenant-id` is named `tenant-name`."
  [tenant-name tenant-id]
  (t2/exists? :model/Tenant :name tenant-name :id [:not= tenant-id]))

(defn insert-tenant!
  "Insert `tenant` and return the new instance."
  [tenant]
  (t2/insert-returning-instance! :model/Tenant tenant))

(defn update-tenant!
  "Apply `changes` to the Tenant with `tenant-id`."
  [tenant-id changes]
  (t2/update! :model/Tenant {:id tenant-id} changes))

(defn active-member-counts
  "Rows of `:tenant_id` and `:count` of active personal Users for `tenant-ids`."
  [tenant-ids]
  (t2/query {:select   [[:tenant_id] [[:count :*] :count]]
             :from     [(t2/table-name :model/User)]
             :where    [:and
                        [:in :tenant_id tenant-ids]
                        [:= :type "personal"]
                        :is_active]
             :group-by [:tenant_id]}))

(defn hydrate-member-count
  "Hydrate `:member_count` onto `tenants`."
  [tenants]
  (t2/hydrate tenants :member_count))

(defn deactivate-tenant-users!
  "Deactivate the active Users of the Tenant with `tenant-id`, marking them as deactivated with it."
  [tenant-id]
  (t2/update! :model/User {:is_active true :tenant_id tenant-id} {:is_active false :deactivated_with_tenant true}))

(defn reactivate-tenant-users!
  "Reactivate the Users of the Tenant with `tenant-id` that were deactivated with it."
  [tenant-id]
  (t2/update! :model/User {:is_active false :tenant_id tenant-id :deactivated_with_tenant true}
              {:is_active true :deactivated_with_tenant nil}))

(defn user-tenant-id
  "The Tenant ID of the User with `user-id`."
  [user-id]
  (t2/select-one-fn :tenant_id :model/User :id user-id))

(defn collection-with-archived-state
  "The Collection with `collection-id` if its archived flag is `archived?`, or nil."
  [collection-id archived?]
  (t2/select-one :model/Collection :id collection-id :archived archived?))

(defn descendant-collection-ids
  "The IDs of the Collections under the Collection with `collection-id`."
  [collection-id]
  (t2/select-pks-set :model/Collection :location [:like (str "/" collection-id "/%")]))

(defn insert-collection!
  "Insert `collection` and return its ID."
  [collection]
  (t2/insert-returning-pk! :model/Collection collection))

(defn delete-permissions-with-objects!
  "Delete the Permissions rows for `objects`."
  [objects]
  (t2/query-one {:delete-from :permissions
                 :where       [:in :object objects]}))
