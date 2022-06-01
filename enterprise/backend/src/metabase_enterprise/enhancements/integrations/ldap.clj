(ns metabase-enterprise.enhancements.integrations.ldap
  "The Enterprise version of the LDAP integration is basically the same but also supports syncing user attributes."
  (:require [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
            [metabase.integrations.common :as integrations.common]
            [metabase.integrations.ldap :as ldap]
            [metabase.integrations.ldap.default-implementation :as default-impl]
            [metabase.integrations.ldap.interface :as i]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.models.user :as user :refer [User]]
            [metabase.public-settings.premium-features :as premium-features :refer [defenterprise-schema]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import com.unboundid.ldap.sdk.LDAPConnectionPool))

(def ^:private EEUserInfo
  (assoc i/UserInfo :attributes (s/maybe {s/Keyword s/Any})))

(defsetting ldap-sync-user-attributes
  (deferred-tru "Should we sync user attributes when someone logs in via LDAP?")
  :type    :boolean
  :default true)

;; TODO - maybe we want to add a csv setting type?
(defsetting ldap-sync-user-attributes-blacklist
  (deferred-tru "Comma-separated list of user attributes to skip syncing for LDAP users.")
  :default "userPassword,dn,distinguishedName"
  :type    :csv)

(defsetting ldap-group-membership-filter
  (deferred-tru "Group membership lookup filter. The placeholders '{dn}' and '{uid}' will be replaced by the user''s Distinguished Name and UID, respectively.")
  :default "(member={dn})")

(defn- syncable-user-attributes [m]
  (when (ldap-sync-user-attributes)
    (apply dissoc m :objectclass (map (comp keyword u/lower-case-en) (ldap-sync-user-attributes-blacklist)))))

(defn fetch-or-create-user*!
  "Returns a session map for the given `email`. Will create the user if needed."
  [first-name last-name email user-attributes]
  (when-not (ldap/ldap-configured?)
    (throw (IllegalArgumentException. (str (tru "Can't create new LDAP user when LDAP is not configured")))))
  (let [user {:first_name       first-name
              :last_name        last-name
              :email            email
              :login_attributes (syncable-user-attributes user-attributes)}]
    (or (sso-utils/fetch-and-update-login-attributes! user) ; this fn is also used by JWT/SAML
        (user/create-new-ldap-auth-user! (merge user
                                                (when-not first-name {:first_name (trs "Unknown")})
                                                (when-not last-name {:last_name (trs "Unknown")}))))))

(defenterprise-schema find-user :- (s/maybe EEUserInfo)
  "Get user information for the supplied username."
  :feature :any
  [ldap-connection :- LDAPConnectionPool
   username        :- su/NonBlankString
   settings        :- i/LDAPSettings]
  (when-let [result (default-impl/search ldap-connection username settings)]
    (when-let [user-info (default-impl/ldap-search-result->user-info
                          ldap-connection
                          result
                          settings
                          (ldap-group-membership-filter))]
      (assoc user-info :attributes (syncable-user-attributes result)))))

(defenterprise-schema fetch-or-create-user! :- (class User)
  "Using the `user-info` (from `find-user`) get the corresponding Metabase user, creating it if necessary."
  :feature :any
  [{:keys [first-name last-name email groups attributes], :as user-info} :- EEUserInfo
   {:keys [sync-groups?], :as settings}                                  :- i/LDAPSettings]
  (let [user (fetch-or-create-user*! first-name last-name email attributes)]
    (u/prog1 user
      (when sync-groups?
        (let [group-ids            (default-impl/ldap-groups->mb-group-ids groups settings)
              all-mapped-group-ids (default-impl/all-mapped-group-ids settings)]
          (integrations.common/sync-group-memberships! user
                                                       group-ids
                                                       all-mapped-group-ids))))))
