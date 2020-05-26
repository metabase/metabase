(ns metabase.integrations.ldap
  (:require [cheshire.core :as json]
            [clj-ldap.client :as ldap]
            [clojure.string :as str]
            [metabase.integrations.common :as integrations.common]
            [metabase.models
             [setting :as setting :refer [defsetting]]
             [user :as user :refer [User]]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru tru]]
            [toucan.db :as db])
  (:import [com.unboundid.ldap.sdk DN Filter LDAPConnectionPool LDAPException]))

(def ^:private filter-placeholder
  "{login}")

(defsetting ldap-enabled
  (deferred-tru "Enable LDAP authentication.")
  :type    :boolean
  :default false)

(defsetting ldap-host
  (deferred-tru "Server hostname."))

(defsetting ldap-port
  (deferred-tru "Server port, usually 389 or 636 if SSL is used.")
  :default "389")

(defsetting ldap-security
  (deferred-tru "Use SSL, TLS or plain text.")
  :default "none"
  :setter  (fn [new-value]
             (when-not (nil? new-value)
               (assert (contains? #{"none" "ssl" "starttls"} new-value)))
             (setting/set-string! :ldap-security new-value)))

(defsetting ldap-bind-dn
  (deferred-tru "The Distinguished Name to bind as (if any), this user will be used to lookup information about other users."))

(defsetting ldap-password
  (deferred-tru "The password to bind with for the lookup user.")
  :sensitive? true)

(defsetting ldap-user-base
  (deferred-tru "Search base for users. (Will be searched recursively)"))

(defsetting ldap-user-filter
  (deferred-tru "User lookup filter, the placeholder '{login}' will be replaced by the user supplied login.")
  :default "(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))")

(defsetting ldap-attribute-email
  (deferred-tru "Attribute to use for the user's email. (usually ''mail'', ''email'' or ''userPrincipalName'')")
  :default "mail"
  :getter (fn [] (u/lower-case-en (setting/get-string :ldap-attribute-email))))

(defsetting ldap-attribute-firstname
  (deferred-tru "Attribute to use for the user''s first name. (usually ''givenName'')")
  :default "givenName"
  :getter (fn [] (u/lower-case-en (setting/get-string :ldap-attribute-firstname))))

(defsetting ldap-attribute-lastname
  (deferred-tru "Attribute to use for the user''s last name. (usually ''sn'')")
  :default "sn"
  :getter (fn [] (u/lower-case-en (setting/get-string :ldap-attribute-lastname))))

(defsetting ldap-group-sync
  (deferred-tru "Enable group membership synchronization with LDAP.")
  :type    :boolean
  :default false)

(defsetting ldap-group-base
  (deferred-tru "Search base for groups, not required if your LDAP directory provides a ''memberOf'' overlay. (Will be searched recursively)"))

(defsetting ldap-group-mappings
  ;; Should be in the form: {"cn=Some Group,dc=...": [1, 2, 3]} where keys are LDAP group DNs and values are lists of
  ;; MB groups IDs
  (deferred-tru "JSON containing LDAP to Metabase group mappings.")
  :type    :json
  :default {}
  :getter  (fn []
             (json/parse-string (setting/get-string :ldap-group-mappings) #(DN. (str %))))
  :setter  (fn [new-value]
             (doseq [k (keys new-value)]
               (when-not (DN/isValidDN (name k))
                 (throw (IllegalArgumentException. (tru "{0} is not a valid DN." (name k))))))
             (setting/set-json! :ldap-group-mappings new-value)))

(defsetting ldap-configured?
  "Check if LDAP is enabled and that the mandatory settings are configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :getter     (fn [] (boolean (and (ldap-enabled)
                                   (ldap-host)
                                   (ldap-user-base)))))

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
      (select-keys (map #(DN. (str %)) ldap-groups))
      vals
      flatten
      set))

(defn- get-user-groups
  "Retrieve groups for a supplied DN."
  ([^String dn]
    (with-connection get-user-groups dn))
  ([conn ^String dn]
    (when (ldap-group-base)
      (let [results (ldap/search conn (ldap-group-base) {:scope  :sub
                                                         :filter (Filter/createEqualityFilter "member" dn)})]
        (map :dn results)))))

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

(defn- search [conn, ^String username]
  (first
   (ldap/search
    conn
    (ldap-user-base)
    {:scope      :sub
     :filter     (str/replace (ldap-user-filter) filter-placeholder (Filter/encodeValue username))
     :size-limit 1})))

(defn find-user
  "Gets user information for the supplied username."
  ([username]
   (with-connection find-user username))

  ([conn username]
   (when-let [{:keys [dn], :as result} (u/lower-case-map-keys (search conn username))]
     (let [{fname (keyword (ldap-attribute-firstname))
            lname (keyword (ldap-attribute-lastname))
            email (keyword (ldap-attribute-email))}    result]
       ;; Make sure we got everything as these are all required for new accounts
       (when-not (some empty? [dn fname lname email])
         {:dn         dn
          :first-name fname
          :last-name  lname
          :email      email
          :groups     (when (ldap-group-sync)
                        ;; Active Directory and others (like FreeIPA) will supply a `memberOf` overlay attribute for
                        ;; groups. Otherwise we have to make the inverse query to get them.
                        (or (:memberof result) (get-user-groups dn) []))})))))

(defn verify-password
  "Verifies if the supplied password is valid for the `user-info` (from `find-user`) or DN."
  ([user-info password]
   (with-connection verify-password user-info password))

  ([conn user-info password]
   (let [dn (if (string? user-info) user-info (:dn user-info))]
     (ldap/bind? conn dn password))))

(defn fetch-or-create-user!
  "Using the `user-info` (from `find-user`) get the corresponding Metabase user, creating it if necessary."
  [{:keys [first-name last-name email groups]}]
  (let [user (or (db/select-one [User :id :last_login] :email email)
                 (user/create-new-ldap-auth-user!
                  {:first_name first-name
                   :last_name  last-name
                   :email      email}))]
    (u/prog1 user
      (when (ldap-group-sync)
        (let [group-ids (ldap-groups->mb-group-ids groups)]
          (integrations.common/sync-group-memberships! user group-ids))))))
