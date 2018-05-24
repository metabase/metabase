(ns metabase.api.ldap
  "/api/ldap endpoints"
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [compojure.core :refer [PUT]]
            [metabase.api.common :refer :all]
            [metabase.integrations.ldap :as ldap]
            [metabase.models.setting :as setting]
            [metabase.util.schema :as su]))

(def ^:private ^:const mb-settings->ldap-details
  {:ldap-enabled             :enabled
   :ldap-host                :host
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

(defendpoint PUT "/settings"
  "Update LDAP related settings. You must be a superuser to do this."
  [:as {settings :body}]
  {settings su/Map}
  (check-superuser)
  (let [ldap-settings (select-keys settings (keys mb-settings->ldap-details))
        ldap-details  (-> (set/rename-keys ldap-settings mb-settings->ldap-details)
                          (assoc :port
                            (when (seq (:ldap-port settings))
                              (Integer/parseInt (:ldap-port settings)))))
        results       (if-not (:ldap-enabled settings)
                        ;; when disabled just respond with a success message
                        {:status :SUCCESS}
                        ;; otherwise validate settings
                        (ldap/test-ldap-connection ldap-details))]
    (if (= :SUCCESS (:status results))
      ;; test succeeded, save our settings
      (setting/set-many! ldap-settings)
      ;; test failed, return result message
      {:status 500
       :body   (humanize-error-messages results)})))


(define-routes)
