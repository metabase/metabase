(ns metabase.integrations.ldap.default-implementation
  "Default LDAP integration. This integration is used by OSS or for EE if enterprise features are not enabled."
  (:require
   [clj-ldap.client :as ldap]
   [clojure.string :as str]
   [metabase.integrations.common :as integrations.common]
   [metabase.models.interface :as mi]
   [metabase.models.user :as user :refer [User]]
   [metabase.public-settings.premium-features
    :refer [defenterprise-schema]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (com.unboundid.ldap.sdk DN Filter LDAPConnectionPool)))

(set! *warn-on-reflection* true)

(def UserInfo
  "Schema for LDAP User info as returned by `user-info` and used as input to `fetch-or-create-user!`."
  {:dn         su/NonBlankString
   :first-name (s/maybe su/NonBlankString)
   :last-name  (s/maybe su/NonBlankString)
   :email      su/Email
   :groups     [su/NonBlankString]
   s/Keyword   s/Any})

(def LDAPSettings
  "Options passed to LDAP integration implementations. These are just the various LDAP Settings from
  `metabase.integrations.ldap`, packaged up as a single map so implementations don't need to fetch Setting values
  directly."
  {:first-name-attribute su/NonBlankString
   :last-name-attribute  su/NonBlankString
   :email-attribute      su/NonBlankString
   :sync-groups?         s/Bool
   :user-base            su/NonBlankString
   :user-filter          su/NonBlankString
   :group-base           (s/maybe su/NonBlankString)
   :group-mappings       (s/maybe {DN [su/IntGreaterThanZero]})
   s/Keyword             s/Any})


;;; --------------------------------------------------- find-user ----------------------------------------------------

(def ^:private filter-placeholder
  "{login}")

(def ^:private group-membership-filter
  "(member={dn})")

(s/defn search :- (s/maybe su/Map)
  "Search for a LDAP user with `username`."
  [ldap-connection                 :- LDAPConnectionPool
   username                        :- su/NonBlankString
   {:keys [user-base user-filter]} :- LDAPSettings]
  (some-> (first
           (ldap/search
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
  [ldap-connection         :- LDAPConnectionPool
   dn                      :- su/NonBlankString
   uid                     :- (s/maybe su/NonBlankString)
   {:keys [group-base]}    :- LDAPSettings
   group-membership-filter :- su/NonBlankString]
  (when group-base
    (let [results (ldap/search
                   ldap-connection
                   group-base
                   {:scope  :sub
                    :filter (process-group-membership-filter group-membership-filter dn uid)})]
      (map :dn results))))

(s/defn ldap-search-result->user-info :- (s/maybe UserInfo)
  "Convert the result "
  [ldap-connection               :- LDAPConnectionPool
   {:keys [dn uid], :as result}  :- su/Map
   {:keys [first-name-attribute
           last-name-attribute
           email-attribute
           sync-groups?]
    :as   settings}              :- LDAPSettings
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

(defenterprise-schema find-user :- (s/maybe UserInfo)
  "Get user information for the supplied username."
  metabase-enterprise.enhancements.integrations.ldap
  [ldap-connection :- LDAPConnectionPool
   username        :- su/NonBlankString
   settings        :- LDAPSettings]
  (when-let [result (search ldap-connection username settings)]
    (ldap-search-result->user-info ldap-connection result settings group-membership-filter)))


;;; --------------------------------------------- fetch-or-create-user! ----------------------------------------------

(mu/defn ldap-groups->mb-group-ids :- [:set ms/PositiveInt]
  "Translate a set of a user's group DNs to a set of MB group IDs using the configured mappings."
  [ldap-groups              :- [:maybe [:sequential ms/NonBlankString]]
   {:keys [group-mappings]} :- [:map
                                [:group-mappings [:map-of
                                                  (ms/InstanceOfClass DN)
                                                  [:maybe [:sequential ms/PositiveInt]]]]]]
  (-> group-mappings
      (select-keys (map #(DN. (str %)) ldap-groups))
      vals
      flatten
      set))

(s/defn all-mapped-group-ids :- #{su/IntGreaterThanZero}
  "Returns the set of all MB group IDs that have configured mappings."
  [{:keys [group-mappings]} :- (select-keys LDAPSettings [:group-mappings s/Keyword])]
  (-> group-mappings
      vals
      flatten
      set))

;;; for some reason the `:clj-kondo/ignore` doesn't work inside of [[defenterprise-schema]]
#_{:clj-kondo/ignore [:deprecated-var]}
(defenterprise-schema fetch-or-create-user! :- (mi/InstanceOf:Schema User)
  "Using the `user-info` (from `find-user`) get the corresponding Metabase user, creating it if necessary."
  metabase-enterprise.enhancements.integrations.ldap
  [{:keys [first-name last-name email groups]} :- UserInfo
   {:keys [sync-groups?], :as settings}        :- LDAPSettings]
  (let [user     (t2/select-one [User :id :last_login :first_name :last_name :is_active]
                   :%lower.email (u/lower-case-en email))
        new-user (if user
                   (let [old-first-name (:first_name user)
                         old-last-name  (:last_name user)
                         user-changes   (merge
                                          (when (not= first-name old-first-name) {:first_name first-name})
                                          (when (not= last-name old-last-name) {:last_name last-name}))]
                     (if (seq user-changes)
                       (do
                         (t2/update! User (:id user) user-changes)
                         (t2/select-one [User :id :last_login :is_active] :id (:id user))) ; Reload updated user
                       user))
                   (-> (user/create-new-ldap-auth-user! {:first_name first-name
                                                         :last_name  last-name
                                                         :email      email})
                       (assoc :is_active true)))]
    (u/prog1 new-user
      (when sync-groups?
        (let [group-ids            (ldap-groups->mb-group-ids groups settings)
              all-mapped-group-ids (all-mapped-group-ids settings)]
          (integrations.common/sync-group-memberships! new-user group-ids all-mapped-group-ids))))))
