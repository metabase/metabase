(ns metabase-enterprise.tenants.core
  (:require
   [metabase-enterprise.tenants.api :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [toucan2.core :as t2]))

(defenterprise login-attributes
  "EE version of `login-attributes` - a map of tenant attributes that should be merged into the user's login
  attributes. Currently overrides any existing user attributes."
  :feature :tenants
  [{:keys [tenant_id] :as _user}]
  (when (and (setting/get :use-tenants) tenant_id)
    (let [{slug :slug} (t2/select-one :model/Tenant tenant_id)]
      {"@tenant.slug" slug})))

(defenterprise login-attribute-keys
  "The set of tenant attribute keys that will be merged into tenant users' attributes"
  :feature :tenants
  []
  (if (setting/get :use-tenants)
    #{"@tenant.slug"}
    #{}))

(defenterprise tenant-is-active?
  "Whether the tenant with this ID is active or not."
  :feature :tenants
  [tenant-id]
  (or (nil? tenant-id)
      (t2/exists? :model/Tenant :id tenant-id :is_active true)))

(defenterprise create-tenant!
  "Creates a tenant"
  :feature :tenants
  [tenant]
  (api/create-tenant! tenant))
