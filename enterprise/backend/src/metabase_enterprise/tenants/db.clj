(ns metabase-enterprise.tenants.db
  "Application database queries for the tenants module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.tenants.schema :as tenants.schema]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn tenant
  "The Tenant with `tenant-id`, or nil."
  [tenant-id :- ms/PositiveInt]
  (t2/select-one :model/Tenant :id tenant-id))

(mu/defn tenant-by-slug
  "The Tenant with `slug`, or nil."
  [slug :- :string]
  (t2/select-one :model/Tenant :slug slug))

(mu/defn tenant-slug
  "The slug of the Tenant with `tenant-id`."
  [tenant-id :- ms/PositiveInt]
  (t2/select-one-fn :slug :model/Tenant :id tenant-id))

(mu/defn tenant-collection-id
  "The root Collection ID of the Tenant with `tenant-id`."
  [tenant-id :- ms/PositiveInt]
  (t2/select-one-fn :tenant_collection_id :model/Tenant :id tenant-id))

(mu/defn tenants-page
  "The Tenants in ID order, restricted by `status` (`\"all\"`, `\"active\"`, or `\"deactivated\"`) and paged by the
  optional `limit` and `offset`."
  [status :- [:enum "all" "active" "deactivated"]
   limit  :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/Tenant (cond-> {:order-by [[:id :asc]]
                                    :where    (case status
                                                "all"         [:= [:inline 1] [:inline 1]]
                                                "active"      [:= :is_active true]
                                                "deactivated" [:= :is_active false])}
                             limit (assoc :limit limit :offset offset))))

(mu/defn tenant-attributes-reducible
  "Reducible attribute maps of the Tenants that have attributes."
  []
  (t2/select-fn-reducible :attributes [:model/Tenant :attributes]
                          {:where [:and
                                   [:not= :attributes nil]
                                   [:not= :attributes "{}"]]}))

(mu/defn tenant-names-and-ids-by-collection
  "A map of root Collection ID to `[name id]` for the Tenants owning `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-fn->fn :tenant_collection_id (juxt :name :id) :model/Tenant :tenant_collection_id [:in collection-ids]))

(mu/defn active-tenant-exists?
  "Whether the Tenant with `tenant-id` exists and is active."
  [tenant-id :- ms/PositiveInt]
  (t2/exists? :model/Tenant :id tenant-id :is_active true))

(mu/defn tenant-name-or-slug-exists?
  "Whether a Tenant named `tenant-name` or with `slug` exists."
  [tenant-name :- :string
   slug        :- :string]
  (t2/exists? :model/Tenant {:where [:or
                                     [:= :slug slug]
                                     [:= :name tenant-name]]}))

(mu/defn other-tenant-named?
  "Whether a Tenant other than `tenant-id` is named `tenant-name`."
  [tenant-name :- :string
   tenant-id   :- ms/PositiveInt]
  (t2/exists? :model/Tenant :name tenant-name :id [:not= tenant-id]))

(mu/defn insert-tenant!
  "Insert `tenant` and return the new instance."
  [tenant :- (mut/select-keys ::tenants.schema/tenant.update [:name :slug :attributes])]
  (t2/insert-returning-instance! :model/Tenant tenant))

(mu/defn update-tenant!
  "Apply `changes` to the Tenant with `tenant-id`, returning the number updated."
  [tenant-id :- ms/PositiveInt
   changes   :- (mut/select-keys ::tenants.schema/tenant.update [:name :attributes :is_active])]
  (t2/update! :model/Tenant {:id tenant-id} changes))

(mu/defn active-member-counts
  "Rows of `:tenant_id` and `:count` of active personal Users for `tenant-ids`."
  [tenant-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select   [[:tenant_id] [[:count :*] :count]]
             :from     [(t2/table-name :model/User)]
             :where    [:and
                        [:in :tenant_id tenant-ids]
                        [:= :type "personal"]
                        :is_active]
             :group-by [:tenant_id]}))

(mu/defn deactivate-tenant-users!
  "Deactivate the active Users of the Tenant with `tenant-id`, marking them as deactivated with it, returning the
  number updated."
  [tenant-id :- ms/PositiveInt]
  (t2/update! :model/User {:is_active true :tenant_id tenant-id} {:is_active false :deactivated_with_tenant true}))

(mu/defn reactivate-tenant-users!
  "Reactivate the Users of the Tenant with `tenant-id` that were deactivated with it, returning the number updated."
  [tenant-id :- ms/PositiveInt]
  (t2/update! :model/User {:is_active false :tenant_id tenant-id :deactivated_with_tenant true}
              {:is_active true :deactivated_with_tenant nil}))

(mu/defn user-tenant-id
  "The Tenant ID of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :tenant_id :model/User :id user-id))

(mu/defn collection-with-archived-state
  "The Collection with `collection-id` if its archived flag is `archived?`, or nil."
  [collection-id :- ::lib.schema.id/collection
   archived?     :- :boolean]
  (t2/select-one :model/Collection :id collection-id :archived archived?))

(mu/defn descendant-collection-ids
  "The IDs of the Collections under the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-pks-set :model/Collection :location [:like (str "/" collection-id "/%")]))

(mu/defn insert-collection!
  "Insert `collection` and return its ID."
  [collection :- ::collections.schema/collection.update]
  (t2/insert-returning-pk! :model/Collection collection))

(mu/defn delete-permissions-with-objects!
  "Delete the Permissions rows for `objects`, returning the number deleted."
  [objects :- [:sequential :string]]
  (t2/query-one {:delete-from :permissions
                 :where       [:in :object objects]}))
