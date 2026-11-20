(ns metabase-enterprise.tenants.write
  "The write functions of Tenants, through which every writer updates and deletes them."
  (:require
   [metabase-enterprise.tenants.db :as tenants.db]
   [metabase-enterprise.tenants.schema :as tenants.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.users.core :as users]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `tenant`."
  [tenant changes]
  (into {} (remove (fn [[k v]] (= v (get tenant k)))) changes))

(defn- check-changes
  "Throws unless `changes`, the changed columns of the Tenant with `id`, are an update a Tenant allows."
  [id changes]
  (when (contains? changes :slug)
    (throw (ex-info (tru "You cannot change the slug of a tenant.") {:status-code 400})))
  (when (contains? changes :tenant_collection_id)
    (throw (ex-info (tru "You cannot change the collection of a tenant.") {:status-code 400})))
  (when (and (contains? changes :name) (tenants.db/other-tenant-named? (:name changes) id))
    (throw (ex-info (tru "This name is already taken.") {:status-code 400}))))

(defn- cascade-to-users!
  "Deactivate the active Users of the Tenant with `id` when `active?` is false, marking them as deactivated with it, and
  reactivate those deactivated with it when `active?` is true."
  [id active?]
  (case active?
    false (users/update-users! (tenants.db/active-tenant-user-ids id)
                               {:is_active false :deactivated_with_tenant true}
                               {})
    true  (users/update-users! (tenants.db/deactivated-with-tenant-user-ids id)
                               {:is_active true :deactivated_with_tenant nil}
                               {})
    nil))

(mu/defn update-tenant! :- :int
  "Apply `changes` to `tenant-or-id`, a Tenant the caller already loaded or the id of one, deactivating or reactivating
  its Users with it, and publish its update event, returning the number of Tenants updated; for the REST API and the
  `use-tenants` setting."
  [tenant-or-id :- [:or ms/PositiveInt :map]
   changes      :- ::tenants.schema/tenant.update
   _opts        :- ::tenants.schema/write-opts]
  (let [tenant  (if (map? tenant-or-id) tenant-or-id (tenants.db/tenant tenant-or-id))
        changes (when tenant (changed tenant changes))]
    (if (empty? changes)
      0
      (let [id (:id tenant)]
        (check-changes id changes)
        (events/with-batched-events
          (cascade-to-users! id (:is_active changes))
          (let [changes (cond-> changes
                          (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
            (u/prog1 (tenants.db/update-tenant! id changes)
              (events/updated! :model/Tenant (merge tenant changes) tenant))))))))

(mu/defn delete-tenants! :- :int
  "Delete the Tenants with `ids` and publish their delete events, returning the number deleted."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::tenants.schema/write-opts]
  (let [tenants (when (seq ids) (tenants.db/tenants ids))]
    (if (empty? tenants)
      0
      (events/with-batched-events
        (events/deleting! :model/Tenant tenants #(tenants.db/delete-tenants! (mapv :id tenants)))))))

(defmethod mi/write-fns :model/Tenant
  [_model]
  {:update! update-tenant!
   :delete! delete-tenants!})
