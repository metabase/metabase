(ns metabase-enterprise.sso.integrations.ldap
  "The Enterprise version of the LDAP integration is basically the same but also supports syncing user attributes."
  (:require
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as ee.sso.settings]
   [metabase.premium-features.core :refer [defenterprise-schema defenterprise]]
   [metabase.sso.core :as sso]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms])
  (:import
   (com.unboundid.ldap.sdk LDAPConnectionPool)))

(def ^:private EEUserInfo
  [:merge sso/LDAPUserInfo
   [:map [:attributes [:maybe [:map-of :string :any]]]]])

(defn- syncable-user-attributes
  "Directory attributes to sync onto the user. Only attributes named in the allowlist are kept, so an
  empty allowlist syncs nothing; `:objectclass` and the configured blacklist are always dropped.
  Surviving attributes are normalized by
  [[metabase-enterprise.sso.integrations.sso-utils/stringify-valid-attributes]]."
  [m]
  (when (ee.sso.settings/ldap-sync-user-attributes)
    (let [allowlist (set (map u/lower-case-en (ee.sso.settings/ldap-sync-user-attributes-allowlist)))
          blocked   (into #{:objectclass}
                          (map (comp keyword u/lower-case-en))
                          (ee.sso.settings/ldap-sync-user-attributes-blacklist))]
      (->> m
           (remove (fn [[k _]]
                     (let [k-lower (u/lower-case-en (name k))]
                       (or (contains? blocked (keyword k-lower))
                           (not (contains? allowlist k-lower))))))
           sso-utils/stringify-valid-attributes))))

(defenterprise-schema find-user :- [:maybe EEUserInfo]
  "Get user information for the supplied username."
  :feature :sso-ldap
  [ldap-connection :- (ms/InstanceOfClass LDAPConnectionPool)
   username        :- ms/NonBlankString
   settings        :- sso/LDAPSettings]
  (when-let [result (sso/ldap-search ldap-connection username settings)]
    (when-let [user-info (sso/ldap-search-result->user-info
                          ldap-connection
                          result
                          settings
                          (ee.sso.settings/ldap-group-membership-filter))]
      (assoc user-info :attributes (syncable-user-attributes result)))))

(defenterprise check-provision-ldap
  "Throw if creating new users from ldap is disallowed."
  :feature :sso-ldap
  []
  (sso-utils/check-user-provisioning :ldap))
