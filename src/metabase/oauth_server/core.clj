(ns metabase.oauth-server.core
  (:require
   [clojure.string :as str]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.oauth-server.store :as store]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [oidc-provider.core :as oidc]
   [oidc-provider.protocol :as proto]
   [oidc-provider.token :as oidc.token]))

(set! *warn-on-reflection* true)

(defonce ^:private provider (atom nil))

(defn all-agent-scopes
  "All supported OAuth scopes derived from defendpoint metadata on the agent API."
  []
  (into []
        (comp (keep #(get-in % [:form :metadata :scope]))
              (filter string?)
              (distinct))
        (vals (api.macros/ns-routes 'metabase.agent-api.api))))

(defn- build-provider-config
  "Build the configuration map for the OAuth provider from Metabase settings."
  []
  (let [base-url (system/site-url)]
    {:issuer                         base-url
     :authorization-endpoint         (str base-url "/oauth/authorize")
     :token-endpoint                 (str base-url "/oauth/token")
     :registration-endpoint          (str base-url "/oauth/register")
     :revocation-endpoint            (str base-url "/oauth/revoke")
     :access-token-ttl-seconds       (oauth-settings/oauth-server-access-token-ttl)
     :authorization-code-ttl-seconds (oauth-settings/oauth-server-authorization-code-ttl)
     :refresh-token-ttl-seconds      (oauth-settings/oauth-server-refresh-token-ttl)
     :client-store                   (store/create-client-store)
     :code-store                     (store/create-authorization-code-store)
     :token-store                    (store/create-token-store)
     :scopes-supported               (into (all-agent-scopes)
                                           (map :scope (api-scope/all-scopes)))
     :rotate-refresh-tokens          true}))

(defn- create-provider
  "Create a new OAuth provider instance."
  []
  (oidc/create-provider (build-provider-config)))

(defn get-provider
  "Returns the current provider instance, creating it lazily if needed."
  []
  (or @provider
      (swap! provider (fn [p] (or p (create-provider))))))

(defn reset-provider!
  "Reset the provider atom to nil. Useful for testing."
  []
  (reset! provider nil))

(defn extract-bearer-token
  "Extract the bearer token from the Authorization header of a Ring request."
  [request]
  (when-let [auth (get-in request [:headers "authorization"])]
    (when (str/starts-with? (u/lower-case-en auth) "bearer ")
      (str/trim (subs auth 7)))))

(defn validate-bearer-token
  "Look up and validate an OAuth bearer token. Returns `{:user-id <int> :scopes <set> :resource <vec>}`
   on success, nil on failure."
  [token-string]
  (when-let [provider (get-provider)]
    (when-let [token-data (proto/get-access-token (:token-store provider) token-string)]
      (let [expiry (:expiry token-data)]
        (when (or (nil? expiry)
                  (> expiry (System/currentTimeMillis)))
          (let [user-id (some-> (:user-id token-data) parse-long)
                scopes  (when-let [scope-vec (:scope token-data)]
                          (into #{} scope-vec))]
            (when user-id
              (cond-> {:user-id  user-id
                       :scopes   (or scopes #{})}
                (:resource token-data) (assoc :resource (:resource token-data))))))))))

(defn mint-tokens!
  "Directly mint an access token and refresh token for the given user/client/scopes/resource.
   Returns `{:access-token <string> :refresh-token <string> :expires-in <seconds>}`.
   The returned tokens are plaintext; the store hashes them before persistence."
  [user-id client-id scopes resource]
  (let [provider         (get-provider)
        access-ttl       (or (get-in provider [:provider-config :access-token-ttl-seconds]) 3600)
        refresh-ttl      (or (get-in provider [:provider-config :refresh-token-ttl-seconds]) 2592000)
        now-ms           (System/currentTimeMillis)
        access-expiry    (+ now-ms (* access-ttl 1000))
        refresh-expiry   (+ now-ms (* refresh-ttl 1000))
        access-token     (oidc.token/generate-access-token)
        refresh-token    (oidc.token/generate-refresh-token)
        scope-vec        (vec scopes)
        resource-vec     (vec resource)]
    (proto/save-access-token (:token-store provider)
                             access-token (str user-id) client-id scope-vec access-expiry resource-vec)
    (proto/save-refresh-token (:token-store provider)
                              refresh-token (str user-id) client-id scope-vec refresh-expiry resource-vec)
    {:access-token  access-token
     :refresh-token refresh-token
     :expires-in    access-ttl}))
