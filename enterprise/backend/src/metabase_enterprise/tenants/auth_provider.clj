(ns metabase-enterprise.tenants.auth-provider
  (:require
   [metabase-enterprise.tenants.api :as api.tenants]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod auth-identity/login! ::create-tenant-if-not-exists
  [provider request]
  (let [tenant-slug (:tenant-slug request)
        tenant-id (when (setting/get :use-tenants)
                    (or (t2/select-one-pk :model/Tenant :slug tenant-slug)
                        (u/the-id (request/as-admin (api.tenants/create-tenant! {:slug tenant-slug :name tenant-slug})))))]
    (next-method provider (assoc-in request [:user-data :tenant_id] tenant-id))))

(methodical/prefer-method! #'auth-identity/login! :metabase.auth-identity.provider/provider ::create-tenant-if-not-exists)
(methodical/prefer-method! #'auth-identity/login! ::create-tenant-if-not-exists :metabase.auth-identity.provider/create-user-if-not-exists)
