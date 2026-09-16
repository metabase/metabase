(ns metabase.mcp-client.oauth
  "OAuth 2.1 for MCP servers that require it, as the MCP authorization spec lays it out: find the authorization
  server through the server's protected resource metadata, register a client, send the user through a PKCE
  authorization request that names the MCP server as the `resource`, then exchange and refresh tokens.

  Nothing is persisted; the caller keeps the registration and tokens. [[authorize!]] runs the whole flow for a
  developer at the REPL with a loopback redirect, and [[authorized-client]] turns the outcome into a client whose
  requests carry the token."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.mcp-client.client :as client]
   [metabase.mcp-client.transport :as transport]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [ring.adapter.jetty :as jetty]
   [ring.util.codec :as codec])
  (:import
   (java.net URI)
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest SecureRandom)
   (java.util Base64)
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(defn- oauth-ex
  [step message data]
  (ex-info message (merge {:type :mcp-client/oauth-error :step step} data)))

;;; ------------------------------------------------- HTTP plumbing -------------------------------------------------

(defn- request!
  "An HTTP request under the client's network policy and timeouts. JSON bodies come back decoded under `:json`."
  [{:keys [network-policy timeout-ms connection-timeout-ms]} {:keys [url] :as req}]
  (let [resp (http/request (merge {:throw-exceptions   false
                                   :socket-timeout     timeout-ms
                                   :connection-timeout connection-timeout-ms}
                                  req
                                  {:headers (merge {"Accept" "application/json"} (:headers req))}
                                  (transport/request-opts url network-policy)))
        body (:body resp)]
    (assoc resp :json (when (and (string? body)
                                 (not (str/blank? body))
                                 (str/starts-with? (or (get-in resp [:headers "content-type"]) "") "application/json"))
                        (try (json/decode+kw body) (catch Exception _ nil))))))

(defn- get-json
  "The decoded JSON document at `url`, or nil when it is not there."
  [client url]
  (let [{:keys [status json]} (request! client {:method :get :url url})]
    (when (and (= 200 status) (map? json))
      json)))

(defn- origin
  [url]
  (let [uri (URI. (str url))]
    (str (.getScheme uri) "://" (.getHost uri) (when (pos? (.getPort uri)) (str ":" (.getPort uri))))))

;;; -------------------------------------------------- Discovery --------------------------------------------------

(defn parse-www-authenticate
  "The parameters of a `Bearer` challenge, keyed by name, or nil when `header` is not one."
  [header]
  (when (and (string? header) (re-find #"(?i)^\s*Bearer(\s|$)" header))
    (into {}
          (for [[_ k quoted bare] (re-seq #"([\w-]+)=(?:\"([^\"]*)\"|([^,\s]+))" header)]
            [(keyword k) (or quoted bare)]))))

(defn challenge
  "What the MCP server answers when asked without credentials: the parsed `WWW-Authenticate` challenge of its 401
  (an empty map when it sent none), or nil when the server does not require authorization at all."
  [client]
  (try
    (client/discover client)
    nil
    (catch clojure.lang.ExceptionInfo e
      (let [{:keys [status www-authenticate]} (ex-data e)]
        (if (= 401 status)
          (or (parse-www-authenticate www-authenticate) {})
          (throw e))))))

(defn- resource-metadata-urls
  "Where RFC 9728 says to look for the metadata of the MCP server at `url` when the challenge did not say."
  [url]
  (let [uri  (URI. (str url))
        path (.getPath uri)
        root (origin url)]
    (cond-> []
      (not (str/blank? (str/replace path #"/+$" ""))) (conj (str root "/.well-known/oauth-protected-resource" path))
      true                                            (conj (str root "/.well-known/oauth-protected-resource")))))

(defn protected-resource-metadata
  "The MCP server's protected resource metadata (RFC 9728), located through the `resource_metadata` parameter of
  `challenge` or the well-known URLs. It must describe a resource at the server's own origin."
  [{:keys [url] :as client} challenge]
  (let [urls     (if-let [given (:resource_metadata challenge)] [given] (resource-metadata-urls url))
        metadata (some #(get-json client %) urls)]
    (when-not metadata
      (throw (oauth-ex :discovery (tru "MCP server {0} does not publish protected resource metadata" url)
                       {:url url :tried urls})))
    (when-not (= (origin (:resource metadata)) (origin url))
      (throw (oauth-ex :discovery (tru "Protected resource metadata for {0} describes a different server: {1}" url (:resource metadata))
                       {:url url :resource (:resource metadata)})))
    (when-not (seq (:authorization_servers metadata))
      (throw (oauth-ex :discovery (tru "Protected resource metadata for {0} names no authorization server" url)
                       {:url url})))
    metadata))

(defn- authorization-server-metadata-urls
  "Where RFC 8414 and OpenID Connect Discovery say to look for `issuer`'s metadata, in the order MCP prescribes."
  [issuer]
  (let [issuer (str/replace (str issuer) #"/+$" "")
        root   (origin issuer)
        path   (.getPath (URI. issuer))]
    (if (str/blank? path)
      [(str root "/.well-known/oauth-authorization-server")
       (str root "/.well-known/openid-configuration")]
      [(str root "/.well-known/oauth-authorization-server" path)
       (str root "/.well-known/openid-configuration" path)
       (str root path "/.well-known/openid-configuration")])))

(defn authorization-server-metadata
  "The metadata of the authorization server `issuer`. A document whose `issuer` differs from the one it was fetched
  for is an attack, not a server, and is rejected."
  [client issuer]
  (let [urls     (authorization-server-metadata-urls issuer)
        metadata (some #(get-json client %) urls)]
    (when-not metadata
      (throw (oauth-ex :discovery (tru "Authorization server {0} publishes no metadata" issuer)
                       {:issuer issuer :tried urls})))
    (when-not (= (str/replace (str (:issuer metadata)) #"/+$" "") (str/replace (str issuer) #"/+$" ""))
      (throw (oauth-ex :discovery (tru "Authorization server metadata at {0} claims a different issuer: {1}" issuer (:issuer metadata))
                       {:issuer issuer :claimed (:issuer metadata)})))
    (doseq [endpoint [:authorization_endpoint :token_endpoint]]
      (when-not (string? (endpoint metadata))
        (throw (oauth-ex :discovery (tru "Authorization server {0} metadata has no {1}" issuer (name endpoint))
                         {:issuer issuer}))))
    metadata))

(defn discover
  "Everything needed to start authorizing against the client's MCP server:

  - `:challenge` the parsed 401 challenge
  - `:resource-metadata` and `:authorization-server` the two metadata documents, keys as on the wire
  - `:resource` the canonical URI of the MCP server to bind tokens to (RFC 8707)
  - `:scopes` the scopes to ask for: the challenge's, else the resource's `scopes_supported`

  Returns nil when the server does not require authorization."
  [client]
  (when-let [challenge (challenge client)]
    (let [resource-metadata    (protected-resource-metadata client challenge)
          authorization-server (authorization-server-metadata client (first (:authorization_servers resource-metadata)))]
      {:challenge            challenge
       :resource-metadata    resource-metadata
       :authorization-server authorization-server
       :resource             (or (:resource resource-metadata) (str/replace (:url client) #"/+$" ""))
       :scopes               (or (some-> (:scope challenge) (str/split #"\s+") vec)
                                 (some-> (:scopes_supported resource-metadata) vec))})))

;;; ------------------------------------------------- Registration -------------------------------------------------

(defn- loopback-uri?
  [uri]
  (contains? #{"localhost" "127.0.0.1" "[::1]"} (.getHost (URI. (str uri)))))

(defn register-client!
  "Register with the authorization server through Dynamic Client Registration (RFC 7591) and return the server's
  client information, `:client_id` included. `:client-name` defaults to the client's own name."
  [client authorization-server {:keys [redirect-uris client-name]}]
  (let [endpoint (:registration_endpoint authorization-server)]
    (when-not endpoint
      (throw (oauth-ex :registration (tru "Authorization server {0} does not support dynamic client registration" (:issuer authorization-server))
                       {:issuer (:issuer authorization-server)})))
    (let [{:keys [status json body]}
          (request! client {:method  :post
                            :url     endpoint
                            :headers {"Content-Type" "application/json"}
                            :body    (json/encode {:client_name                (or client-name (get-in client [:client-info :name]))
                                                   :redirect_uris              redirect-uris
                                                   :grant_types                ["authorization_code" "refresh_token"]
                                                   :response_types             ["code"]
                                                   :token_endpoint_auth_method "none"
                                                   :application_type           (if (every? loopback-uri? redirect-uris) "native" "web")})})]
      (if (and (contains? #{200 201} status) (string? (:client_id json)))
        json
        (throw (oauth-ex :registration (tru "Client registration with {0} failed with HTTP status {1}" endpoint status)
                         {:status status :body body}))))))

;;; ------------------------------------------------ Authorization ------------------------------------------------

(defn- random-url-safe
  ^String [n]
  (let [bytes (byte-array n)]
    (.nextBytes (SecureRandom.) bytes)
    (.encodeToString (.withoutPadding (Base64/getUrlEncoder)) bytes)))

(defn- s256
  ^String [^String verifier]
  (.encodeToString (.withoutPadding (Base64/getUrlEncoder))
                   (.digest (MessageDigest/getInstance "SHA-256") (.getBytes verifier StandardCharsets/US_ASCII))))

(defn- form-encode
  [params]
  (codec/form-encode (into {} (map (fn [[k v]] [(name k) (str v)])) params)))

(defn authorization-request
  "The URL to send the user to, and the `:pending` state to keep until they come back: the PKCE verifier, the
  `state` to compare, and the issuer to validate an `iss` response parameter against."
  [authorization-server {:keys [client-id redirect-uri scopes resource]}]
  (when-not (some #{"S256"} (:code_challenge_methods_supported authorization-server))
    (throw (oauth-ex :authorization (tru "Authorization server {0} does not support PKCE with S256" (:issuer authorization-server))
                     {:issuer (:issuer authorization-server)})))
  (let [verifier (random-url-safe 32)
        state    (random-url-safe 16)
        endpoint (:authorization_endpoint authorization-server)
        params   (cond-> {:response_type         "code"
                          :client_id             client-id
                          :redirect_uri          redirect-uri
                          :code_challenge        (s256 verifier)
                          :code_challenge_method "S256"
                          :state                 state
                          :resource              resource}
                   (seq scopes) (assoc :scope (str/join " " scopes)))]
    {:url     (str endpoint (if (str/includes? endpoint "?") "&" "?") (form-encode params))
     :pending {:code-verifier verifier
               :state         state
               :issuer        (:issuer authorization-server)
               :client-id     client-id
               :redirect-uri  redirect-uri
               :resource      resource
               :scopes        scopes}}))

(defn- with-expiry
  [tokens]
  (cond-> tokens
    (number? (:expires_in tokens)) (assoc :expires-at (t/plus (t/instant) (t/seconds (long (:expires_in tokens)))))))

(defn- token-request!
  [client authorization-server registration params]
  (let [{:keys [status json body]}
        (request! client {:method      :post
                          :url         (:token_endpoint authorization-server)
                          :form-params (cond-> (assoc params :client_id (:client_id registration))
                                         (:client_secret registration) (assoc :client_secret (:client_secret registration)))})]
    (if (and (= 200 status) (string? (:access_token json)))
      (with-expiry json)
      (throw (oauth-ex :token (tru "Token request to {0} failed with HTTP status {1}" (:token_endpoint authorization-server) status)
                       {:status status :body body :error (:error json) :error-description (:error_description json)})))))

(defn exchange-code!
  "Validate the authorization response `params` (`code`, `state`, and `iss` or `error`) the user came back with and
  exchange the code for tokens. Returns the token response with an added `:expires-at`."
  [client authorization-server registration pending {:keys [code state iss error error_description]}]
  (let [issuer (:issuer pending)]
    ;; RFC 9207: a response from the wrong issuer is not to be acted on, not even its error message
    (when (and iss (not= iss issuer))
      (throw (oauth-ex :authorization (tru "Authorization response came from {0}, not {1}" iss issuer) {:iss iss :issuer issuer})))
    (when (and (nil? iss) (true? (:authorization_response_iss_parameter_supported authorization-server)))
      (throw (oauth-ex :authorization (tru "Authorization response is missing the iss parameter {0} promised" issuer) {:issuer issuer})))
    (when error
      (throw (oauth-ex :authorization (tru "Authorization was refused: {0}" (or error_description error))
                       {:error error :error-description error_description})))
    (when (not= state (:state pending))
      (throw (oauth-ex :authorization (tru "Authorization response state does not match the request") {})))
    (when (str/blank? code)
      (throw (oauth-ex :authorization (tru "Authorization response carries no code") {})))
    (token-request! client authorization-server registration
                    {:grant_type    "authorization_code"
                     :code          code
                     :redirect_uri  (:redirect-uri pending)
                     :code_verifier (:code-verifier pending)
                     :resource      (:resource pending)})))

(defn refresh!
  "Fresh tokens for `tokens`' refresh token. A server that issues no new refresh token keeps the old one valid."
  [client authorization-server registration {:keys [refresh_token resource]}]
  (when-not refresh_token
    (throw (oauth-ex :token (tru "No refresh token to refresh with") {})))
  (let [fresh (token-request! client authorization-server registration
                              (cond-> {:grant_type "refresh_token" :refresh_token refresh_token}
                                resource (assoc :resource resource)))]
    (merge {:refresh_token refresh_token :resource resource} fresh)))

(defn- expiring?
  [{:keys [expires-at]}]
  (and expires-at (t/before? expires-at (t/plus (t/instant) (t/seconds 30)))))

(defn bearer-headers
  "A headers function for [[metabase.mcp-client.client/client]]: sends the access token in `tokens-atom` and
  refreshes it through the authorization server when it is about to expire."
  [client authorization-server registration tokens-atom]
  (fn []
    (locking tokens-atom
      (when (and (expiring? @tokens-atom) (:refresh_token @tokens-atom))
        (log/debugf "Refreshing MCP access token for %s" (:url client))
        (reset! tokens-atom (refresh! client authorization-server registration @tokens-atom))))
    {"Authorization" (str "Bearer " (:access_token @tokens-atom))}))

;;; ------------------------------------------------ Loopback flow ------------------------------------------------

(defn- callback-page
  [{:keys [error]}]
  {:status  200
   :headers {"Content-Type" "text/html; charset=utf-8"}
   :body    (if error
              "<!doctype html><title>Authorization failed</title><p>Authorization failed. You can close this tab.</p>"
              "<!doctype html><title>Authorized</title><p>Authorization complete. You can close this tab and return to Metabase.</p>")})

(defn- start-callback-listener!
  "A loopback HTTP server that captures the first authorization response it receives into `:response`."
  [port]
  (let [response (promise)
        handler  (fn [req]
                   (let [params (into {} (map (fn [[k v]] [(keyword k) (if (coll? v) (first v) v)]))
                                      (codec/form-decode (or (:query-string req) "")))]
                     (deliver response params)
                     (callback-page params)))
        ^Server server (jetty/run-jetty handler {:port (or port 0) :join? false :host "127.0.0.1"})]
    {:server   server
     :port     (.. server getURI getPort)
     :response response}))

(defn- print-authorization-url
  [url]
  (log/infof "Open this URL in a browser to authorize Metabase: %s" url))

(defn authorize!
  "Authorize `client` interactively: discover, register, hand the authorization URL to `on-url` (default: print
  it), wait for the user's browser to land on the loopback redirect, and exchange the code. Returns
  `{:authorization-server :registration :resource :scopes :tokens}` for [[authorized-client]].

  Options: `:port` for the loopback listener (default: any free port), `:scopes` to override the discovered
  ones, `:timeout-ms` to wait for the user (default 5 minutes), `:on-url` to receive the URL (default: log it)."
  ([client]
   (authorize! client nil))
  ([client {:keys [port scopes timeout-ms on-url] :or {timeout-ms 300000 on-url print-authorization-url}}]
   (let [{:keys [authorization-server resource] :as discovered}
         (or (discover client)
             (throw (oauth-ex :discovery (tru "MCP server {0} does not require authorization" (:url client)) {:url (:url client)})))
         listener     (start-callback-listener! port)
         redirect-uri (str "http://localhost:" (:port listener) "/callback")]
     (try
       (let [scopes                (or scopes (:scopes discovered))
             registration          (register-client! client authorization-server {:redirect-uris [redirect-uri]})
             {:keys [url pending]} (authorization-request authorization-server {:client-id    (:client_id registration)
                                                                                :redirect-uri redirect-uri
                                                                                :scopes       scopes
                                                                                :resource     resource})]
         (on-url url)
         (let [params (deref (:response listener) timeout-ms ::timeout)]
           (when (= ::timeout params)
             (throw (oauth-ex :authorization (tru "Timed out waiting for the user to authorize") {:timeout-ms timeout-ms})))
           {:authorization-server authorization-server
            :registration         registration
            :resource             resource
            :scopes               scopes
            :tokens               (exchange-code! client authorization-server registration pending params)}))
       (finally
         (.stop ^Server (:server listener)))))))

(defn authorized-client
  "A client for the same server as `client` whose requests carry, and refresh, the tokens from [[authorize!]]."
  [client {:keys [authorization-server registration tokens]}]
  (client/client (assoc (select-keys client [:url :client-info :timeout-ms :connection-timeout-ms :network-policy])
                        :headers (bearer-headers client authorization-server registration (atom tokens)))))

(comment
  ;; Notion's hosted server accepts OAuth only
  (def notion (client/client {:url "https://mcp.notion.com/mcp"}))
  (def auth (authorize! notion))            ; logs the URL to open; approve in a browser
  (def c (authorized-client notion auth))
  (client/discover c)
  (map :name (client/all-tools c))
  (client/call-tool c "notion-search" {:query "roadmap"}))
