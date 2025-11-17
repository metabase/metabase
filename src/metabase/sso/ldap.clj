(ns metabase.sso.ldap
  (:require
   [clj-ldap.client :as ldap]
   [diehard.core :as dh]
   [metabase.settings.core :as setting]
   [metabase.sso.ldap.default-implementation :as default-impl]
   [metabase.sso.settings :as sso.settings]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (com.unboundid.ldap.sdk LDAPConnectionPool LDAPException)))

(set! *warn-on-reflection* true)

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
  (details->ldap-options {:host      (sso.settings/ldap-host)
                          :port      (sso.settings/ldap-port)
                          :bind-dn   (sso.settings/ldap-bind-dn)
                          :password  (sso.settings/ldap-password)
                          :security  (sso.settings/ldap-security)}))

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
     (dh/with-timeout {:timeout-ms (int (* 1000 (sso.settings/ldap-timeout-seconds)))
                       :interrupt? true}
       (ldap/bind? conn dn password)))))

(defn ldap-settings
  "A map of all ldap settings"
  []
  {:first-name-attribute (sso.settings/ldap-attribute-firstname)
   :last-name-attribute  (sso.settings/ldap-attribute-lastname)
   :email-attribute      (sso.settings/ldap-attribute-email)
   :sync-groups?         (sso.settings/ldap-group-sync)
   :user-base            (sso.settings/ldap-user-base)
   :user-filter          (sso.settings/ldap-user-filter)
   :group-base           (sso.settings/ldap-group-base)
   :group-mappings       (sso.settings/ldap-group-mappings)})

(mu/defn find-user :- [:maybe default-impl/UserInfo]
  "Get user information for the supplied username."
  ([username :- ms/NonBlankString]
   (with-ldap-connection [conn]
     (find-user conn username)))

  ([ldap-connection :- (ms/InstanceOfClass LDAPConnectionPool)
    username        :- ms/NonBlankString]
   (dh/with-timeout {:timeout-ms (int (* 1000 (sso.settings/ldap-timeout-seconds)))
                     :interrupt? true}
     (default-impl/find-user ldap-connection username (ldap-settings)))))

(defn humanize-error-messages
  "Convert raw error message responses from our LDAP tests into our normal api error response structure."
  [{:keys [status message]}]
  (when (not= :SUCCESS status)
    (log/warn "Problem connecting to LDAP server:" message)
    (let [conn-error     {:errors {:ldap-host "Wrong host or port"
                                   :ldap-port "Wrong host or port"}}
          security-error {:errors {:ldap-port     "Wrong port or security setting"
                                   :ldap-security "Wrong port or security setting"}}
          bind-dn-error  {:errors {:ldap-bind-dn "Wrong bind DN"}}
          creds-error    {:errors {:ldap-bind-dn  "Wrong bind DN or password"
                                   :ldap-password "Wrong bind DN or password"}}]
      (condp re-matches message
        #".*UnknownHostException.*"
        conn-error

        #".*ConnectException.*"
        conn-error

        #".*SocketException.*"
        security-error

        #".*SSLException.*"
        security-error

        #"^For input string.*"
        {:errors {:ldap-host "Invalid hostname, do not add the 'ldap://' or 'ldaps://' prefix"}}

        #".*password was incorrect.*"
        {:errors {:ldap-password "Password was incorrect"}}

        #"^Unable to bind as user.*"
        bind-dn-error

        #"^Unable to parse bind DN.*"
        {:errors {:ldap-bind-dn "Invalid bind DN"}}

        #".*AcceptSecurityContext error, data 525,.*"
        bind-dn-error

        #".*AcceptSecurityContext error, data 52e,.*"
        creds-error

        #".*AcceptSecurityContext error, data 532,.*"
        {:errors {:ldap-password "Password is expired"}}

        #".*AcceptSecurityContext error, data 533,.*"
        {:errors {:ldap-bind-dn "Account is disabled"}}

        #".*AcceptSecurityContext error, data 701,.*"
        {:errors {:ldap-bind-dn "Account is expired"}}

        #"^User search base does not exist .*"
        {:errors {:ldap-user-base "User search base does not exist or is unreadable"}}

        #"^Group search base does not exist .*"
        {:errors {:ldap-group-base "Group search base does not exist or is unreadable"}}

        ;; everything else :(
        #"(?s).*"
        {:message message}))))
