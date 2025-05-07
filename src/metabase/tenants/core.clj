(ns metabase.tenants.core
  "Shim namespace for `metabase-enterprise.tenants.core`"
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise login-attributes
  "OSS version of `login-attributes`"
  metabase-enterprise.tenants.core
  [_user]
  {})

(defenterprise login-attribute-keys
  "OSS version of `login-attribute-keys`"
  metabase-enterprise.tenants.core
  []
  #{})

(defenterprise tenant-is-active?
  "OSS version of `tenant-is-active?`. Returns `true` only if you have no tenant, because no tenants are active on
  OSS."
  metabase-enterprise.tenants.core
  [tenant-id]
  (nil? tenant-id))

(defenterprise create-tenant!
  "Throws an exception in OSS because we can't create tenants there."
  metabase-enterprise.tenants.core
  [_tenant]
  (throw (ex-info "Cannot create tenant in OSS." {})))
