(ns metabase.tenants.core
  "Shim namespace for `metabase-enterprise.tenants.core`"
  (:require
   [metabase.collections.models.collection :as collection]
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

(defenterprise validate-new-tenant-collection!
  "OSS version. Throws API exceptions if the passed collection is an invalid tenant collection, which in OSS
  means 'any tenant collection.'"
  metabase-enterprise.tenants.core
  [parent-coll {ttype :type :as _new-coll}]
  (when (or (some-> parent-coll collection/is-tenant-collection?)
            (collection/is-tenant-collection-type? ttype))
    (throw (ex-info "Cannot create tenant collection on OSS." {:status-code 400}))))
