(ns metabase-enterprise.tenants.auth-provider
  (:require
   [metabase-enterprise.tenants.api :as api.tenants]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(defn- validate-user-and-tenant-slug!
  [{:keys [tenant_id] :as user} existing-tenant user-will-have-tenant?]
  (let [user-exists? (boolean user)
        user-has-tenant? (boolean tenant_id)]
    (when (or (and user-exists?
                   (not= user-will-have-tenant? user-has-tenant?))
              (and user-exists?
                   (not= tenant_id (u/the-id existing-tenant)))
              (and existing-tenant
                   (not (:is_active existing-tenant))))
      (throw (ex-info "Tenant info mismatch" {:user/tenant-id tenant_id
                                              :user/tenant-slug (t2/select-one-fn :slug :model/Tenant :id tenant_id)
                                              :tenant-slug/tenant-id (:id existing-tenant)
                                              :tenant-slug/slug (:slug existing-tenant)
                                              :tenant-slug/is-active (:is_active existing-tenant)
                                              :status-code 403})))))

(methodical/defmethod auth-identity/login! ::create-tenant-if-not-exists
  [provider {:keys [user tenant-slug]
             :as request}]
  (if-not (setting/get :use-tenants)
    (next-method provider request)
    (let [existing-tenant (t2/select-one :model/Tenant :slug tenant-slug)
          _ (validate-user-and-tenant-slug! user existing-tenant (boolean tenant-slug))
          tenant-id (u/the-id (or existing-tenant
                                  (request/as-admin
                                   (api.tenants/create-tenant! {:slug tenant-slug :name tenant-slug}))))]
      (next-method provider (assoc-in request [:user-data :tenant_id] tenant-id)))))

(methodical/prefer-method! #'auth-identity/login! :metabase.auth-identity.provider/provider ::create-tenant-if-not-exists)
(methodical/prefer-method! #'auth-identity/login! ::create-tenant-if-not-exists :metabase.auth-identity.provider/create-user-if-not-exists)
