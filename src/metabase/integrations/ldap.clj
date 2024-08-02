(ns metabase.integrations.ldap
  (:require
   [cheshire.core :as json]
   [clj-ldap.client :as ldap]
   [metabase.config :as config]
   [metabase.integrations.ldap.default-implementation :as default-impl]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.user :refer [User]]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (com.unboundid.ldap.sdk DN LDAPConnectionPool LDAPException)))

(set! *warn-on-reflection* true)

;; Load the EE namespace up front so that the extra Settings it defines are available immediately.
;; Otherwise, this would only happen the first time `find-user` or `fetch-or-create-user!` is called.
(when config/ee-available?
  (classloader/require 'metabase-enterprise.enhancements.integrations.ldap))

(defsetting ldap-host
  (deferred-tru "Server hostname.")
  :audit :getter)

(defsetting ldap-port
  (deferred-tru "Server port, usually 389 or 636 if SSL is used.")
  :type    :integer
  :default 389
  :audit   :getter)

(defsetting ldap-security
  (deferred-tru "Use SSL, TLS or plain text.")
  :type    :keyword
  :default :none
  :audit   :raw-value
  :setter  (fn [new-value]
             (when (some? new-value)
               (assert (#{:none :ssl :starttls} (keyword new-value))))
             (setting/set-value-of-type! :keyword :ldap-security new-value)))

(defsetting ldap-bind-dn
  (deferred-tru "The Distinguished Name to bind as (if any), this user will be used to lookup information about other users.")
  :audit :getter)

(defsetting ldap-password
  (deferred-tru "The password to bind with for the lookup user.")
  :sensitive? true
  :audit     :getter)

(defsetting ldap-user-base
  (deferred-tru "Search base for users. (Will be searched recursively)")
  :audit :getter)

(defsetting ldap-user-filter
  (deferred-tru "User lookup filter. The placeholder '{login'} will be replaced by the user supplied login.")
  :default "(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))"
  :audit   :getter)

(defsetting ldap-attribute-email
  (deferred-tru "Attribute to use for the user''s email. (usually ''mail'', ''email'' or ''userPrincipalName'')")
  :default "mail"
  :getter  (fn [] (u/lower-case-en (setting/get-value-of-type :string :ldap-attribute-email)))
  :audit   :getter)

(defsetting ldap-attribute-firstname
  (deferred-tru "Attribute to use for the user''s first name. (usually ''givenName'')")
  :default "givenName"
  :getter  (fn [] (u/lower-case-en (setting/get-value-of-type :string :ldap-attribute-firstname)))
  :audit   :getter)

(defsetting ldap-attribute-lastname
  (deferred-tru "Attribute to use for the user''s last name. (usually ''sn'')")
  :default "sn"
  :getter  (fn [] (u/lower-case-en (setting/get-value-of-type :string :ldap-attribute-lastname)))
  :audit   :getter)

(defsetting ldap-group-sync
  (deferred-tru "Enable group membership synchronization with LDAP.")
  :type    :boolean
  :default false
  :audit   :getter)

(defsetting ldap-group-base
  (deferred-tru "Search base for groups. Not required for LDAP directories that provide a ''memberOf'' overlay, such as Active Directory. (Will be searched recursively)")
  :audit   :getter)

(defsetting ldap-group-mappings
  ;; Should be in the form: {"cn=Some Group,dc=...": [1, 2, 3]} where keys are LDAP group DNs and values are lists of
  ;; MB groups IDs
  (deferred-tru "JSON containing LDAP to Metabase group mappings.")
  :type    :json
  :cache?  false
  :default {}
  :audit   :getter
  :getter  (fn []
             (json/parse-string (setting/get-value-of-type :string :ldap-group-mappings) #(DN. (str %))))
  :setter  (fn [new-value]
             (cond
               (string? new-value)
               (recur (json/parse-string new-value))

               (map? new-value)
               (do (doseq [k (keys new-value)]
                     (when-not (DN/isValidDN (u/qualified-name k))
                       (throw (IllegalArgumentException. (tru "{0} is not a valid DN." (u/qualified-name k))))))
                   (setting/set-value-of-type! :json :ldap-group-mappings new-value)))))

(defsetting ldap-configured?
  (deferred-tru "Have the mandatory LDAP settings (host and user search base) been validated and saved?")
  :type       :boolean
  :visibility :public
  :setter     :none
  :getter     (fn [] (boolean (and (ldap-host)
                                   (ldap-user-base))))
  :doc        false)

(def mb-settings->ldap-details
  "Mappings from Metabase setting names to keys to use for LDAP connections"
  {:ldap-host                :host
   :ldap-port                :port
   :ldap-bind-dn             :bind-dn
   :ldap-password            :password
   :ldap-security            :security
   :ldap-user-base           :user-base
   :ldap-user-filter         :user-filter
   :ldap-attribute-email     :attribute-email
   :ldap-attribute-firstname :attribute-firstname
   :ldap-attribute-lastname  :attribute-lastname
   :ldap-group-sync          :group-sync
   :ldap-group-base          :group-base})

(defn- details->ldap-options [{:keys [host port bind-dn password security]}]
  (let [security (keyword security)
        port     (if (string? port)
                   (Integer/parseInt port)
                   port)]
    ;; Connecting via IPv6 requires us to use this form for :host, otherwise
    ;; clj-ldap will find the first : and treat it as an IPv4 and port number
    {:host      {:address host
                 :port    port}
     :bind-dn   bind-dn
     :password  password
     :ssl?      (= security :ssl)
     :startTLS? (= security :starttls)}))

(defn- settings->ldap-options []
  (details->ldap-options {:host      (ldap-host)
                          :port      (ldap-port)
                          :bind-dn   (ldap-bind-dn)
                          :password  (ldap-password)
                          :security  (ldap-security)}))

(defn- get-connection
  "Connects to LDAP with the currently set settings and returns the connection."
  ^LDAPConnectionPool
  []
  (let [options (settings->ldap-options)]
    (log/debugf "Opening LDAP connection with options %s" (u/pprint-to-str options))
    (try
      (ldap/connect options)
      (catch LDAPException e
        (log/errorf "Failed to obtain LDAP connection: %s" (.getMessage e))
        (throw e)))))

(defn do-with-ldap-connection
  "Impl for [[with-ldap-connection]] macro."
  [f]
  (with-open [conn (get-connection)]
    (f conn)))

(defmacro with-ldap-connection
  "Execute `body` with `connection-binding` bound to a LDAP connection."
  [[connection-binding] & body]
  `(do-with-ldap-connection (fn [~(vary-meta connection-binding assoc :tag `LDAPConnectionPool)]
                              ~@body)))

;; TODO -- the usage of `:ERROR` and `:STATUS` like this is weird. Just do something like {::error nil} for success and
;; {::error exception} for an error
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
         (catch Exception _e
           user-base-error))
       (when group-base
         (try
           (when-not (ldap/get conn group-base)
             group-base-error)
           (catch Exception _e
             group-base-error)))
       (log/debug "LDAP connection test successful")
       {:status :SUCCESS}))
    (catch LDAPException e
       (log/debug "LDAP connection test failed: " (.getMessage e))
      {:status :ERROR, :message (.getMessage e), :code (.getResultCode e)})
    (catch Exception e
      (log/debug "LDAP connection test failed: " (.getMessage e))
      {:status :ERROR, :message (.getMessage e)})))

(defn test-current-ldap-details
  "Tests the connection to an LDAP server using the currently set settings."
  []
  (let [settings (into {} (for [[k v] mb-settings->ldap-details]
                            [v (setting/get k)]))]
    (test-ldap-connection settings)))

(defn verify-password
  "Verifies if the supplied password is valid for the `user-info` (from `find-user`) or DN."
  ([user-info password]
   (with-ldap-connection [conn]
     (verify-password conn user-info password)))

  ([conn user-info password]
   (let [dn (if (string? user-info) user-info (:dn user-info))]
     (ldap/bind? conn dn password))))

(defn ldap-settings
  "A map of all ldap settings"
  []
  {:first-name-attribute (ldap-attribute-firstname)
   :last-name-attribute  (ldap-attribute-lastname)
   :email-attribute      (ldap-attribute-email)
   :sync-groups?         (ldap-group-sync)
   :user-base            (ldap-user-base)
   :user-filter          (ldap-user-filter)
   :group-base           (ldap-group-base)
   :group-mappings       (ldap-group-mappings)})

(mu/defn find-user :- [:maybe default-impl/UserInfo]
  "Get user information for the supplied username."
  ([username :- ms/NonBlankString]
   (with-ldap-connection [conn]
     (find-user conn username)))

  ([ldap-connection :- (ms/InstanceOfClass LDAPConnectionPool)
    username        :- ms/NonBlankString]
   (default-impl/find-user ldap-connection username (ldap-settings))))

(mu/defn fetch-or-create-user! :- (ms/InstanceOf User)
  "Using the `user-info` (from [[find-user]]) get the corresponding Metabase user, creating it if necessary."
  [user-info :- default-impl/UserInfo]
  (default-impl/fetch-or-create-user! user-info (ldap-settings)))
