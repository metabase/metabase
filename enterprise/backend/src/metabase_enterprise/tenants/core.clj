(ns metabase-enterprise.tenants.core
  (:require
   [metabase-enterprise.tenants.api :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.tenants.core :as tenants]
   [toucan2.core :as t2]))

(defenterprise login-attributes
  "EE version of `login-attributes` - a map of tenant attributes that should be merged into the user's login
  attributes. Currently overrides any existing user attributes."
  :feature :tenants
  [{:keys [tenant_id] :as _user}]
  (or (when (and (setting/get :use-tenants) tenant_id)
        (when-let [{:keys [slug attributes]} (t2/select-one :model/Tenant tenant_id)]
          (merge attributes {"@tenant.slug" slug})))
      {}))

(defenterprise login-attribute-keys
  "The set of tenant attribute keys that will be merged into tenant users' attributes"
  :feature :tenants
  []
  (if (setting/get :use-tenants)
    (into #{"@tenant.slug"}
          (comp
           (mapcat keys)
           (distinct))
          (t2/select-fn-reducible :attributes [:model/Tenant :attributes]
                                  {:where [:and
                                           [:not= :attributes nil]
                                           [:not= :attributes "{}"]]}))
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

(defenterprise attribute-structure
  "EE version of `attribute-structure` serializes the combination of tenant and user attributes for the
   given user with metadata about their provenance."
  :feature :tenants
  [user]
  (let [tenant (when-let [tenant-id (:tenant_id user)]
                 (t2/select-one :model/Tenant :id tenant-id))
        combined-attributes (tenants/combine (:login_attributes user)
                                             (:attributes tenant)
                                             (when tenant
                                               {"@tenant.slug" (:slug tenant)}))]
    (assoc user
           :structured_attributes combined-attributes
           :login_attributes (update-vals combined-attributes :value))))
