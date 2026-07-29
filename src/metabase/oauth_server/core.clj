(ns metabase.oauth-server.core
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.mcp.core :as mcp]
   [metabase.oauth-server.scopes :as scopes]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.oauth-server.store :as store]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [oidc-provider.core :as oidc]
   [oidc-provider.store :as oidc.store]))

(set! *warn-on-reflection* true)

(def full-access-scope
  "The OAuth scope string that grants a bearer token full, user-equivalent access to the
   general REST API. The session-middleware bearer bridge maps a token carrying this scope
   onto the unrestricted scope sentinel (see [[metabase.server.middleware.session]])."
  scopes/full-access)

;; Cache holds `{:site-url <string>, :provider <Provider>}`. Every endpoint baked into the provider config is
;; derived from the Site URL (see [[build-provider-config]]), so a changed Site URL must rebuild the provider --
;; otherwise discovery keeps advertising the stale issuer/endpoints (e.g. http:// behind a TLS-terminating proxy
;; after the operator corrects Site URL to https://).
(defonce ^:private provider (atom nil))

(defn all-agent-scopes
  "All agent OAuth scopes derived from defendpoint metadata on the agent API,
   plus scopes from MCP UI resources (e.g. visualize_query). These are the scopes a
   dynamically-registered MCP client is granted by default at registration time."
  []
  (mcp/all-scopes))

(defn supported-scopes
  "All OAuth scopes advertised in the server's discovery metadata (`scopes-supported`):
   the agent/MCP scopes plus the top-level first-party scopes (e.g. `mb:full`). This is a
   superset of [[all-agent-scopes]] — the extra scopes are not part of the default grant a
   client receives at registration, so a client must explicitly request them."
  []
  (conj (vec (all-agent-scopes)) full-access-scope))

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
     ;; OIDC provider requires a vector.
     :scopes-supported               (supported-scopes)
     :rotate-refresh-tokens          true}))

(defn- create-provider
  "Create a new OAuth provider instance."
  []
  (oidc/create-provider (build-provider-config)))

(defn get-provider
  "Returns the current provider instance, (re)creating it when absent or when the Site URL has changed."
  []
  (let [site-url (system/site-url)]
    (:provider
     (swap! provider
            (fn [cached]
              (if (and cached (= (:site-url cached) site-url))
                cached
                {:site-url site-url, :provider (create-provider)}))))))

(defn reset-provider!
  "Reset the provider cache to nil. Useful for testing."
  []
  (reset! provider nil))

(defn extract-bearer-token
  "Extract the bearer token from the Authorization header of a Ring request."
  [request]
  (when-let [auth (get-in request [:headers "authorization"])]
    (when (str/starts-with? (u/lower-case-en auth) "bearer ")
      (str/trim (subs auth 7)))))

(defn resolve-access-token
  "Validate an OAuth bearer access token string against the token store. Returns
   `{:user-id <int> :scopes <set-of-strings>}` on success, or nil on failure (unknown,
   expired, or revoked token, or a token with no associated user).

   This is the single token-resolution lookup shared by the MCP transport and the core
   session middleware's bearer-token bridge — keep it the only place an access token is
   turned into a user identity + scope set."
  [token-string]
  (when (seq token-string)
    (when-let [provider (get-provider)]
      (when-let [token-data (oidc.store/get-access-token (:token-store provider) token-string)]
        (let [expiry (:expiry token-data)]
          (when (or (nil? expiry)
                    (t/after? (t/instant expiry) (t/instant)))
            (when-let [user-id (some-> (:user-id token-data) parse-long)]
              {:user-id user-id
               :scopes  (or (some->> (:scope token-data) (into #{})) #{})})))))))
