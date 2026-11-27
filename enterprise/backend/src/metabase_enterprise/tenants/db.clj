(ns metabase-enterprise.tenants.db
  "Application database queries for the tenants module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase-enterprise.tenants.schema :as tenants.schema]
   [metabase.app-db.core :as mdb]
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
  (when-not (string? slug)
    (throw (ex-info "slug must be a string" {:slug slug})))
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
  (mdb/select-batched-map #(t2/select-fn->fn :tenant_collection_id (juxt :name :id) :model/Tenant
                                             :tenant_collection_id [:in %])
                          collection-ids))

(mu/defn active-tenant-exists?
  "Whether the Tenant with `tenant-id` exists and is active."
  [tenant-id :- ms/PositiveInt]
  (t2/exists? :model/Tenant :id tenant-id :is_active true))

(mu/defn tenant-name-or-slug-exists?
  "Whether a Tenant with one of `tenant-names` or one of `slugs` exists."
  [tenant-names :- [:sequential {:min 1} :string]
   slugs        :- [:sequential {:min 1} :string]]
  (let [slug-partitions (mdb/select-partitions slugs)
        name-partitions (mdb/select-partitions tenant-names)]
    (boolean (some (fn [i]
                     (t2/exists? :model/Tenant {:where [:or
                                                        (some->> (nth slug-partitions i nil) (vector :in :slug))
                                                        (some->> (nth name-partitions i nil) (vector :in :name))]}))
                   (range (max (count slug-partitions) (count name-partitions)))))))

(mu/defn tenant-named-outside?
  "Whether a Tenant other than those with `excluded-ids` has one of `tenant-names`."
  [tenant-names :- [:sequential {:min 1} :string]
   excluded-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (let [excluded (set excluded-ids)]
    (boolean (some (comp not excluded)
                   (mdb/select-batched #(t2/select-pks-vec :model/Tenant :name [:in %])
                                       (distinct tenant-names))))))

(mu/defn active-member-counts
  "Rows of `:tenant_id` and `:count` of active personal Users for `tenant-ids`."
  [tenant-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/query {:select   [[:tenant_id] [[:count :*] :count]]
                                  :from     [(t2/table-name :model/User)]
                                  :where    [:and
                                             [:in :tenant_id %]
                                             [:= :type "personal"]
                                             :is_active]
                                  :group-by [:tenant_id]})
                      tenant-ids))

(mu/defn active-tenants-by-ids :- [:map-of ms/PositiveInt ::tenants.schema/tenant]
  "The map from id to Tenant of every active Tenant."
  []
  (t2/select-pk->fn identity :model/Tenant :is_active true))

(mu/defn deactivate-tenants!
  "Deactivate the Tenants with `tenant-ids`, returning the number updated."
  [tenant-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/Tenant :id [:in %] {:is_active false}) tenant-ids))

(mu/defn user-tenant-id
  "The Tenant ID of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :tenant_id :model/User :id user-id))

(mu/defn descendant-collection-ids
  "The IDs of the Collections under the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-pks-set :model/Collection :location [:like (str "/" collection-id "/%")]))
