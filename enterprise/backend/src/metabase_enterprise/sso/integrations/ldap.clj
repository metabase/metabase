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

(defn- syncable-user-attributes [m]
  (when (ee.sso.settings/ldap-sync-user-attributes)
    (apply dissoc m :objectclass (map (comp keyword u/lower-case-en) (ee.sso.settings/ldap-sync-user-attributes-blacklist)))))

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
      (assoc user-info :attributes (some-> (syncable-user-attributes result) (update-keys name))))))

(defenterprise check-provision-ldap
  "Throw if creating new users from ldap is disallowed."
  :feature :sso-ldap
  []
  (sso-utils/check-user-provisioning :ldap))
