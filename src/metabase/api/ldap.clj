(ns metabase.api.ldap
  "/api/ldap endpoints"
  (:require
   [clojure.set :as set]
   [compojure.core :refer [PUT]]
   [metabase.api.common :as api]
   [metabase.integrations.ldap :as ldap]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- humanize-error-messages
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
                                        (humanize-error-messages result))))))
                  (setting/set-value-of-type! :boolean :ldap-enabled new-value)))
  :default    false)

(defn- update-password-if-needed
  "Do not update password if `new-password` is an obfuscated value of the current password."
  [new-password]
  (let [current-password (setting/get :ldap-password)]
    (if (= (setting/obfuscate-value current-password) new-password)
      current-password
      new-password)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/settings"
  "Update LDAP related settings. You must be a superuser or have `setting` permission to do this."
  [:as {settings :body}]
  {settings su/Map}
  (api/check-superuser)
  (let [ldap-settings (-> settings
                          (select-keys (keys ldap/mb-settings->ldap-details))
                          (assoc :ldap-port (when-let [^String ldap-port (not-empty (str (:ldap-port settings)))]
                                              (Long/parseLong ldap-port)))
                          (update :ldap-password update-password-if-needed))
        ldap-details  (set/rename-keys ldap-settings ldap/mb-settings->ldap-details)
        results       (ldap/test-ldap-connection ldap-details)]
    (if (= :SUCCESS (:status results))
      (t2/with-transaction [_conn]
       (setting/set-many! ldap-settings)
       (setting/set-value-of-type! :boolean :ldap-enabled (boolean (:ldap-enabled settings))))
      ;; test failed, return result message
      {:status 500
       :body   (humanize-error-messages results)})))

(api/define-routes)
