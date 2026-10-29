(ns metabase-enterprise.tenants.core
  (:require
   [metabase-enterprise.tenants.api :as tenants.api]
   [metabase-enterprise.tenants.auth-provider]
   [metabase-enterprise.tenants.db :as tenants.db]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise login-attributes
  "EE version of `login-attributes` - a map of tenant attributes that should be merged into the user's login
  attributes."
  :feature :tenants
  [{:keys [tenant_id] :as _user}]
  (or (when (and (perms/use-tenants) tenant_id)
        (when-let [{:keys [slug attributes]} (tenants.db/tenant tenant_id)]
          (merge attributes {"@tenant.slug" slug})))
      {}))

(defenterprise login-attribute-keys
  "The set of tenant attribute keys that attempt to be merged into tenant users' attributes"
  :feature :tenants
  []
  (if (perms/use-tenants)
    (into #{"@tenant.slug"}
          (comp
           (mapcat keys)
           (distinct))
          (tenants.db/tenant-attributes-reducible))
    #{}))

(defenterprise tenant-is-active?
  "Whether the tenant with this ID is active or not."
  :feature :tenants
  [tenant-id]
  (or (nil? tenant-id)
      (tenants.db/active-tenant-exists? tenant-id)))

(defenterprise create-tenant!
  "Creates a tenant"
  :feature :tenants
  [tenant]
  (tenants.api/create-tenant! tenant))

(defenterprise user->tenant
  "EE version of `user->tenant`"
  :feature :tenants
  [user]
  (when-let [tenant-id (:tenant_id user)]
    (tenants.db/tenant tenant-id)))

(defenterprise validate-new-tenant-collection!
  "Throws API exceptions if the passed collection is an invalid tenant collection."
  :feature :tenants
  [collection]
  (when (collection/shared-tenant-collection? collection)
    ;; make sure tenants is enabled
    (api/check-400 (perms/use-tenants)))
  collection)
