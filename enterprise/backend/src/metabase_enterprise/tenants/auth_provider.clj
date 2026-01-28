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
    (cond
      (and user-exists?
           user-will-have-tenant?
           (not user-has-tenant?))
      (throw (ex-info "Cannot add tenant claim to internal user"
                      {:user/tenant-id tenant_id
                       :tenant-slug/tenant-id (:id existing-tenant)
                       :tenant-slug/slug (:slug existing-tenant)
                       :status-code 403}))

      (and user-exists?
           (not user-will-have-tenant?)
           user-has-tenant?)
      (throw (ex-info "Tenant claim required for external user"
                      {:user/tenant-id tenant_id
                       :user/tenant-slug (t2/select-one-fn :slug :model/Tenant :id tenant_id)
                       :status-code 403}))

      (and user-exists?
           (not= tenant_id (u/id existing-tenant)))
      (throw (ex-info "Tenant ID mismatch with existing user"
                      {:user/tenant-id tenant_id
                       :user/tenant-slug (t2/select-one-fn :slug :model/Tenant :id tenant_id)
                       :tenant-slug/tenant-id (:id existing-tenant)
                       :tenant-slug/slug (:slug existing-tenant)
                       :status-code 403})))))

(defn- validate-with-tenants-disabled! [{:keys [user tenant-slug]}]
  (when (or (:tenant_id user) (not-empty tenant-slug))
    (throw (ex-info "Tenants and tenant users are disabled." {:status-code 403}))))

(defn- reactivate-tenant!
  "Reactivate a disabled tenant and any users that were deactivated along with it."
  [{tenant-id :id}]
  (api.tenants/update-tenant! tenant-id {:is_active true}))

(defn- maybe-reactivate-tenant!
  "If the tenant is disabled and user provisioning is enabled,
   reactivate the tenant. Otherwise throw an error if the tenant is disabled."
  [existing-tenant user-provisioning-enabled?]
  (when (and existing-tenant (not (:is_active existing-tenant)))
    (if user-provisioning-enabled?
      (reactivate-tenant! existing-tenant)
      (throw (ex-info "Tenant is not active"
                      {:tenant-slug/tenant-id (:id existing-tenant)
                       :tenant-slug/slug (:slug existing-tenant)
                       :tenant-slug/is-active (:is_active existing-tenant)
                       :status-code 403})))))

(defn- create-tenant-if-not-exists!
  [{:as request :keys [user tenant-slug user-provisioning-enabled?]} existing-tenant]
  (if-not (setting/get :use-tenants)
    (do (validate-with-tenants-disabled! request)
        request)
    (do (validate-user-and-tenant-slug! user existing-tenant (boolean tenant-slug))
        (maybe-reactivate-tenant! existing-tenant user-provisioning-enabled?)
        (cond-> request
          (boolean tenant-slug)
          (assoc-in [:user-data :tenant_id]
                    (u/the-id (or existing-tenant
                                  (request/as-admin
                                   (api.tenants/create-tenant! {:slug tenant-slug :name tenant-slug})))))))))

(methodical/defmethod auth-identity/login! ::create-tenant-if-not-exists
  [provider {:keys [tenant-slug]
             :as request}]
  (let [existing-tenant (when tenant-slug (t2/select-one :model/Tenant :slug tenant-slug))]
    (next-method provider (create-tenant-if-not-exists! request existing-tenant))))

(methodical/prefer-method! #'auth-identity/login! :metabase.auth-identity.provider/provider ::create-tenant-if-not-exists)
(methodical/prefer-method! #'auth-identity/login! ::create-tenant-if-not-exists :metabase.auth-identity.provider/create-user-if-not-exists)
