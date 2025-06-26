(ns metabase-enterprise.tenants.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
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
