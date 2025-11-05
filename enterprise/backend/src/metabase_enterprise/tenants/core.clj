(ns metabase-enterprise.tenants.core
  (:require
   [metabase-enterprise.tenants.api :as tenants.api]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.tenants.core :as tenants]
   [toucan2.core :as t2]))

(defenterprise login-attributes
  "EE version of `login-attributes` - a map of tenant attributes that should be merged into the user's login
  attributes."
  :feature :tenants
  [{:keys [tenant_id] :as _user}]
  (or (when (and (perms/use-tenants) tenant_id)
        (when-let [{:keys [slug attributes]} (t2/select-one :model/Tenant tenant_id)]
          (merge attributes {"@tenant.slug" slug})))
      {}))

(defenterprise login-attribute-keys
  "The set of tenant attribute keys that attempt to be merged into tenant users' attributes"
  :feature :tenants
  []
  (if (perms/use-tenants)
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
  (tenants.api/create-tenant! tenant))

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
           :structured_attributes combined-attributes)))


(defenterprise validate-new-tenant-collection!
  "Throws API exceptions if the passed collection is an invalid tenant collection."
  :feature :tenants
  [{ttype :type :as _new-coll}]
  (when (collection/is-tenant-collection-type? ttype)
    ;; make sure tenants is enabled
    (api/check-400 (perms/use-tenants))

    ;; check perms - user has the application permission to create shared tenant collections
    (api/check-403 (perms/check-has-application-permission :create-tenant-collections))))
