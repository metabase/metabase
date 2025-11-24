(ns metabase.tenants.core
  "Shim namespace for `metabase-enterprise.tenants.core`"
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli :as mu]))

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

(def ^:private SimpleAttributes
  "Basic attributes for users and tenants are a map of string keys to string values."
  [:map-of :string :string])

(def ^:private SystemAttributes
  "Attributes generated from system properties must be prefixed with @."
  [:map-of [:re #"@.*"] :string])

(def ^:private AttributeStatus
  "Describes a possible value of an attribute and where it is sourced from."
  [:map
   [:source [:enum :user :tenant :system]]
   [:frozen boolean?]
   [:value :string]])

(def ^:private CombinedAttributes
  "Map of user attributes to their current value and metadata describing where they are sourced from."
  [:map-of :string
   [:merge AttributeStatus
    [:map
     [:original {:optional true}
      AttributeStatus]]]])

(mu/defn combine :- CombinedAttributes
  "Combines user, tenant, and system attributes. User can override "
  ([user :- [:maybe SimpleAttributes]]
   (combine user nil nil))
  ([user :- [:maybe SimpleAttributes]
    tenant :- [:maybe SimpleAttributes]
    system :- [:maybe SystemAttributes]]
   (letfn [(value-map [s f vs] (into {}
                                     (for [[k v] vs]
                                       [k {:source s :frozen f :value v}])))
           (shadow [original new] (if original (assoc new :original original) new))
           (error [original new] (if original
                                   (throw (ex-info "Cannot clobber"
                                                   {:bad-attribute original
                                                    :attribute new}))
                                   new))]
     (merge-with error
                 (merge-with shadow
                             (value-map :tenant false tenant)
                             (value-map :user false user))
                 (value-map :system true system)))))

(defenterprise user->tenant
  "Get the tenant for a user"
  metabase-enterprise.tenants.core
  [_user]
  nil)
