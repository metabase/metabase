(ns metabase.sso.settings
  (:require
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.sso.ldap :as ldap]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]))

(defn humanize-ldap-error-messages
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

(defsetting ldap-enabled
  (deferred-tru "Is LDAP currently enabled?")
  :type       :boolean
  :visibility :public
  :setter     (fn [new-value]
                (let [new-value (boolean new-value)]
                  (when new-value
                    ;; Test the LDAP settings before enabling
                    (let [result (ldap/test-current-ldap-details)]
                      (when-not (= :SUCCESS (:status result))
                        (throw (ex-info (tru "Unable to connect to LDAP server with current settings")
                                        (humanize-ldap-error-messages result))))))
                  (setting/set-value-of-type! :boolean :ldap-enabled new-value)))
  :default    false
  :audit      :getter)
