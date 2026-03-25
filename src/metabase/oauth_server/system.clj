(ns metabase.oauth-server.system
  (:require
   [integrant.core :as ig]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.oauth-server.store :as store]
   [metabase.system.core :as system]
   [oidc-provider.core :as oidc]))

(set! *warn-on-reflection* true)

(defn system-config
  "Returns the integrant system config map for the OAuth server."
  []
  {::client-store {}
   ::code-store   {}
   ::token-store  {}
   ::provider     {:client-store (ig/ref ::client-store)
                   :code-store   (ig/ref ::code-store)
                   :token-store  (ig/ref ::token-store)}})

(defmethod ig/init-key ::client-store [_ _]
  (store/->DbClientStore))

(defmethod ig/init-key ::code-store [_ _]
  (store/->DbAuthorizationCodeStore))

(defmethod ig/init-key ::token-store [_ _]
  (store/->DbTokenStore))

(defmethod ig/init-key ::provider [_ {:keys [client-store code-store token-store]}]
  (let [base-url (system/site-url)]
    (oidc/create-provider
     {:issuer                         base-url
      :authorization-endpoint         (str base-url "/oauth/authorize")
      :token-endpoint                 (str base-url "/oauth/token")
      :registration-endpoint          (str base-url "/oauth/register")
      :revocation-endpoint            (str base-url "/oauth/revoke")
      :access-token-ttl-seconds       (oauth-settings/oauth-server-access-token-ttl)
      :authorization-code-ttl-seconds (oauth-settings/oauth-server-authorization-code-ttl)
      :refresh-token-ttl-seconds      (oauth-settings/oauth-server-refresh-token-ttl)
      :client-store                   client-store
      :code-store                     code-store
      :token-store                    token-store
      :scopes-supported               ((requiring-resolve 'metabase.oauth-server.core/all-agent-scopes))})))

(defmethod ig/halt-key! ::provider [_ _]
  nil)

(defonce ^:private system-atom (atom nil))

(defn start!
  "Initialize and start the OAuth server integrant system.
   Safe for concurrent callers — only one system will be created."
  []
  (or @system-atom
      (swap! system-atom (fn [sys] (or sys (ig/init (system-config)))))))

(defn stop!
  "Halt the running OAuth server integrant system."
  []
  (when-let [sys @system-atom]
    (ig/halt! sys)
    (reset! system-atom nil)))

(defn get-provider
  "Returns the provider from the running integrant system, starting it if needed."
  []
  (::provider (start!)))

(defn reset-system!
  "Stop the integrant system so it will be recreated on next access. For use in tests."
  []
  (stop!))
