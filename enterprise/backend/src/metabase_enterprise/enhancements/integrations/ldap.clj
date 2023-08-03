(ns metabase-enterprise.enhancements.integrations.ldap
  "The Enterprise version of the LDAP integration is basically the same but also supports syncing user attributes."
  (:require
   [metabase.integrations.common :as integrations.common]
   [metabase.integrations.ldap.default-implementation :as default-impl]
   [metabase.models.interface :as mi]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.user :as user :refer [User]]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise-schema]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (com.unboundid.ldap.sdk LDAPConnectionPool)))

(def ^:private EEUserInfo
  (assoc default-impl/UserInfo :attributes (s/maybe {s/Keyword s/Any})))

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

(defn- attribute-synced-user
  [{:keys [attributes first-name last-name email]}]
  (when-let [user (t2/select-one [User :id :last_login :first_name :last_name :login_attributes :is_active]
                                 :%lower.email (u/lower-case-en email))]
    (let [syncable-attributes (syncable-user-attributes attributes)
          old-first-name (:first_name user)
          old-last-name (:last_name user)
          user-changes (merge
                        (when-not (= syncable-attributes (:login_attributes user))
                          {:login_attributes syncable-attributes})
                        (when (not= first-name old-first-name)
                          {:first_name first-name})
                        (when (not= last-name old-last-name)
                          {:last_name last-name}))]
      (if (seq user-changes)
        (do
          (t2/update! User (:id user) user-changes)
          (t2/select-one [User :id :last_login :is_active] :id (:id user))) ; Reload updated user
        user))))

(defenterprise-schema find-user :- (s/maybe EEUserInfo)
  "Get user information for the supplied username."
  :feature :sso-ldap
  [ldap-connection :- LDAPConnectionPool
   username        :- su/NonBlankString
   settings        :- default-impl/LDAPSettings]
  (when-let [result (default-impl/search ldap-connection username settings)]
    (when-let [user-info (default-impl/ldap-search-result->user-info
                          ldap-connection
                          result
                          settings
                          (ldap-group-membership-filter))]
      (assoc user-info :attributes (syncable-user-attributes result)))))

(defenterprise-schema fetch-or-create-user! :- (mi/InstanceOf User)
  "Using the `user-info` (from `find-user`) get the corresponding Metabase user, creating it if necessary."
  :feature :sso-ldap
  [{:keys [first-name last-name email groups attributes], :as user-info} :- EEUserInfo
   {:keys [sync-groups?], :as settings}                                  :- default-impl/LDAPSettings]
  (let [user (or (attribute-synced-user user-info)
                 (-> (user/create-new-ldap-auth-user! {:first_name       first-name
                                                       :last_name        last-name
                                                       :email            email
                                                       :login_attributes attributes})
                     (assoc :is_active true)))]
    (u/prog1 user
      (when sync-groups?
        (let [group-ids            (default-impl/ldap-groups->mb-group-ids groups settings)
              all-mapped-group-ids (default-impl/all-mapped-group-ids settings)]
          (integrations.common/sync-group-memberships! user
                                                       group-ids
                                                       all-mapped-group-ids))))))
