(ns metabase.integrations.ldap
  (:require [cheshire.core :as json]
            [clj-ldap.client :as ldap]
            [clojure.tools.logging :as log]
            [metabase.integrations.ldap.default-implementation :as default-impl]
            [metabase.integrations.ldap.interface :as i]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.models.user :refer [User]]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru tru]]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import [com.unboundid.ldap.sdk DN LDAPConnectionPool LDAPException]))

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
  (deferred-tru "User lookup filter. The placeholder '{login}' will be replaced by the user supplied login.")
  :default "(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))")

(defsetting ldap-attribute-email
  (deferred-tru "Attribute to use for the user''s email. (usually ''mail'', ''email'' or ''userPrincipalName'')")
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
  (deferred-tru "Search base for groups. Not required for LDAP directories that provide a ''memberOf'' overlay, such as Active Directory. (Will be searched recursively)"))

(defsetting ldap-group-mappings
  ;; Should be in the form: {"cn=Some Group,dc=...": [1, 2, 3]} where keys are LDAP group DNs and values are lists of
  ;; MB groups IDs
  (deferred-tru "JSON containing LDAP to Metabase group mappings.")
  :type    :json
  :default {}
  :getter  (fn []
             (json/parse-string (setting/get-string :ldap-group-mappings) #(DN. (str %))))
  :setter  (fn [new-value]
             (cond
               (string? new-value)
               (recur (json/parse-string new-value))

               (map? new-value)
               (do (doseq [k (keys new-value)]
                     (when-not (DN/isValidDN (name k))
                       (throw (IllegalArgumentException. (tru "{0} is not a valid DN." (name k))))))
                   (setting/set-json! :ldap-group-mappings new-value)))))

(defsetting ldap-configured?
  "Check if LDAP is enabled and that the mandatory settings are configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :getter     (fn [] (boolean (and (ldap-enabled)
                                   (ldap-host)
                                   (ldap-user-base)))))

(defn- details->ldap-options [{:keys [host port bind-dn password security]}]
  ;; Connecting via IPv6 requires us to use this form for :host, otherwise
  ;; clj-ldap will find the first : and treat it as an IPv4 and port number
  {:host      {:address host
               :port    (if (string? port)
                          (Integer/parseInt port)
                          port)}
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

(defn- do-with-ldap-connection
  "Impl for `with-ldap-connection` macro."
  [f]
  (with-open [conn (get-connection)]
    (f conn)))

(defmacro ^:private with-ldap-connection
  "Execute `body` with `connection-binding` bound to a LDAP connection."
  [[connection-binding] & body]
  `(do-with-ldap-connection (fn [~(vary-meta connection-binding assoc :tag `LDAPConnectionPool)]
                              ~@body)))

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

(defn verify-password
  "Verifies if the supplied password is valid for the `user-info` (from `find-user`) or DN."
  ([user-info password]
   (with-ldap-connection [conn]
     (verify-password conn user-info password)))

  ([conn user-info password]
   (let [dn (if (string? user-info) user-info (:dn user-info))]
     (ldap/bind? conn dn password))))

;; we want the EE implementation namespace to be loaded immediately if present so the extra Settings that it defines
;; are available elsewhere (e.g. so they'll show up in the API endpoints that list Settings)
(def ^:private impl
  ;; if EE impl is present, use it. It implements the strategy pattern and will forward method invocations to the
  ;; default OSS impl if we don't have a valid EE token. Thus the actual EE versions of the methods won't get used
  ;; unless EE code is present *and* we have a valid EE token.
  (u/prog1 (or (u/ignore-exceptions
                 (classloader/require 'metabase-enterprise.enhancements.integrations.ldap)
                 (some-> (resolve 'metabase-enterprise.enhancements.integrations.ldap/ee-strategy-impl) var-get))
               default-impl/impl)
    (log/debugf "LDAP integration set to %s" <>)))

(s/defn ^:private ldap-settings :- i/LDAPSettings
  []
  {:first-name-attribute (ldap-attribute-firstname)
   :last-name-attribute  (ldap-attribute-lastname)
   :email-attribute      (ldap-attribute-email)
   :sync-groups?         (ldap-group-sync)
   :user-base            (ldap-user-base)
   :user-filter          (ldap-user-filter)
   :group-base           (ldap-group-base)
   :group-mappings       (ldap-group-mappings)})

(s/defn find-user :- (s/maybe i/UserInfo)
  "Get user information for the supplied username."
  ([username :- su/NonBlankString]
   (with-ldap-connection [conn]
     (find-user conn username)))

  ([ldap-connection :- LDAPConnectionPool, username :- su/NonBlankString]
   (i/find-user impl ldap-connection username (ldap-settings))))

(s/defn fetch-or-create-user! :- (class User)
  "Using the `user-info` (from `find-user`) get the corresponding Metabase user, creating it if necessary."
  [user-info :- i/UserInfo]
  (i/fetch-or-create-user! impl user-info (ldap-settings)))
