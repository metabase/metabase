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
