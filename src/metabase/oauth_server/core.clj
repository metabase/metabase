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
   plus scopes from MCP UI resources (e.g. visualize_query) and the v2 tool registry."
  []
  (mcp/all-scopes))

(defn supported-scopes
  "All OAuth scopes advertised in the server's discovery metadata (`scopes-supported`):
   the agent/MCP scopes plus the opt-in MCP scopes (e.g. `agent:snippets:read`).

   `mb:full` is deliberately absent. Advertising it here put a full-access grant in front of every
   client that reads discovery metadata, and clients that request everything advertised would have
   been rejected for it anyway — it is not in [[default-grant-scopes]], and a client may only
   request scopes it registered with. A first-party client that needs it still registers with it
   explicitly; registration does not consult this list."
  []
  (into (vec (all-agent-scopes)) (mcp/opt-in-scopes)))

(defn protected-resource-scopes
  "The scopes advertised in the MCP resource's RFC 9728 protected-resource metadata: the agent/MCP
   scopes plus the opt-in MCP scopes (e.g. `agent:snippets:read`), so a client discovering scopes
   via the resource doc can still learn about and request them. `mb:full` is intentionally omitted
   — it is a first-party full-access scope, not specific to the MCP resource — and GHY-4226 removed
   it from [[supported-scopes]] too, so it is now advertised nowhere.

   Identical to [[supported-scopes]] today, deliberately: they answer different questions (what this
   resource accepts vs. what the authorization server knows about) and are free to diverge again."
  []
  (into (vec (all-agent-scopes)) (mcp/opt-in-scopes)))

(defn mcp-resource-scopes
  "The scopes advertised for the MCP resource specifically. RFC 9728 metadata answers \"what does
   *this* resource accept\", and the MCP surface accepts exactly the scopes its tool registry gates
   on — the rationalized five — plus the resource scopes its UI tools render through.

   [[protected-resource-scopes]] is deliberately wider: it also carries every scope declared by an
   agent-API endpoint, because those resources do accept them. Advertising that union for MCP is
   what makes a client's consent screen list per-entity scopes the MCP tools never use."
  []
  (into (vec (mcp/v2-scopes)) (mcp/opt-in-scopes)))

(defn default-grant-scopes
  "The scope set a dynamically-registered client is registered with when it sends no `scope` of its
   own (RFC 7591 makes the parameter optional, and the major MCP clients omit it).

   This is a *ceiling*, not a grant: a client may later request any subset of it, and the token
   carries only what was requested and consented to. Because it is a ceiling it must cover
   everything any surface advertises — a client derives what to ask for from discovery metadata,
   never from what it registered with, so a scope we advertise but do not register is one the
   authorization request is rejected for outright. Hence the union of every advertised set rather
   than a hand-maintained list.

   Narrowing this does not produce least privilege, it produces failed authorizations. The levers
   that shrink an issued token are what each resource advertises, [[narrow-scope-to-resource]], and
   the consent screen."
  []
  ;; sorted so the `scope` echoed back in the registration response is stable across restarts
  (-> (sorted-set)
      (into (supported-scopes))
      (into (protected-resource-scopes))
      (into (mcp-resource-scopes))))

(def ^:private scheme-default-port
  {"http" 80, "https" 443})

(defn- canonical-resource-uri
  "Canonical form of a resource identifier, for comparing indicators that clients spell differently.

   Lowercases scheme and host, elides the scheme's default port, and trims a trailing slash. Query
   and fragment are dropped: the canonical form has neither, and ignoring them can only cause
   narrowing, never widening. Returns nil for anything that is not an absolute URI, which then
   matches nothing.

   Per RFC 3986 the scheme and host are case-insensitive and the default port is elidable; the path
   is neither, so `/API/v2` deliberately does not canonicalize to `/api/v2`."
  [s]
  (when s
    (try
      (let [^java.net.URI uri (java.net.URI. (str s))
            scheme            (some-> (.getScheme uri) u/lower-case-en)
            host              (some-> (.getHost uri) u/lower-case-en)
            port              (.getPort uri)
            path              (or (.getPath uri) "")]
        (when (and scheme host)
          (str scheme "://" host
               (when-not (or (neg? port) (= port (scheme-default-port scheme)))
                 (str ":" port))
               (cond-> path
                 (and (> (count path) 1) (str/ends-with? path "/"))
                 (subs 0 (dec (count path)))))))
      (catch java.net.URISyntaxException _ nil))))

(defn narrow-scope-to-resource
  "Narrow an OAuth `scope` string to what the requested `resources` accept.

   `resources` are RFC 8707 resource indicators from the authorization request. When one names the
   MCP resource — compared as [[canonical-resource-uri]], since clients disagree on trailing
   slashes, case, and default ports — scopes that surface does not accept are dropped, so the
   consent screen asks for what the token can actually be used for rather than everything the
   client registered. Returns the scope unchanged when no indicator names a resource we narrow for,
   and nil when nothing survives (callers should drop the parameter entirely rather than send an
   empty one).

   Every alias in [[metabase.mcp.core/mcp-endpoint-paths]] counts, not just the canonical one: a
   client that connected through an alias was handed that path as its resource identifier, and
   narrowing has to recognize what it was told to send back.

   Only ever removes scopes, and runs after the provider has validated the request, so it can never
   turn a valid authorization into a rejected one.

   `mb:full` does not survive. The MCP resource metadata never advertised it, and a client naming
   the MCP resource is asking for a token to use against that surface — which accepts none of the
   REST API that scope unlocks. A first-party client that genuinely wants full access should not be
   naming the MCP resource. Note this only reaches clients that send a resource indicator: one
   that omits it is not narrowed at all, so a register-time rule is still the only way to keep
   `mb:full` off a dynamically-registered client entirely."
  [resources scope]
  (let [scope (some-> scope str str/trim not-empty)]
    (if-not (and scope
                 (some (into #{} (keep canonical-resource-uri) resources)
                       (keep #(canonical-resource-uri (str (system/site-url) %))
                             (mcp/mcp-endpoint-paths))))
      scope
      (let [accepted (set (mcp-resource-scopes))]
        (not-empty (str/join " " (filter accepted (str/split scope #"\s+"))))))))

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
