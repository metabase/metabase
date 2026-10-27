(ns metabase.server.middleware.session
  "Ring middleware related to session and API-key based authentication (binding current user and permissions).

  How do authenticated API requests work? There are two main paths to authentication: a session or an API key.

  For session authentication, Metabase looks for a cookie called `metabase.SESSION`. This is the normal way of
  doing things; this cookie gets set automatically upon login. `metabase.SESSION` is an HttpOnly cookie and thus can't
  be viewed by FE code. If the session is a full-app embedded session, then the cookie is `metabase.EMBEDDED_SESSION`
  instead.

  If present, the `X-Metabase-Session` header is used for authentication instead of cookies - the `metabase.SESSION` and
  `metabase.EMBEDDED_SESSION` cookies are ignored in this case.

  The second main path to authentication is an API key. For this, we look at the `X-Api-Key` header. If that matches
  an ApiKey in our database, you'll be authenticated as that ApiKey's associated User."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [java-time.api :as t]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.api-keys.core :as api-key]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.api.macros.scope :as scope]
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.request.schema :as request.schema]
   [metabase.server.db :as server.db]
   [metabase.session.core :as session]
   [metabase.settings.core :as setting]
   [metabase.system.core :as system]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.http :as u.http]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [metabase.util.string :as string]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                wrap-session-key                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^String metabase-session-header "x-metabase-session")

(defmulti ^:private wrap-session-key-with-strategy
  "Attempt to add `:metabase-session-key` to `request` based on a specific strategy. Return modified request if
  successful or `nil` if we should try another strategy."
  {:arglists '([strategy request])}
  (fn [strategy _]
    strategy))

(defmethod wrap-session-key-with-strategy :embedded-cookie
  [_ {:keys [cookies headers], :as request}]
  (when-let [session (get-in cookies [request/metabase-embedded-session-cookie :value])]
    (when-let [anti-csrf-token (get headers request/anti-csrf-token-header)]
      (assoc request :metabase-session-key session, :anti-csrf-token anti-csrf-token :metabase-session-type :full-app-embed))))

(defmethod wrap-session-key-with-strategy :normal-cookie
  [_ {:keys [cookies], :as request}]
  (when-let [session (get-in cookies [request/metabase-session-cookie :value])]
    (when (seq session)
      (assoc request :metabase-session-key session :metabase-session-type :normal))))

(defmethod wrap-session-key-with-strategy :header
  [_ {:keys [headers], :as request}]
  (when-let [session (get headers metabase-session-header)]
    (when (seq session)
      (assoc request :metabase-session-key session))))

(defmethod wrap-session-key-with-strategy :best
  [_ request]
  (some
   (fn [strategy]
     (wrap-session-key-with-strategy strategy request))
   [:header :embedded-cookie :normal-cookie]))

(defn- session-cookie-values
  "The values of the `metabase.SESSION` cookies in the request's `Cookie` header, or nil when it has none."
  [request]
  (some->> (request/cookie-header-entries request)
           (into [] (keep (fn [[cookie-name value]]
                            (when (= request/metabase-session-cookie cookie-name)
                              value))))))

(def ^:private max-stray-session-cookie-deletions-bytes
  ;; A proxy refuses a response whose headers outgrow its buffer: nginx's default `proxy_buffer_size` is 4 KB, and an
  ;; API response's other headers take about 2 KB of it.
  1536)

(defn- cookie-domains
  "The domains a cookie that reaches `hosts` can be set for: each host and its parent domains, without top-level
  domains and IP addresses."
  [hosts]
  (distinct (for [host  hosts
                  :when (not (u.http/ip-literal? host))
                  :let  [labels (str/split host #"\.")]
                  n     (range (dec (count labels)))]
              (str/join "." (drop n labels)))))

(defn- cookie-paths
  "The paths of the cookies a request for `uri` carries, shallowest first: each prefix of `uri`, with and without a
  trailing slash, also under `site-path`, which a proxy removes before the request reaches Metabase."
  [uri site-path]
  (let [prefixes (->> (str/split (or uri "/") #"/")
                      (remove str/blank?)
                      (reductions #(str %1 "/" %2) ""))]
    (distinct (for [prefix prefixes
                    base   (distinct ["" site-path])
                    path   [(str base prefix) (str base prefix "/")]]
                (if (= "" path) "/" path)))))

(defn- take-within-bytes
  "The first of `set-cookie-values` whose header lines fit in `max-bytes`."
  [max-bytes set-cookie-values]
  (let [line-bytes #(+ (count "Set-Cookie: \r\n") (count %))]
    (map first (take-while (fn [[_ total]] (<= total max-bytes))
                           (map vector set-cookie-values (reductions + (map line-bytes set-cookie-values)))))))

(defn- expired-stray-session-cookies
  "`Set-Cookie` values that delete the `metabase.SESSION` cookies this request could carry other than the browser's
  own, which is host-only at `/`: one set with a `Domain` (by another host of the same site, for this host or the
  site URL's host, `Partitioned` too on HTTPS) or at a deeper path. Shallow paths come first, and the values stop at
  [[max-stray-session-cookie-deletions-bytes]]: a cookie at a deeper path reaches fewer requests."
  [{:keys [uri] :as request}]
  (let [domains (cookie-domains (concat (request/host-names request)
                                        (some-> (system/site-url) u.http/host-name list)))
        https?  (#{:https :unknown} (request/https-state request))]
    (take-within-bytes
     max-stray-session-cookie-deletions-bytes
     (for [path       (cookie-paths uri (system/site-path))
           attributes (concat (for [domain      domains
                                    partitioned (if https? ["" "Secure; Partitioned; "] [""])]
                                (format "Domain=%s; Path=%s; %s" domain path partitioned))
                              (when-not (= "/" path)
                                [(format "Path=%s; " path)]))]
       (str request/metabase-session-cookie "=; " attributes "Max-Age=0")))))

(defn- add-set-cookies [response cookies]
  (let [existing (get-in response [:headers "Set-Cookie"])]
    (assoc-in response [:headers "Set-Cookie"]
              (vec (concat (if (string? existing) [existing] existing) cookies)))))

(defn- with-session-cookie-from-header
  "`request` whose `:cookies` hold the `metabase.SESSION` cookie of its `Cookie` header when the header carries exactly
  one, and none when it carries none or several. Without a header, `:cookies` is left as it is."
  [request values]
  (cond-> request
    values (update :cookies #(if (= 1 (count values))
                               (assoc % request/metabase-session-cookie {:value (first values)})
                               (dissoc % request/metabase-session-cookie)))))

(defn wrap-session-key
  "Middleware that sets the `:metabase-session-key` keyword on the request if a session id can be found: from the
  `X-METABASE-SESSION` header, else from the `metabase.SESSION` cookie. If neither is found then no keyword is bound to
  the request.

  A request with more than one `metabase.SESSION` cookie gets no session from that cookie: another host of the same
  site can set one for this host, and the server could not tell it from the user's. The response deletes the extra
  ones."
  [handler]
  (fn [request respond raise]
    (let [values   (session-cookie-values request)
          request' (with-session-cookie-from-header request values)
          respond' (if (< 1 (count values))
                     (comp respond #(cond-> % (map? %) (add-set-cookies (expired-stray-session-cookies request))))
                     respond)]
      (handler (or (wrap-session-key-with-strategy :best request') request') respond' raise))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             wrap-current-user-info                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- valid-session-key?
  "Validates that the given session-key looks like a session key (a UUID string). Session keys are only ever compared
  against `core_session.key_hashed`; this check short-circuits obviously-invalid values before we hash them."
  [session-key]
  (or (not session-key) (string/valid-uuid? session-key)))

(mu/defn- current-user-info-for-session :- [:maybe [:merge
                                                    ::request.schema/current-user-info
                                                    [:map {:closed true}
                                                     [:metabase/authed-session-key-hash :string]]]]
  "Return User ID and superuser status for Session with `session-key` if it is valid and not expired, plus
  `:metabase/authed-session-key-hash`, the `key_hashed` value the row was matched on."
  [session-key     :- [:maybe :string]
   anti-csrf-token :- [:maybe :string]]
  (when (and session-key (valid-session-key? session-key) (init-status/complete?))
    (let [session-key-hash (session/hash-session-key session-key)]
      (when-let [{:keys [auth-provider] :as user-info}
                 (server.db/session-user-info session-key-hash
                                              anti-csrf-token
                                              (config/config-int :max-session-age)
                                              (premium-features/enable-advanced-permissions?)
                                              (and (premium-features/enable-tenants?)
                                                   (setting/get :use-tenants))
                                              (request/enabled-session-timeout-seconds)
                                              (session/mfa-required?))]
        (-> user-info
            (dissoc :auth-provider)
            ;; is-group-manager? could return `nil, convert it to boolean so it's guaranteed to be only true/false
            (update :is-group-manager? boolean)
            (assoc :metabase/authed-session-key-hash session-key-hash
                   :embedding/auth-method            (or auth-provider "session")))))))

(def ^:private api-key-that-should-never-match (str (random-uuid)))
(def ^:private hash-that-should-never-match (u.password/hash-bcrypt "password"))

(defn do-useless-hash
  "Password check that will always fail, used to avoid exposing any info about existing users or API keys via timing
  attacks."
  []
  (u.password/verify-password api-key-that-should-never-match "" hash-that-should-never-match))

(defn- matching-api-key?
  "Whether `passed-api-key` matches the hash stored in `user-data`. The stored bcrypt hash is encrypted at rest and this
  path reads the raw column (bypassing the model's decrypting transform), so it is decrypted before the bcrypt compare;
  a value that is not valid ciphertext — e.g. a plaintext hash injected via direct SQL — decrypts to nil and is
  rejected rather than trusted. With no usable hash we still compute a useless hash so the two cases can't be told apart
  by timing."
  [{:keys [api-key] :as _user-data} passed-api-key]
  (if-let [stored-hash (when api-key
                         (u/ignore-exceptions (encryption/maybe-decrypt api-key)))]
    (u.password/verify-password passed-api-key "" stored-hash)
    (do-useless-hash)))

(mu/defn- current-user-info-for-api-key :- [:maybe ::request.schema/current-user-info]
  "Return User ID and superuser status for an API Key with `api-key-id"
  [api-key :- [:maybe :string]]
  (when (and api-key
             (init-status/complete?))
    ;; make sure the API key is valid before we entertain the idea of allowing it.
    (if-let [error (some-> (mr/explain ::api-keys.schema/key.raw api-key)
                           me/humanize
                           pr-str)]
      (do
        ;; 99% sure the error message is not going to include the API key but just to be extra super safe let's not log
        ;; it if the error message includes the key itself.
        (if (str/includes? error api-key)
          (log/error "Ignoring invalid API Key")
          (log/errorf "Ignoring invalid API Key: %s" error))
        nil)
      (let [user-info (-> (server.db/api-key-user-info (api-key/prefix api-key)
                                                       (premium-features/enable-advanced-permissions?))
                          (m/update-existing :is-group-manager? boolean))]
        (when (matching-api-key? user-info api-key)
          (-> user-info
              (dissoc :api-key)
              (assoc :embedding/auth-method "api-key")))))))

(mr/def ::oauth-bearer
  "Fns that authenticate a request by its OAuth bearer token, the scope that grants full access, the scopes that make
  a token an MCP token, and the request paths where a bearer token is the only credential accepted."
  [:map
   {:closed true}
   [:extract-token     ifn?]
   [:resolve-token     ifn?]
   [:full-access-scope ms/NonBlankString]
   [:mcp-scopes        [:set ms/NonBlankString]]
   [:bearer-only-paths [:set [:re #"^/"]]]])

(defn- bearer-only-path?
  "Whether request `path` is one of `bearer-only-paths` or below one. Compares paths, never a host, and follows segment
  boundaries, so `/api/mcpfoo` is not below `/api/mcp`."
  [bearer-only-paths path]
  (boolean (and path
                (some #(or (= path %) (str/starts-with? path (str % "/")))
                      bearer-only-paths))))

(mr/def ::mcp-ui-credentials
  "Fns that authenticate a request by the credential an MCP App UI carries."
  [:map
   {:closed true}
   [:on-surface?        ifn?]
   [:resolve-credential ifn?]
   [:scope-satisfied?   ifn?]])

(def ^:private full-access-token-scopes
  "The `:token-scopes` value that grants a bearer-authenticated request access to the general
   REST API as its user. The `::scope/unrestricted` keyword sentinel (not the `\"*\"` string)
   is the only thing that lets a scoped token through endpoints that declare no `:scope` (see
   [[metabase.api.macros.scope/ensure-scopes-checked]])."
  #{::scope/unrestricted})

(defn- oauth-token->token-scopes
  "Map the OAuth scopes granted to a bearer access token onto the `:token-scopes` value the API scope middleware
  understands.

  Rules, in this order:
  1. A token holding any of `mcp-scopes` is an MCP token and keeps only those.
  2. A full-access scope is replaced by the unrestricted sentinel.
  3. Anything else is unchanged."
  [full-access-scope mcp-scopes granted-scopes]
  (cond
    (some mcp-scopes granted-scopes)
    (set/intersection granted-scopes mcp-scopes)

    (contains? granted-scopes full-access-scope)
    (into full-access-token-scopes (disj granted-scopes full-access-scope))

    :else
    granted-scopes))

(mu/defn- current-user-info-for-oauth-token :- [:maybe ::request.schema/current-user-info]
  "Return current-user-info for a valid OAuth bearer access token on `request`, or nil. Mirrors the
   shape returned by the session/api-key resolvers and additionally attaches `:token-scopes`, so the
   merged request carries both the user identity and the access the token was granted, and marks it
   `:authenticated-via-oauth?`. A token with no scopes does not authenticate. This is the only place an
   OAuth access token authenticates a request to the general (`/api/*`) API."
  [{:keys [extract-token resolve-token full-access-scope mcp-scopes]} :- [:maybe ::oauth-bearer]
   request                                                           :- ::request.schema/request]
  (when (and extract-token (init-status/complete?))
    (when-let [token (extract-token request)]
      (when-let [{:keys [user-id scopes]} (resolve-token token)]
        ;; Downstream, nil `:token-scopes` passes as scope-unaware auth, so a scope-less token is refused here.
        (when (seq scopes)
          (some-> (server.db/oauth-user-info user-id (premium-features/enable-advanced-permissions?))
                  (m/update-existing :is-group-manager? boolean)
                  (assoc :token-scopes             (oauth-token->token-scopes full-access-scope mcp-scopes scopes)
                         :authenticated-via-oauth? true
                         :embedding/auth-method "oauth")))))))

(defn- current-user-info-for-mcp-ui-credential
  "Resolve the short-lived credential from an MCP App tool result.

   Two gates, both owned by [[metabase.mcp.ui-surface/request-surface]]. The first decides whether the
   credential authenticates this route at all; a route off the surface is not authenticated, and the request
   falls through as anonymous. The second decides whether the scopes the minting MCP session actually held —
   carried on the credential as a signed claim — cover what the route costs.

   `::scope/mcp-ui`, NOT `::scope/unrestricted`: the surface decides which routes the credential may pass
   through, and it must not also decide what privilege it arrives with. Stamped unrestricted, a credential
   that reached anything off the surface arrived with full session privilege. `::mcp-ui` satisfies no
   endpoint's declared `:scope`.

   `:token-scopes-checked` is what lets those routes serve the credential at all: they declare no `:scope` of
   their own, and annotating them would push MCP vocabulary into `session` and `query-processor`. It is set
   only when the second gate passes, so a route added to the surface without a scope decision, or reached by
   a routing change, is refused by `ensure-scopes-checked` rather than served.

   Both keys are needed, and the stamp is the easy one to mistake for decoration now that the gate computes
   the decision on its own: `ensure-scopes-checked` passes anything whose `:token-scopes` is nil. Drop the
   stamp and an unsatisfied route is served rather than refused. `dataset-routes-cost-the-query-scope-test`
   is what catches that."
  [{:keys [on-surface? resolve-credential scope-satisfied?]} request]
  (when (and on-surface?
             (init-status/complete?)
             (on-surface? (:request-method request) (:uri request)))
    (when-let [{:keys [uid sid] :as claims}
               (resolve-credential (get-in request [:headers "x-metabase-mcp-ui-auth"]))]
      (some-> (server.db/oauth-user-info uid (premium-features/enable-advanced-permissions?))
              (m/update-existing :is-group-manager? boolean)
              (assoc :token-scopes #{::scope/mcp-ui}
                     :token-scopes-checked (scope-satisfied? (:request-method request) (:uri request) claims)
                     :mcp-ui-session-id sid
                     :mcp-ui-credential claims
                     :embedding/auth-method "mcp-ui")))))

(defn- credentials
  "The user info from the first credential on `request` that authenticates: session, then API key, then OAuth bearer
  token, then MCP UI credential."
  [{:keys [oauth-bearer mcp-ui-credentials]}
   {:keys [metabase-session-key anti-csrf-token], {:strs [x-api-key]} :headers, :as request}]
  (or (current-user-info-for-session metabase-session-key anti-csrf-token)
      (current-user-info-for-api-key x-api-key)
      ;; bearer tokens below also carry `:token-scopes`
      (current-user-info-for-oauth-token oauth-bearer request)
      (current-user-info-for-mcp-ui-credential mcp-ui-credentials request)))

(defn- merge-current-user-info
  [{:keys [oauth-bearer] :as options} {:keys [uri], {:strs [x-metabase-locale]} :headers, :as request}]
  (merge
   request
   (if (bearer-only-path? (:bearer-only-paths oauth-bearer) uri)
     (current-user-info-for-oauth-token oauth-bearer request)
     (credentials options request))
   (when x-metabase-locale
     (log/tracef "Found X-Metabase-Locale header: using %s as user locale" (pr-str x-metabase-locale))
     {:user-locale (i18n/normalized-locale-string x-metabase-locale)})))

(defn wrap-current-user-info
  "Add `:metabase-user-id`, `:is-superuser?`, `:is-group-manager?` and `:user-locale` to the request if a valid session
  token, API key, OAuth bearer access token, OR MCP UI credential was passed. A bearer token additionally sets
  `:token-scopes` (the access it was granted); precedence is session > API key > bearer > MCP UI credential.
  Bearer tokens and MCP UI credentials authenticate only when `options` supplies their `:oauth-bearer` and
  `:mcp-ui-credentials` fns. On a path in `:bearer-only-paths`, or below one, only a bearer token authenticates.

  `:metabase/authed-session-key-hash` is set only when it was the session that authenticated the request, and carries
  the `key_hashed` value of the one that did."
  ([handler]
   (wrap-current-user-info handler nil))
  ([handler options]
   (fn [request respond raise]
     (let [request' (tracing/with-span :db-app "db-app.session-lookup" {}
                      (merge-current-user-info options request))]
       (analytics/with-auth-method! (:embedding/auth-method request')
         (handler request' respond raise))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               bind-current-user                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmacro ^:private with-current-user-for-request
  [request & body]
  `(request/do-with-current-user ~request (fn [] ~@body)))

(defn bind-current-user
  "Middleware that binds [[metabase.api.common/*current-user*]], [[*current-user-id*]], [[*is-superuser?*]],
  [[*current-user-permissions-set*]], and [[metabase.settings.models.setting/*user-local-values*]].

  *  `*current-user-id*`                int ID or nil of user associated with request
  *  `*current-user*`                   delay that returns current user (or nil) from DB
  *  `metabase.util.i18n/*user-locale*` ISO locale code e.g `en` or `en-US` to use for the current User.
                                        Overrides `site-locale` if set.
  *  `*is-superuser?*`                  Boolean stating whether current user is a superuser.
  *  `*is-group-manager?*`              Boolean stating whether current user is a group manager of at least one group.
  *  `*current-user-permissions-set*`   delay that returns the set of permissions granted to the current user from DB
  *  `*user-local-values*`              atom containing a map of user-local settings and values for the current user"
  [handler]
  (fn [request respond raise]
    (with-current-user-for-request request
      (handler request respond raise))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         session activity tracking                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- maybe-update-session-activity!
  "Update the `last_active_at` column for the session whose `key_hashed` is `session-key-hash`, throttled to avoid a
   DB write on every request."
  [session-key-hash]
  (when (session/record-session-activity-update! session-key-hash)
    (try
      (server.db/touch-session! session-key-hash)
      (catch Exception e
        (log/warnf "Failed to update session last_active_at: %s" (ex-message e))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              reset-cookie-timeout                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn reset-session-timeout*
  "Implementation for `reset-cookie-timeout` respond handler."
  [request response request-time]
  (if (and
       ;; Only reset the timeout if the request includes a session cookie.
       (:metabase-session-type request)
       ;; Do not reset the timeout if it is being updated in the response, e.g. if it is being deleted
       (not (contains? (:cookies response) request/metabase-session-timeout-cookie)))
    (request/set-session-timeout-cookie response request (:metabase-session-type request) request-time)
    response))

(defn reset-session-timeout
  "Middleware that records session activity on every session-authenticated request, and additionally resets the expiry
   date on session cookies when the session-timeout setting is set. The cookie is left alone if that setting is nil or
   the timeout cookie has already expired."
  [handler]
  (fn [request respond raise]
    (let [;; The expiry time for the cookie is relative to the time the request is received, rather than the time of the
          ;; response.
          request-time (t/zoned-date-time (t/zone-id "GMT"))]
      (handler request
               (fn [response]
                 (when-let [session-key-hash (:metabase/authed-session-key-hash request)]
                   (maybe-update-session-activity! session-key-hash))
                 (respond (reset-session-timeout* request response request-time)))
               raise))))
