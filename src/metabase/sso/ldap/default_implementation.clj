(ns metabase.sso.ldap.default-implementation
  "Default LDAP integration. This integration is used by OSS or for EE if enterprise features are not enabled."
  (:require
   [clj-ldap.client :as ldap]
   [clojure.string :as str]
   [metabase.premium-features.core :refer [defenterprise-schema]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (com.unboundid.ldap.sdk DN Filter LDAPConnectionPool)))

(set! *warn-on-reflection* true)

(def UserInfo
  "Schema for LDAP User info as returned by `user-info` and used as input to `fetch-or-create-user!`."
  [:map
   [:dn         ms/NonBlankString]
   [:first-name [:maybe ms/NonBlankString]]
   [:last-name  [:maybe ms/NonBlankString]]
   [:email      ms/Email]
   [:groups     [:maybe [:sequential ms/NonBlankString]]]])

(def LDAPSettings
  "Options passed to LDAP integration implementations. These are just the various LDAP Settings from
  [[metabase.sso.ldap]], packaged up as a single map so implementations don't need to fetch Setting values directly."
  [:map {:closed true}
   [:first-name-attribute ms/NonBlankString]
   [:last-name-attribute  ms/NonBlankString]
   [:email-attribute      ms/NonBlankString]
   [:sync-groups?         :boolean]
   [:user-base            ms/NonBlankString]
   [:user-filter          ms/NonBlankString]
   [:group-base           [:maybe ms/NonBlankString]]
   [:group-mappings       [:maybe [:map-of (ms/InstanceOfClass DN) [:sequential ms/PositiveInt]]]]])

;;; --------------------------------------------------- find-user ----------------------------------------------------

(def ^:private filter-placeholder
  "{login}")

(def ^:private group-membership-filter
  "(member={dn})")

(mu/defn search :- [:maybe :map]
  "Search for a LDAP user with `username`."
  [ldap-connection                 :- (ms/InstanceOfClass LDAPConnectionPool)
   username                        :- ms/NonBlankString
   {:keys [user-base user-filter]} :- LDAPSettings]
  (let [options {:scope      :sub
                 :filter     (str/replace user-filter filter-placeholder (Filter/encodeValue ^String username))
                 :size-limit 1}]
    (log/debugf "Searching for LDAP user with user search base %s" user-base)
    (let [search-result (ldap/search
                         ldap-connection
                         user-base
                         options)]
      (log/debugf "LDAP search returned %d result(s)" (count search-result))
      (some-> (first search-result) (update-keys (comp str/lower-case name))))))

(mu/defn- process-group-membership-filter :- ms/NonBlankString
  "Replace DN and UID placeholders with values returned by the LDAP server."
  [group-membership-filter :- ms/NonBlankString
   dn                      :- ms/NonBlankString
   uid                     :- [:maybe ms/NonBlankString]]
  (let [uid-string (or uid "")]
    (-> group-membership-filter
        (str/replace "{dn}" (Filter/encodeValue ^String dn))
        (str/replace "{uid}" (Filter/encodeValue ^String uid-string)))))

(mu/defn- user-groups :- [:maybe [:sequential ms/NonBlankString]]
  "Retrieve groups for a supplied DN."
  [ldap-connection         :- (ms/InstanceOfClass LDAPConnectionPool)
   dn                      :- ms/NonBlankString
   uid                     :- [:maybe ms/NonBlankString]
   {:keys [group-base]}    :- LDAPSettings
   group-membership-filter :- ms/NonBlankString]
  (when group-base
    (let [results (ldap/search
                   ldap-connection
                   group-base
                   {:scope  :sub
                    :filter (process-group-membership-filter group-membership-filter dn uid)})]
      (map :dn results))))

(mu/defn ldap-search-result->user-info :- [:maybe UserInfo]
  "Convert the result "
  [ldap-connection               :- (ms/InstanceOfClass LDAPConnectionPool)
   {:strs [dn uid], :as result}  :- (ms/string-keyed-map [:or :string [:sequential :string] [:set :string]])
   {:keys [first-name-attribute
           last-name-attribute
           email-attribute
           sync-groups?]
    :as   settings}              :- LDAPSettings
   group-membership-filter       :- ms/NonBlankString]
  (let [first-name (get result (str/lower-case first-name-attribute))
        last-name  (get result (str/lower-case last-name-attribute))
        email      (get result (str/lower-case email-attribute))]
    {:dn         dn
     :first-name first-name
     :last-name  last-name
     :email      email
     :groups     (when sync-groups?
                   ;; Active Directory and others (like FreeIPA) will supply a `memberOf` overlay attribute for
                   ;; groups. Otherwise we have to make the inverse query to get them.
                   (or (u/one-or-many (get result "memberof"))
                       (user-groups ldap-connection dn uid settings group-membership-filter)
                       []))}))

(defenterprise-schema find-user :- [:maybe UserInfo]
  "Get user information for the supplied username."
  metabase-enterprise.sso.integrations.ldap
  [ldap-connection :- (ms/InstanceOfClass LDAPConnectionPool)
   username        :- ms/NonBlankString
   settings        :- LDAPSettings]
  (when-let [result (search ldap-connection username settings)]
    (ldap-search-result->user-info ldap-connection result settings group-membership-filter)))

;;; --------------------------------------------- fetch-or-create-user! ----------------------------------------------

(mu/defn ldap-groups->mb-group-ids :- [:set ms/PositiveInt]
  "Translate a set of a user's group DNs to a set of MB group IDs using the configured mappings."
  [ldap-groups              :- [:maybe [:sequential ms/NonBlankString]]
   {:keys [group-mappings]} :- LDAPSettings]
  (-> group-mappings
      (select-keys (map #(DN. (str %)) ldap-groups))
      vals
      flatten
      set))

(mu/defn all-mapped-group-ids :- [:set ms/PositiveInt]
  "Returns the set of all MB group IDs that have configured mappings."
  [{:keys [group-mappings]} :- LDAPSettings]
  (-> group-mappings
      vals
      flatten
      set))
