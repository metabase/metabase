(ns metabase.api.ldap
  "/api/ldap endpoints"
  (:require [clojure.tools.logging :as log]
            [clojure.set :as set]
            [compojure.core :refer [PUT]]
            [metabase.api.common :refer :all]
            [metabase.config :as config]
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
   :ldap-base                :base
   :ldap-user-filter         :user-filter
   :ldap-attribute-email     :attribute-email
   :ldap-attribute-firstname :attribute-firstname
   :ldap-attribute-lastname  :attribute-lastname})

(defn- humanize-error-messages
  "Convert raw error message responses from our LDAP tests into our normal api error response structure."
  [{:keys [status message]}]
  (println message)
  (when (not= :SUCCESS status)
    (log/warn "Problem connecting to LDAP server:" message)
    (let [conn-error     {:errors {:ldap-host "Wrong host or port"
                                   :ldap-port "Wrong host or port"}}
          security-error {:errors {:ldap-port     "Wrong port or security setting"
                                   :ldap-security "Wrong port or security setting"}}
          creds-error    {:errors {:ldap-bind-dn  "Wrong bind DN or password"
                                   :ldap-password "Wrong bind DN or password"}}
          base-error     {:errors {:ldap-base "Search base does not exist or is unreadable"}}]
      (condp re-matches message
        #".*UnknownHostException.*"
        conn-error

        #".*ConnectException.*"
        conn-error

        #".*SocketException.*"
        security-error

        #"^80090308:.*"
        creds-error

        #"^Unable to bind as user .*"
        creds-error

        #"(?s)^0000202B:.*"
        base-error

        #"^Search base does not exist .*"
        base-error

        ;; everything else :(
        #"(?s).*"
        {:message "Sorry, something went wrong. Please try again."}))))

(defendpoint PUT "/settings"
  "Update LDAP related settings. You must be a superuser to do this."
  [:as {settings :body}]
  {settings su/Map}
  (check-superuser)
  (let [ldap-settings (select-keys settings (keys mb-settings->ldap-details))
        ldap-details  (-> (set/rename-keys ldap-settings mb-settings->ldap-details)
                          (assoc :port (Integer/parseInt (:ldap-port settings))))
        results       (if (or config/is-test? (not (:ldap-enabled settings)))
                        ;; for unit testing or disabled status just respond with a success message
                        {:status :SUCCESS}
                        ;; in normal conditions, validate connection
                        (ldap/test-ldap-connection ldap-details))]
    (if (= :SUCCESS (:status results))
      ;; test was good, save our settings
      (setting/set-many! ldap-settings)
      ;; test failed, return result message
      {:status 500
       :body   (humanize-error-messages results)})))

(define-routes)
