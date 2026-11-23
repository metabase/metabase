(ns metabase-enterprise.tenants.db
  "Application database queries for the tenants module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase-enterprise.tenants.schema :as tenants.schema]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
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
  "Whether a Tenant with one of `tenant-names` or one of `slugs` exists."
  [tenant-names :- [:sequential {:min 1} :string]
   slugs        :- [:sequential {:min 1} :string]]
  (t2/exists? :model/Tenant {:where [:or
                                     [:in :slug slugs]
                                     [:in :name tenant-names]]}))

(mu/defn tenant-named-outside?
  "Whether a Tenant other than those with `excluded-ids` has one of `tenant-names`."
  [tenant-names :- [:sequential {:min 1} :string]
   excluded-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/exists? :model/Tenant {:where [:and
                                     [:in :name [:auto/param (vec (distinct tenant-names))]]
                                     [:not-in :id [:auto/param (vec (distinct excluded-ids))]]]}))

(mr/def ::tenant.insert
  [:merge
   ::tenants.schema/tenant.create
   [:map {:closed true}
    [:tenant_collection_id ::lib.schema.id/collection]]])

(mu/defn insert-tenants! :- [:sequential ::tenants.schema/tenant]
  "Insert the Tenant `rows` in one statement and return the new instances in their order."
  [rows :- [:sequential ::tenant.insert]]
  (app-db/insert-returning-instances! :model/Tenant rows))

(mu/defn tenants-by-ids
  "The Tenants with `tenant-ids`."
  [tenant-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/select :model/Tenant :id [:in [:auto/param (vec tenant-ids)]]))

(mu/defn update-tenants!
  "Apply each of `rows`, the `:id` of a Tenant and the columns to set, with a statement of its own."
  [rows :- [:sequential ::tenants.schema/tenant.update]]
  (doseq [{:keys [id] :as row} rows]
    (t2/update! :model/Tenant :id [:auto/param id] (dissoc row :id))))

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

(mu/defn active-tenants
  "Every active Tenant."
  []
  (t2/select :model/Tenant :is_active true))

(mu/defn deactivate-tenants!
  "Deactivate the Tenants with `tenant-ids`, returning the number updated."
  [tenant-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/update! :model/Tenant :id [:in tenant-ids] {:is_active false}))

(mu/defn user-tenant-id
  "The Tenant ID of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :tenant_id :model/User :id user-id))

(mu/defn descendant-collection-ids
  "The IDs of the Collections under the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-pks-set :model/Collection :location [:like (str "/" collection-id "/%")]))
