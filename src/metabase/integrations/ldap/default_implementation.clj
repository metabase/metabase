(ns metabase.integrations.ldap.default-implementation
  "Default LDAP integration. This integration is used by OSS or for EE if enterprise features are not enabled."
  (:require [clj-ldap.client :as ldap-client]
            [clojure.string :as str]
            [metabase.integrations.common :as integrations.common]
            [metabase.integrations.ldap.interface :as i]
            [metabase.models.user :as user :refer [User]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [pretty.core :refer [PrettyPrintable]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import [com.unboundid.ldap.sdk DN Filter LDAPConnectionPool]
           metabase.integrations.ldap.interface.LDAPIntegration))

;;; --------------------------------------------------- find-user ----------------------------------------------------

(def ^:private filter-placeholder
  "{login}")

(s/defn search :- (s/maybe su/Map)
  "Search for a LDAP user with `username`."
  [ldap-connection :- LDAPConnectionPool
   username        :- su/NonBlankString
   {:keys [user-base
           user-filter]} :- i/LDAPSettings]
  (some-> (first
           (ldap-client/search
            ldap-connection
            user-base
            {:scope      :sub
             :filter     (str/replace user-filter filter-placeholder (Filter/encodeValue ^String username))
             :size-limit 1}))
          u/lower-case-map-keys))

(s/defn ^:private user-groups :- (s/maybe [su/NonBlankString])
  "Retrieve groups for a supplied DN."
  [ldap-connection :- LDAPConnectionPool
   dn              :- su/NonBlankString
   {:keys [group-base]} :- i/LDAPSettings]
  (when group-base
    (let [results (ldap-client/search
                   ldap-connection
                   group-base
                   {:scope  :sub
                    :filter (Filter/createEqualityFilter "member" ^String dn)})]
      (map :dn results))))

(s/defn ldap-search-result->user-info :- (s/maybe i/UserInfo)
  "Convert the result "
  [ldap-connection          :- LDAPConnectionPool
   {:keys [dn], :as result} :- su/Map
   {:keys [first-name-attribute
           last-name-attribute
           email-attribute
           sync-groups?]
    :as   settings} :- i/LDAPSettings]
  (let [{first-name (keyword first-name-attribute)
         last-name  (keyword last-name-attribute)
         email      (keyword email-attribute)} result]
    ;; Make sure we got everything as these are all required for new accounts
    (when-not (some empty? [dn first-name last-name email])
      {:dn         dn
       :first-name first-name
       :last-name  last-name
       :email      email
       :groups     (when sync-groups?
                     ;; Active Directory and others (like FreeIPA) will supply a `memberOf` overlay attribute for
                     ;; groups. Otherwise we have to make the inverse query to get them.
                     (or (:memberof result)
                         (user-groups ldap-connection dn settings)
                         []))})))

(s/defn ^:private find-user* :- (s/maybe i/UserInfo)
  [ldap-connection :- LDAPConnectionPool
   username        :- su/NonBlankString
   settings        :- i/LDAPSettings]
  (when-let [result (search ldap-connection username settings)]
    (ldap-search-result->user-info ldap-connection result settings)))


;;; --------------------------------------------- fetch-or-create-user! ----------------------------------------------

(s/defn ldap-groups->mb-group-ids :- #{su/IntGreaterThanZero}
  "Translate a set of DNs to a set of MB group IDs using the configured mappings."
  [ldap-groups              :- (s/maybe [su/NonBlankString])
   {:keys [group-mappings]} :- (select-keys i/LDAPSettings [:group-mappings s/Keyword])]
  (-> group-mappings
      (select-keys (map #(DN. (str %)) ldap-groups))
      vals
      flatten
      set))

(s/defn ^:private fetch-or-create-user!* :- (class User)
  [{:keys [first-name last-name email groups]} :- i/UserInfo
   {:keys [sync-groups?], :as settings}        :- i/LDAPSettings]
  (let [user (or (db/select-one [User :id :last_login] :email email)
                 (user/create-new-ldap-auth-user!
                  {:first_name first-name
                   :last_name  last-name
                   :email      email}))]
    (u/prog1 user
      (when sync-groups?
        (let [group-ids (ldap-groups->mb-group-ids groups settings)]
          (integrations.common/sync-group-memberships! user group-ids))))))


;;; ------------------------------------------------------ impl ------------------------------------------------------

(def impl
  "Default LDAP integration."
  (reify
    PrettyPrintable
    (pretty [_]
      `impl)

    LDAPIntegration
    (find-user [_ ldap-connection username ldap-settings]
      (find-user* ldap-connection username ldap-settings))

    (fetch-or-create-user! [_ user-info ldap-settings]
      (fetch-or-create-user!* user-info ldap-settings))))
