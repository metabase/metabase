(ns metabase.oauth-server.core
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.agent-api.api :as agent-api]
   [metabase.api-scope.core :as api-scope]
   [metabase.mcp.core :as mcp]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.oauth-server.scopes :as scopes]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.oauth-server.store :as store]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [oidc-provider.core :as oidc]
   [oidc-provider.protocol :as oidc.proto]
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

(defn supported-scopes
  "All OAuth scopes intended to be advertised in the server's discovery metadata (`scopes-supported`)."
  []
  (-> (sorted-set)
      (into (mcp/v2-scopes))
      (into (agent-api/defendpoint-scopes))
      (disj "mb:full") ;; mb:full should not appear so clients don't find it; they can still register with it (e.g., CLI)
      vec))

(defn all-scopes-registered?
  "True when every scope in the space-delimited `scope` string is registered via
  [[metabase.api-scope.core/defscope]]. A nil or blank `scope` names none, so it is true."
  [scope]
  (every? api-scope/registered-scope? (api-scope/parse-scopes scope)))

(defn registered-scopes-only
  "The space-delimited `scope` string with every scope that is not registered via
  [[metabase.api-scope.core/defscope]] removed, keeping the requested order, or nil when none remain."
  [scope]
  (some->> (str/split (str scope) #"\s+")
           (filter api-scope/registered-scope?)
           seq
           (str/join " ")))

(defn- widen-to-grant-ceiling
  "`client` with the scopes it lacks from `mcp-scopes` appended to its `:scopes` when it is dynamically registered,
   and those it lacks from `ceiling` too while `registration-enabled?`. Any other `client`, nil included, is returned
   unchanged."
  [client registration-enabled? mcp-scopes ceiling]
  (cond-> client
    (= "dynamic" (:registration-type client))
    (update :scopes (fn [scopes]
                      (into (vec scopes)
                            (comp (remove (set scopes)) (distinct))
                            (cond-> mcp-scopes registration-enabled? (concat ceiling)))))))

(defn- with-default-grant-ceiling
  "Wrap `client-store` so that reading a client applies [[widen-to-grant-ceiling]] with the MCP surface's scopes,
   [[supported-scopes]], and the dynamic-registration setting. Writes pass through unchanged."
  [client-store]
  ;; A registration `scope` can only widen what a client may later request, never narrow it: MCP clients register with
  ;; the narrow scope they start from and then step up on the same `client_id`, which a per-client snapshot would
  ;; refuse. Applied on read, so a client registered before a scope existed can still request it. Every read sees the
  ;; widened `:scopes`, including the RFC 7592 client read (`GET /oauth/register/:client-id`).
  ;;
  ;; The MCP scopes are added whatever the *registration* setting says: turning registration off blocks new clients, but
  ;; a client that registered with the baseline must still be able to step up, or its `/authorize` is a bare 400. Each
  ;; scope still needs the user's consent. The rest of the ceiling -- the agent-API extras -- is added only while
  ;; registration is enabled, so an admin who turned it off leaves existing clients without those.
  ;;
  ;; The MCP kill switch stops the MCP part of the widening: with MCP off, no surface serves those scopes.
  (reify oidc.proto/ClientStore
    (get-client [_ client-id]
      (widen-to-grant-ceiling (oidc.proto/get-client client-store client-id)
                              (oauth-settings/oauth-server-dynamic-registration-enabled)
                              (when (mcp/mcp-enabled?) (mcp/v2-scopes))
                              (supported-scopes)))
    (register-client [_ client-config]
      (oidc.proto/register-client client-store client-config))
    (update-client [_ client-id updated-config]
      (oidc.proto/update-client client-store client-id updated-config))))

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
     :client-store                   (with-default-grant-ceiling (store/create-client-store))
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
   expired, or revoked token, a token with no associated user, or a token whose user has since
   been deactivated).

   The `is_active` gate here is defense in depth, not the primary control: deactivating a user through
   the model fires `:event/user-credentials-revoked`, and `metabase.oauth-server.events.revoke-on-deactivation`
   stamps `revoked_at` on every token, which the store lookup above already filters on. This gate covers
   the paths that don't go through the model hook — a direct SQL or migration update of `core_user`, a
   restored backup — and keeps the invariant local to the one resolver every bearer caller shares (the
   v1 MCP transport dispatches straight on the returned `:user-id` with no re-check of its own). It costs
   one indexed primary-key lookup per bearer request.

   This is the single token-resolution lookup shared by the MCP transport and the core
   session middleware's bearer-token bridge — keep it the only place an access token is
   turned into a user identity + scope set."
  [token-string]
  (when (seq token-string)
    (when-let [provider (get-provider)]
      (when-let [token-data (oidc.store/get-access-token (:token-store provider) token-string)]
        (let [expiry (:expiry token-data)]
          (when (and (or (nil? expiry)
                         (t/after? (t/instant expiry) (t/instant)))
                     ;; Fail closed if the issuing client is gone (SEC-863).
                     (oauth-server.db/oauth-client-exists? (:client-id token-data)))
            (when-let [user-id (some-> (:user-id token-data) parse-long)]
              (when (oauth-server.db/active-user-exists? user-id)
                {:user-id user-id
                 :scopes  (or (some->> (:scope token-data) (into #{})) #{})}))))))))
