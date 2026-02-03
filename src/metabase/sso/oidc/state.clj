(ns metabase.sso.oidc.state
  "Encrypted cookie-based state management for OIDC authentication flows.

   Provides secure storage of OIDC state (CSRF token), nonce (ID token validation),
   redirect URL, and provider identification in a single encrypted cookie.

   Security features:
   - AES256-CBC-HMAC-SHA512 encryption using MB_ENCRYPTION_SECRET_KEY
   - Built-in TTL validation (independent of cookie expiry)
   - Optional browser binding for request forgery protection
   - Tamper-evident via HMAC validation
   - Redirect URL validation to prevent open redirect attacks"
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [ring.util.response :as response])
  (:import
   (java.net URI URISyntaxException)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Constants --------------------------------------------------

(def ^:private oidc-state-cookie-name
  "Name of the encrypted OIDC state cookie."
  "metabase.OIDC_STATE")

(def ^:private default-ttl-ms
  "Default time-to-live for OIDC state in milliseconds (10 minutes)."
  600000)

;;; -------------------------------------------------- Redirect URL Validation --------------------------------------------------

(defn- parse-uri
  "Parse a string as a URI, returning nil if invalid."
  ^URI [^String s]
  (when (and s (not (str/blank? s)))
    (try
      (URI. s)
      (catch URISyntaxException _
        nil))))

(defn- uri-origin
  "Extract the origin (scheme://host:port) from a URI string.
   Returns nil if the URI is invalid or has no scheme/host."
  [^String uri-str]
  (when-let [^URI uri (parse-uri uri-str)]
    (let [scheme (.getScheme uri)
          host   (.getHost uri)
          port   (.getPort uri)]
      (when (and scheme host)
        (if (or (neg? port)
                (and (= scheme "http") (= port 80))
                (and (= scheme "https") (= port 443)))
          (str scheme "://" host)
          (str scheme "://" host ":" port))))))

(defn- relative-url?
  "Returns true if the URL is a relative path (starts with /).
   Rejects protocol-relative URLs (//example.com) which could redirect to external sites."
  [^String url]
  (and (str/starts-with? url "/")
       (not (str/starts-with? url "//"))))

(defn valid-redirect-url?
  "Validates that a redirect URL is safe for use after OIDC authentication.

   A redirect URL is considered safe if it is:
   1. A relative URL starting with '/' (but not protocol-relative '//')
   2. An absolute URL with the same origin as the site-url

   Parameters:
   - redirect-url: The URL to validate
   - site-url: The configured site URL (optional, will use system setting if not provided)

   Returns true if the redirect URL is safe, false otherwise."
  ([redirect-url]
   (valid-redirect-url? redirect-url (system/site-url)))
  ([redirect-url site-url]
   (cond
     ;; Nil or blank URLs are not valid
     (or (nil? redirect-url) (str/blank? redirect-url))
     false

     ;; Relative URLs starting with / are safe (but not // which is protocol-relative)
     (relative-url? redirect-url)
     true

     ;; Absolute URLs must have the same origin as site-url
     :else
     (let [redirect-origin (uri-origin redirect-url)
           site-origin     (uri-origin site-url)]
       (and (some? redirect-origin)
            (some? site-origin)
            (= (u/lower-case-en redirect-origin)
               (u/lower-case-en site-origin)))))))

(defn- validate-redirect-url!
  "Validates a redirect URL and throws an exception if invalid.
   This prevents open redirect attacks by ensuring redirects stay within the application."
  [redirect-url]
  (when-not (valid-redirect-url? redirect-url)
    (log/warnf "OIDC redirect URL validation failed: %s" redirect-url)
    (throw (ex-info (tru "Invalid redirect URL. Redirect must be a relative path or same-origin URL.")
                    {:status-code 400
                     :redirect-url redirect-url}))))

;;; -------------------------------------------------- State Creation --------------------------------------------------

(defn create-oidc-state
  "Create an OIDC state payload for encryption.

   Required options:
   - :state      - CSRF protection token
   - :nonce      - ID token validation nonce
   - :redirect   - Post-auth redirect URL (must be relative or same-origin)
   - :provider   - Provider identifier keyword or string (e.g., :slack-connect)

   Optional:
   - :ttl-ms     - Time-to-live in milliseconds (default: 600000 = 10 min)
   - :browser-id - Browser identifier for request forgery protection

   Returns a map suitable for encryption.

   Throws an exception if the redirect URL is invalid (not relative or not same-origin).
   This prevents open redirect attacks."
  [{:keys [state nonce redirect provider ttl-ms browser-id]
    :or   {ttl-ms default-ttl-ms}}]
  {:pre [(some? state) (some? nonce) (some? redirect) (some? provider)]}
  ;; Validate redirect URL to prevent open redirect attacks
  (validate-redirect-url! redirect)
  (let [now (t/to-millis-from-epoch (t/instant))]
    (cond-> {:state      state
             :nonce      nonce
             :redirect   redirect
             :provider   (name provider)
             :created-at now
             :expires-at (+ now ttl-ms)}
      browser-id (assoc :browser-id browser-id))))

;;; -------------------------------------------------- Encryption --------------------------------------------------

(defn- assert-encryption-enabled!
  "Throws an exception if encryption is not enabled."
  []
  (when-not (encryption/default-encryption-enabled?)
    (throw (ex-info (tru "OIDC authentication requires MB_ENCRYPTION_SECRET_KEY to be set. Please configure encryption to use OIDC authentication.")
                    {:status-code 500}))))

(defn encrypt-state
  "Encrypt OIDC state payload to a URL-safe string.

   Uses Metabase's AES256-CBC-HMAC-SHA512 encryption with MB_ENCRYPTION_SECRET_KEY.
   Throws an exception if encryption is not enabled."
  [state-map]
  (assert-encryption-enabled!)
  (-> state-map
      json/encode
      encryption/encrypt))

(defn decrypt-state
  "Decrypt and validate OIDC state from encrypted string.

   Returns the state map if valid, or nil if:
   - Decryption fails (tampered or wrong key)
   - State has expired (based on :expires-at)
   - State is malformed

   Options:
   - :validate-browser-id - If provided, validates that :browser-id matches"
  ([encrypted-state]
   (decrypt-state encrypted-state nil))
  ([encrypted-state {:keys [validate-browser-id]}]
   (when encrypted-state
     (try
       (let [state-map (-> encrypted-state
                           encryption/decrypt
                           json/decode+kw)
             now       (t/to-millis-from-epoch (t/instant))]
         (cond
           ;; Not a valid map
           (not (map? state-map))
           (do (log/warn "OIDC state decryption produced non-map result")
               nil)

           ;; Missing required fields
           (not (and (:state state-map)
                     (:nonce state-map)
                     (:redirect state-map)
                     (:provider state-map)
                     (:expires-at state-map)))
           (do (log/warn "OIDC state missing required fields")
               nil)

           ;; Expired
           (<= (:expires-at state-map) now)
           (do (log/warn "OIDC state has expired")
               nil)

           ;; Browser-id mismatch (if validation requested)
           (and validate-browser-id
                (not= validate-browser-id (:browser-id state-map)))
           (do (log/warnf "OIDC state browser-id mismatch: expected %s" validate-browser-id)
               nil)

           ;; Valid
           :else
           state-map))
       (catch Exception e
         (log/warn e "Failed to decrypt OIDC state")
         nil)))))

;;; -------------------------------------------------- Cookie Management --------------------------------------------------

(defn- cookie-options
  "Generate secure cookie options based on the request."
  [request ttl-seconds]
  (merge
   {:http-only true
    :path      "/"
    :max-age   ttl-seconds}
   ;; Use SameSite=Lax for OIDC since we need the cookie sent on redirect back from IdP
   ;; Secure=true only when using HTTPS
   (if (u/https? request)
     {:same-site :lax
      :secure    true}
     {:same-site :lax})))

(defn set-oidc-state-cookie
  "Add encrypted OIDC state cookie to response.

   Parameters:
   - response    - Ring response map
   - request     - Ring request (for determining secure/https)
   - state-data  - Map with :state, :nonce, :redirect, :provider keys
   - options     - Optional map with :ttl-ms (default 600000), :browser-id

   Returns updated response with cookie set."
  ([response request state-data]
   (set-oidc-state-cookie response request state-data {}))
  ([response request state-data {:keys [ttl-ms browser-id] :or {ttl-ms default-ttl-ms}}]
   (let [full-state  (create-oidc-state (cond-> (assoc state-data :ttl-ms ttl-ms)
                                          browser-id (assoc :browser-id browser-id)))
         encrypted   (encrypt-state full-state)
         ttl-seconds (quot ttl-ms 1000)]
     (response/set-cookie response
                          oidc-state-cookie-name
                          encrypted
                          (cookie-options request ttl-seconds)))))

(defn get-oidc-state
  "Retrieve and validate OIDC state from request cookies.

   Parameters:
   - request - Ring request with :cookies
   - options - Optional map with :validate-browser-id, :expected-provider

   Returns decrypted state map if valid, nil otherwise.
   Validates expiration and optionally browser-id and provider."
  ([request]
   (get-oidc-state request {}))
  ([request {:keys [validate-browser-id expected-provider]}]
   (when-let [encrypted (get-in request [:cookies oidc-state-cookie-name :value])]
     (when-let [state (decrypt-state encrypted {:validate-browser-id validate-browser-id})]
       (if (and expected-provider
                (not= (name expected-provider) (:provider state)))
         (do (log/warnf "OIDC state provider mismatch: expected %s, got %s"
                        (name expected-provider) (:provider state))
             nil)
         state)))))

(defn clear-oidc-state-cookie
  "Clear the OIDC state cookie from response.

   Should be called after successful authentication to prevent replay."
  [response]
  (response/set-cookie response
                       oidc-state-cookie-name
                       ""
                       {:max-age 0
                        :path    "/"}))

;;; -------------------------------------------------- High-Level Integration --------------------------------------------------

(defn wrap-oidc-redirect
  "Wrap an OIDC redirect response with state cookie.

   Takes the auth-result from authenticate (with :redirect-url, :state, :nonce)
   and returns a Ring redirect response with encrypted state cookie.

   Parameters:
   - auth-result - Map from authenticate with :redirect-url, :state, :nonce
   - request     - Ring request
   - provider    - Provider keyword (e.g., :slack-connect)
   - redirect    - Final redirect URL after auth completes
   - options     - Optional: :ttl-ms, :browser-id"
  ([auth-result request provider redirect]
   (wrap-oidc-redirect auth-result request provider redirect {}))
  ([auth-result request provider redirect options]
   (-> (response/redirect (:redirect-url auth-result))
       (set-oidc-state-cookie request
                              {:state    (:state auth-result)
                               :nonce    (:nonce auth-result)
                               :redirect redirect
                               :provider provider}
                              options))))

(defn validate-oidc-callback
  "Validate OIDC callback request against stored state.

   Checks:
   1. State cookie exists and is valid (not expired, not tampered)
   2. State parameter matches stored state (CSRF protection)
   3. Provider matches expected provider
   4. Optionally validates browser-id

   Parameters:
   - request          - Ring request with :cookies
   - expected-state   - State parameter from callback query string
   - expected-provider - Expected provider keyword
   - options          - Optional: :validate-browser-id

   Returns map with :valid? and either :state-data/:nonce/:redirect or :error/:message"
  ([request expected-state expected-provider]
   (validate-oidc-callback request expected-state expected-provider {}))
  ([request expected-state expected-provider options]
   (let [state-data (get-oidc-state request (merge options
                                                   {:expected-provider expected-provider}))]
     (cond
       (nil? state-data)
       {:valid?  false
        :error   :invalid-or-expired-state
        :message (tru "OIDC state cookie is invalid, expired, or missing")}

       (not= expected-state (:state state-data))
       {:valid?  false
        :error   :state-mismatch
        :message (tru "State parameter does not match - possible CSRF attack")}

       :else
       {:valid?     true
        :state-data state-data
        :nonce      (:nonce state-data)
        :redirect   (:redirect state-data)}))))
