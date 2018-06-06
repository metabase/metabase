(ns metabase.integrations.ldap
  (:require [clj-ldap.client :as ldap]
            [clojure
             [set :as set]
             [string :as str]]
            [metabase.models
             [permissions-group :as group :refer [PermissionsGroup]]
             [setting :as setting :refer [defsetting]]
             [user :as user :refer [User]]]
            [metabase.util :as u]
            [puppetlabs.i18n.core :refer [tru]]
            [toucan.db :as db])
  (:import [com.unboundid.ldap.sdk LDAPConnectionPool LDAPException]))

(def ^:private filter-placeholder
  "{login}")

(defsetting ldap-enabled
  (tru "Enable LDAP authentication.")
  :type    :boolean
  :default false)

(defsetting ldap-host
  (tru "Server hostname."))

(defsetting ldap-port
  (tru "Server port, usually 389 or 636 if SSL is used.")
  :default "389")

(defsetting ldap-security
  (tru "Use SSL, TLS or plain text.")
  :default "none"
  :setter  (fn [new-value]
             (when-not (nil? new-value)
               (assert (contains? #{"none" "ssl" "starttls"} new-value)))
             (setting/set-string! :ldap-security new-value)))

(defsetting ldap-bind-dn
  (tru "The Distinguished Name to bind as (if any), this user will be used to lookup information about other users."))

(defsetting ldap-password
  (tru "The password to bind with for the lookup user."))

(defsetting ldap-user-base
  (tru "Search base for users. (Will be searched recursively)"))

(defsetting ldap-user-filter
  (tru "User lookup filter, the placeholder '{login}' will be replaced by the user supplied login.")
  :default "(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))")

(defsetting ldap-attribute-email
  (tru "Attribute to use for the user's email. (usually ''mail'', ''email'' or ''userPrincipalName'')")
  :default "mail")

(defsetting ldap-attribute-firstname
  (tru "Attribute to use for the user''s first name. (usually ''givenName'')")
  :default "givenName")

(defsetting ldap-attribute-lastname
  (tru "Attribute to use for the user''s last name. (usually ''sn'')")
  :default "sn")

(defsetting ldap-group-sync
  (tru "Enable group membership synchronization with LDAP.")
  :type    :boolean
  :default false)

(defsetting ldap-group-base
  (tru "Search base for groups, not required if your LDAP directory provides a ''memberOf'' overlay. (Will be searched recursively)"))

(defsetting ldap-group-mappings
  ;; Should be in the form: {"cn=Some Group,dc=...": [1, 2, 3]} where keys are LDAP groups and values are lists of MB groups IDs
  (tru "JSON containing LDAP to Metabase group mappings.")
  :type    :json
  :default {})

(defn ldap-configured?
  "Check if LDAP is enabled and that the mandatory settings are configured."
  []
  (boolean (and (ldap-enabled)
                (ldap-host)
                (ldap-user-base))))

(defn- details->ldap-options [{:keys [host port bind-dn password security]}]
  {:host      (str host ":" port)
   :bind-dn   bind-dn
   :password  password
   :ssl?      (= security "ssl")
   :startTLS? (= security "starttls")})

(defn- settings->ldap-options []
  (details->ldap-options {:host      (ldap-host)
                          :port      (ldap-port)
                          :bind-dn   (ldap-bind-dn)
                          :password  (ldap-password)
                          :security  (ldap-security)}))

(defn- escape-value
  "Escapes a value for use in an LDAP filter expression."
  [value]
  (str/replace value #"[\*\(\)\\\\0]" (comp (partial format "\\%02X") int first)))

(defn- get-connection
  "Connects to LDAP with the currently set settings and returns the connection."
  ^LDAPConnectionPool []
  (ldap/connect (settings->ldap-options)))

(defn- with-connection
  "Applies `f` with a connection and `args`"
  [f & args]
  (with-open [conn (get-connection)]
    (apply f conn args)))

(defn- ldap-groups->mb-group-ids
  "Will translate a set of DNs to a set of MB group IDs using the configured mappings."
  [ldap-groups]
  (-> (ldap-group-mappings)
      (select-keys (map keyword ldap-groups))
      vals
      flatten
      set))

(defn- get-user-groups
  "Retrieve groups for a supplied DN."
  ([dn]
    (with-connection get-user-groups dn))
  ([conn dn]
    (when (ldap-group-base)
      (let [results (ldap/search conn (ldap-group-base) {:scope      :sub
                                                         :filter     (str "member=" (escape-value dn))
                                                         :attributes [:dn :distinguishedName]})]
        (filter some?
          (for [result results]
            (or (:dn result) (:distinguishedName result))))))))

(def ^:private user-base-error  {:status :ERROR, :message "User search base does not exist or is unreadable"})
(def ^:private group-base-error {:status :ERROR, :message "Group search base does not exist or is unreadable"})

(defn test-ldap-connection
  "Test the connection to an LDAP server to determine if we can find the search base.

   Takes in a dictionary of properties such as:
       {:host       \"localhost\"
        :port       389
        :bind-dn    \"cn=Directory Manager\"
        :password   \"password\"
        :security   \"none\"
        :user-base  \"ou=Birds,dc=metabase,dc=com\"
        :group-base \"ou=Groups,dc=metabase,dc=com\"}"
  [{:keys [user-base group-base], :as details}]
  (try
    (with-open [^LDAPConnectionPool conn (ldap/connect (details->ldap-options details))]
      (or
       (try
         (when-not (ldap/get conn user-base)
           user-base-error)
         (catch Exception e
           user-base-error))
       (when group-base
         (try
           (when-not (ldap/get conn group-base)
             group-base-error)
           (catch Exception e
             group-base-error)))
       {:status :SUCCESS}))
    (catch LDAPException e
      {:status :ERROR, :message (.getMessage e), :code (.getResultCode e)})
    (catch Exception e
      {:status :ERROR, :message (.getMessage e)})))

(defn find-user
  "Gets user information for the supplied username."
  ([username]
    (with-connection find-user username))
  ([conn username]
    (let [fname-attr (keyword (ldap-attribute-firstname))
          lname-attr (keyword (ldap-attribute-lastname))
          email-attr (keyword (ldap-attribute-email))]
      (when-let [[result] (ldap/search conn (ldap-user-base) {:scope      :sub
                                                              :filter     (str/replace (ldap-user-filter) filter-placeholder (escape-value username))
                                                              :attributes [:dn :distinguishedName fname-attr lname-attr email-attr :memberOf]
                                                              :size-limit 1})]
        (let [dn    (or (:dn result) (:distinguishedName result))
              fname (get result fname-attr)
              lname (get result lname-attr)
              email (get result email-attr)]
          ;; Make sure we got everything as these are all required for new accounts
          (when-not (or (empty? dn) (empty? fname) (empty? lname) (empty? email))
            ;; ActiveDirectory (and others?) will supply a `memberOf` overlay attribute for groups
            ;; Otherwise we have to make the inverse query to get them
            (let [groups (when (ldap-group-sync)
                           (or (:memberOf result) (get-user-groups dn) []))]
              {:dn         dn
               :first-name fname
               :last-name  lname
               :email      email
               :groups     groups})))))))

(defn verify-password
  "Verifies if the supplied password is valid for the `user-info` (from `find-user`) or DN."
  ([user-info password]
    (with-connection verify-password user-info password))
  ([conn user-info password]
    (if (string? user-info)
      (ldap/bind? conn user-info password)
      (ldap/bind? conn (:dn user-info) password))))

(defn fetch-or-create-user!
  "Using the `user-info` (from `find-user`) get the corresponding Metabase user, creating it if necessary."
  [{:keys [first-name last-name email groups]} password]
  (let [user (or (db/select-one [User :id :last_login] :email email)
                 (user/create-new-ldap-auth-user! {:first_name first-name
                                                   :last_name  last-name
                                                   :email      email
                                                   :password   password}))]
    (u/prog1 user
      (when password
        (user/set-password! (:id user) password))
      (when (ldap-group-sync)
        (let [special-ids #{(:id (group/admin)) (:id (group/all-users))}
              current-ids (set (map :group_id (db/select ['PermissionsGroupMembership :group_id] :user_id (:id user))))
              ldap-ids    (when-let [ids (seq (ldap-groups->mb-group-ids groups))]
                            (set (map :id (db/select [PermissionsGroup :id] :id [:in ids]))))
              to-remove   (set/difference current-ids ldap-ids special-ids)
              to-add      (set/difference ldap-ids current-ids)]
          (when (seq to-remove)
            (db/delete! 'PermissionsGroupMembership :group_id [:in to-remove], :user_id (:id user)))
          (doseq [id to-add]
            (db/insert! 'PermissionsGroupMembership :group_id id, :user_id (:id user))))))))
