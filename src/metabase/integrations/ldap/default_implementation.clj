(ns metabase.integrations.ldap.default-implementation
  "Default LDAP integration. This integration is used by OSS or for EE if enterprise features are not enabled."
  (:require [clj-ldap.client :as ldap-client]
            [clojure.string :as str]
            [metabase.integrations.common :as integrations.common]
            [metabase.integrations.ldap.interface :as i]
            [metabase.models.user :as user :refer [User]]
            [metabase.util :as u]
            [metabase.util.i18n :as ui18n :refer [trs]]
            [metabase.util.schema :as su]
            [pretty.core :refer [PrettyPrintable]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import [com.unboundid.ldap.sdk DN Filter LDAPConnectionPool]
           metabase.integrations.ldap.interface.LDAPIntegration))

;;; --------------------------------------------------- find-user ----------------------------------------------------

(def ^:private filter-placeholder
  "{login}")

(def ^:private group-membership-filter
  "(member={dn})")

(s/defn search :- (s/maybe su/Map)
  "Search for a LDAP user with `username`."
  [ldap-connection                 :- LDAPConnectionPool
   username                        :- su/NonBlankString
   {:keys [user-base user-filter]} :- i/LDAPSettings]
  (some-> (first
           (ldap-client/search
            ldap-connection
            user-base
            {:scope      :sub
             :filter     (str/replace user-filter filter-placeholder (Filter/encodeValue ^String username))
             :size-limit 1}))
          u/lower-case-map-keys))

(s/defn ^:private process-group-membership-filter :- su/NonBlankString
  "Replace DN and UID placeholders with values returned by the LDAP server."
  [group-membership-filter :- su/NonBlankString
   dn                      :- su/NonBlankString
   uid                     :- (s/maybe su/NonBlankString)]
  (let [uid-string (or uid "")]
    (-> group-membership-filter
        (str/replace "{dn}" (Filter/encodeValue ^String dn))
        (str/replace "{uid}" (Filter/encodeValue ^String uid-string)))))

(s/defn ^:private user-groups :- (s/maybe [su/NonBlankString])
  "Retrieve groups for a supplied DN."
  [ldap-connection                              :- LDAPConnectionPool
   dn                                           :- su/NonBlankString
   uid                                          :- su/NonBlankString
   {:keys [group-base]}                         :- i/LDAPSettings
   group-membership-filter                      :- su/NonBlankString]
  (when group-base
    (let [results (ldap-client/search
                   ldap-connection
                   group-base
                   {:scope  :sub
                    :filter (process-group-membership-filter group-membership-filter dn uid)})]
      (map :dn results))))

(s/defn ldap-search-result->user-info :- (s/maybe i/UserInfo)
  "Convert the result "
  [ldap-connection               :- LDAPConnectionPool
   {:keys [dn uid], :as result} :- su/Map
   {:keys [first-name-attribute
           last-name-attribute
           email-attribute
           sync-groups?]
    :as   settings}              :- i/LDAPSettings
   group-membership-filter       :- su/NonBlankString]
  (let [{first-name (keyword first-name-attribute)
         last-name  (keyword last-name-attribute)
         email      (keyword email-attribute)} result]
    {:dn         dn
     :first-name first-name
     :last-name  last-name
     :email      email
     :groups     (when sync-groups?
                   ;; Active Directory and others (like FreeIPA) will supply a `memberOf` overlay attribute for
                   ;; groups. Otherwise we have to make the inverse query to get them.
                   (or (u/one-or-many (:memberof result))
                       (user-groups ldap-connection dn uid settings group-membership-filter)
                       []))}))

(s/defn ^:private find-user* :- (s/maybe i/UserInfo)
  [ldap-connection :- LDAPConnectionPool
   username        :- su/NonBlankString
   settings        :- i/LDAPSettings]
  (when-let [result (search ldap-connection username settings)]
    (ldap-search-result->user-info ldap-connection result settings group-membership-filter)))


;;; --------------------------------------------- fetch-or-create-user! ----------------------------------------------

(s/defn ldap-groups->mb-group-ids :- #{su/IntGreaterThanZero}
  "Translate a set of a user's group DNs to a set of MB group IDs using the configured mappings."
  [ldap-groups              :- (s/maybe [su/NonBlankString])
   {:keys [group-mappings]} :- (select-keys i/LDAPSettings [:group-mappings s/Keyword])]
  (-> group-mappings
      (select-keys (map #(DN. (str %)) ldap-groups))
      vals
      flatten
      set))

(s/defn all-mapped-group-ids :- #{su/IntGreaterThanZero}
  "Returns the set of all MB group IDs that have configured mappings."
  [{:keys [group-mappings]} :- (select-keys i/LDAPSettings [:group-mappings s/Keyword])]
  (-> group-mappings
      vals
      flatten
      set))

(defn updated-name-part
  "Given a first or last name returned by LDAP, and the equivalent name currently stored by Metabase, return the new
  name that should be stored by Metabase."
  [ldap-name mb-name]
  (if (and mb-name (nil? ldap-name))
    ;; Don't overwrite a stored name if no name was returned by LDAP
    mb-name
    (or ldap-name (trs "Unknown"))))

(s/defn ^:private fetch-or-create-user!* :- (class User)
  [{:keys [first-name last-name email groups]} :- i/UserInfo
   {:keys [sync-groups?], :as settings}        :- i/LDAPSettings]
  (let [user (db/select-one [User :id :last_login :first_name :last_name :is_active] :%lower.email (u/lower-case-en email))
        new-user (if user
                   (let [old-first-name (:first_name user)
                         old-last-name (:last_name user)
                         new-first-name (updated-name-part first-name old-first-name)
                         new-last-name (updated-name-part last-name old-last-name)
                         user-changes (merge
                                       (when-not (= new-first-name old-first-name) {:first_name new-first-name})
                                       (when-not (= new-last-name old-last-name) {:last_name new-last-name}))]
                     (if (seq user-changes)
                       (do
                         (db/update! User (:id user) user-changes)
                         (db/select-one [User :id :last_login :is_active] :id (:id user))) ; Reload updated user
                       user))
                   (-> (user/create-new-ldap-auth-user! {:first_name (or first-name (trs "Unknown"))
                                                         :last_name  (or last-name (trs "Unknown"))
                                                         :email      email})
                       (assoc :is_active true)))]
    (u/prog1 new-user
      (when sync-groups?
        (let [group-ids   (ldap-groups->mb-group-ids groups settings)
              all-mapped-group-ids (all-mapped-group-ids settings)]
          (integrations.common/sync-group-memberships! new-user group-ids all-mapped-group-ids false))))))

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
