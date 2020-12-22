(ns metabase-enterprise.enhancements.integrations.ldap
  "The Enterprise version of the LDAP integration is basically the same but also supports syncing user attributes."
  (:require [metabase-enterprise.enhancements.ee-strategy-impl :as ee-strategy-impl]
            [metabase.integrations.common :as integrations.common]
            [metabase.integrations.ldap
             [default-implementation :as default-impl]
             [interface :as i]]
            [metabase.models
             [setting :as setting :refer [defsetting]]
             [user :as user :refer [User]]]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [deferred-tru]]
             [schema :as su]]
            [pretty.core :refer [PrettyPrintable]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import com.unboundid.ldap.sdk.LDAPConnectionPool
           metabase.integrations.ldap.interface.LDAPIntegration))

(def ^:private EEUserInfo
  (assoc i/UserInfo :attributes (s/maybe {s/Keyword s/Any})))

(defsetting ldap-sync-user-attributes
  (deferred-tru "Should we sync user attributes when someone logs in via LDAP?")
  :type :boolean
  :default true)

;; TODO - maybe we want to add a csv setting type?
(defsetting ldap-sync-user-attributes-blacklist
  (deferred-tru "Comma-separated list of user attributes to skip syncing for LDAP users.")
  :default "userPassword,dn,distinguishedName"
  :type    :csv)

(defn- syncable-user-attributes [m]
  (when (ldap-sync-user-attributes)
    (apply dissoc m :objectclass (map (comp keyword u/lower-case-en) (ldap-sync-user-attributes-blacklist)))))

(defn- attribute-synced-user
  [{:keys [attributes email]}]
  (when-let [user (db/select-one [User :id :last_login :login_attributes] :%lower.email (u/lower-case-en email))]
    (let [syncable-attributes (syncable-user-attributes attributes)]
      ;; Update User's `login_attributes` if needed
      (if (and (not= (:login_attributes user) syncable-attributes)
               (db/update! User (:id user) :login_attributes syncable-attributes))
        (db/select-one [User :id :last_login] :id (:id user)) ; Reload updated user
        user))))

(s/defn ^:private find-user* :- (s/maybe EEUserInfo)
  [ldap-connection :- LDAPConnectionPool
   username        :- su/NonBlankString
   settings        :- i/LDAPSettings]
  (when-let [result (default-impl/search ldap-connection username settings)]
    (when-let [user-info (default-impl/ldap-search-result->user-info ldap-connection result settings)]
      (assoc user-info :attributes (syncable-user-attributes result)))))

(s/defn ^:private fetch-or-create-user!* :- (class User)
  [{:keys [first-name last-name email groups attributes], :as user-info} :- EEUserInfo
   {:keys [sync-groups?], :as settings}                                  :- i/LDAPSettings]
  (let [user (or (attribute-synced-user user-info)
                 (user/create-new-ldap-auth-user!
                  {:first_name       first-name
                   :last_name        last-name
                   :email            email
                   :login_attributes attributes}))]
    (u/prog1 user
      (when sync-groups?
        (let [group-ids (default-impl/ldap-groups->mb-group-ids groups settings)]
          (integrations.common/sync-group-memberships! user group-ids))))))

(def ^:private impl
  (reify
    PrettyPrintable
    (pretty [_]
      `impl)

    LDAPIntegration
    (find-user [_ ldap-connection username ldap-settings]
      (find-user* ldap-connection username ldap-settings))

    (fetch-or-create-user! [_ user-info ldap-settings]
      (fetch-or-create-user!* user-info ldap-settings))))

(def ee-strategy-impl
  "Enterprise version of the LDAP integration. Uses our EE strategy pattern adapter: if EE features *are* enabled,
  forwards method invocations to `impl`; if EE features *are not* enabled, forwards method invocations to the
  default OSS impl."
  (ee-strategy-impl/reify-ee-strategy-impl impl default-impl/impl
    LDAPIntegration))
