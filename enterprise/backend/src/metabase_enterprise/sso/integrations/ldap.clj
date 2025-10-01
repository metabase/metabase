(ns metabase-enterprise.sso.integrations.ldap
  "The Enterprise version of the LDAP integration is basically the same but also supports syncing user attributes."
  (:require
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as ee.sso.settings]
   [metabase.premium-features.core :refer [defenterprise-schema]]
   [metabase.sso.core :as sso]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (com.unboundid.ldap.sdk LDAPConnectionPool)))

(def ^:private EEUserInfo
  [:merge sso/LDAPUserInfo
   [:map [:attributes [:maybe [:map-of :keyword :any]]]]])

(defn- syncable-user-attributes [m]
  (when (ee.sso.settings/ldap-sync-user-attributes)
    (apply dissoc m :objectclass (map (comp keyword u/lower-case-en) (ee.sso.settings/ldap-sync-user-attributes-blacklist)))))

(defn- attribute-synced-user
  [{:keys [attributes first-name last-name email]}]
  (when-let [user (t2/select-one [:model/User :id :last_login :first_name :last_name :login_attributes :is_active]
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
          (t2/update! :model/User (:id user) user-changes)
          (t2/select-one [:model/User :id :last_login :is_active] :id (:id user))) ; Reload updated user
        user))))

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

;;; for some reason the `:clj-kondo/ignore` doesn't work inside of [[defenterprise-schema]]
#_{:clj-kondo/ignore [:deprecated-var]}
(defenterprise-schema fetch-or-create-user! :- (ms/InstanceOf :model/User)
  "Using the `user-info` (from `find-user`) get the corresponding Metabase user, creating it if necessary."
  :feature :sso-ldap
  [{:keys [first-name last-name email groups attributes], :as user-info} :- EEUserInfo
   {:keys [sync-groups?], :as settings}                                  :- sso/LDAPSettings]
  (let [user (or #p (attribute-synced-user user-info)
                 #p (sso-utils/check-user-provisioning :ldap)
                 #p (-> (sso/create-new-ldap-auth-user! {:first_name       first-name
                                                         :last_name        last-name
                                                         :email            email
                                                         :login_attributes attributes})
                        (assoc :is_active true)))]
    (u/prog1 user
      (when sync-groups?
        (let [group-ids            (sso/ldap-groups->mb-group-ids groups settings)
              all-mapped-group-ids (sso/all-mapped-ldap-group-ids settings)]
          (sso/sync-group-memberships! user
                                       group-ids
                                       all-mapped-group-ids))))))
