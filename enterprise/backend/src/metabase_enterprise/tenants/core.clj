(ns metabase-enterprise.tenants.core
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise login-attributes
  "EE version of `login-attributes` - a map of tenant attributes that should be merged into the user's login
  attributes. Currently overrides any existing user attributes."
  :feature :tenants
  [{:keys [tenant_id] :as _user}]
  (when (and (perms/use-tenants) tenant_id)
    (let [{slug :slug} (t2/select-one :model/Tenant tenant_id)]
      {"@tenant.slug" slug})))

(defenterprise login-attribute-keys
  "The set of tenant attribute keys that will be merged into tenant users' attributes"
  :feature :tenants
  []
  (if (perms/use-tenants)
    #{"@tenant.slug"}
    #{}))

(defenterprise tenant-is-active?
  "Whether the tenant with this ID is active or not."
  :feature :tenants
  [tenant-id]
  (or (nil? tenant-id)
      (t2/exists? :model/Tenant :id tenant-id :is_active true)))

(defenterprise validate-new-tenant-collection!
  "Throws API exceptions if the passed collection is an invalid tenant collection."
  :feature :tenants
  [parent-coll {ttype :type :as _new-coll}]
  (when (or (some-> parent-coll collection/is-tenant-collection?)
            (collection/is-tenant-collection-type? ttype))
    ;; make sure the type is valid (same as parent if the parent exists)
    (api/check-400 (or (= ttype (:type parent-coll))
                       (nil? parent-coll)))
    ;; make sure tenants is enabled
    (api/check-400 (perms/use-tenants))

    ;; check perms - user has the application permission to create shared tenant collections
    (api/check-403 (perms/check-has-application-permission :create-tenant-collections))))
