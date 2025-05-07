(ns metabase-enterprise.tenants.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise login-attributes
  "EE version of `login-attributes` - a map of tenant attributes that should be merged into the user's login
  attributes. Currently overrides any existing user attributes."
  :feature :tenants
  [{:keys [tenant_id] :as _user}]
  (when tenant_id
    (let [{slug :slug} (t2/select-one :model/Tenant tenant_id)]
      {"@tenant.slug" slug})))

(defenterprise login-attribute-keys
  "The set of tenant attribute keys that will be merged into tenant users' attributes"
  :feature :tenants
  []
  #{"@tenant.slug"})
