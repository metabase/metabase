(ns metabase.sso.oidc.tokens
  "JWT token validation and JWKS handling for OIDC."
  (:require
   [buddy.core.keys :as keys]
   [buddy.sign.jwt :as jwt]
   [clj-http.client :as http]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private jwks-cache
  "Cache of JWKS by URI. Map of JWKS URI string -> JWKS map."
  (atom {}))

(defn clear-jwks-cache!
  "Clear all cached JWKS. Useful for testing."
  []
  (reset! jwks-cache {}))

(defn- fetch-jwks
  "Fetch JWKS from the given URI. Returns the parsed JWKS map or nil on error."
  [jwks-uri]
  (try
    (log/infof "Fetching JWKS from %s" jwks-uri)
    (-> (http/get jwks-uri {:as :json
                            :accept :json
                            :throw-exceptions false
                            :conn-timeout 5000
                            :socket-timeout 5000})
        :body)
    (catch Exception e
      (log/warnf e "Failed to fetch JWKS from %s" jwks-uri)
      nil)))

(defn get-jwks
  "Get JWKS from URI, with caching. Returns JWKS map or nil."
  [jwks-uri]
  (when jwks-uri
    (if-let [cached (get @jwks-cache jwks-uri)]
      (do
        (log/debugf "Using cached JWKS for URI %s" jwks-uri)
        cached)
      (when-let [jwks (fetch-jwks jwks-uri)]
        (swap! jwks-cache assoc jwks-uri jwks)
        jwks))))

(defn- find-signing-key
  "Find the signing key from JWKS that matches the JWT kid (key ID).
   Returns the public key or nil if not found."
  [jwks kid]
  (when-let [keys (:keys jwks)]
    (some (fn [key-data]
            (when (= (:kid key-data) kid)
              key-data))
          keys)))

(defn verify-signature
  "Verify JWT signature using JWKS.

   Parameters:
   - token: JWT string
   - jwks-uri: URI to fetch JWKS from

   Returns the verified claims map or nil if verification fails."
  [token jwks-uri]
  (try
    (when-let [jwks (get-jwks jwks-uri)]
      ;; Parse token header to get kid
      (let [header-json (jwt/decode-header token)
            kid (:kid header-json)]
        (when-let [key-data (find-signing-key jwks kid)]
          ;; Convert JWK to public key and verify
          (let [public-key (keys/jwk->public-key key-data)]
            (jwt/unsign token public-key {:alg :rs256})))))
    (catch Exception e
      (log/warn e "JWT signature verification failed")
      nil)))

(defn validate-expiry
  "Validate that the token has not expired.

   Parameters:
   - claims: Token claims map

   Returns true if token is not expired, falseotherwise."
  [claims]
  (when-let [exp (:exp claims)]
    (let [now (quot (System/currentTimeMillis) 1000)]
      (> exp now))))

(defn validate-issuer
  "Validate that the token issuer matches expected issuer.

   Parameters:
   - claims: Token claims map
   - expected-issuer: Expected issuer URL

   Returns true if issuer matches, false otherwise."
  [claims expected-issuer]
  (= (:iss claims) expected-issuer))

(defn validate-audience
  "Validate that the token audience includes the expected client ID.

   Parameters:
   - claims: Token claims map
   - expected-audience: Expected client ID

   Returns true if audience matches, false otherwise."
  [claims expected-audience]
  (let [aud (:aud claims)]
    (cond
      (string? aud) (= aud expected-audience)
      (sequential? aud) (some #(= % expected-audience) aud)
      :else false)))

(defn validate-nonce
  "Validate that the token nonce matches the expected nonce.

   Parameters:
   - claims: Token claims map
   - expected-nonce: Expected nonce value

   Returns true if nonce matches, false otherwise."
  [claims expected-nonce]
  (= (:nonce claims) expected-nonce))

(defn validate-id-token
  "Validate an OIDC ID token.

   Parameters:
   - token: JWT string
   - config: Map with :jwks-uri, :issuer-uri, :client-id
   - nonce: Expected nonce value (optional)

   Returns a map with:
   - :valid? - boolean indicating if token is valid
   - :claims - the token claims if valid
   - :error - error message if invalid"
  [token {:keys [jwks-uri issuer-uri client-id]} nonce]
  (try
    ;; First verify signature
    (if-let [claims (verify-signature token jwks-uri)]
      (cond
        ;; Validate expiry
        (not (validate-expiry claims))
        {:valid? false :error "Token has expired"}

        ;; Validate issuer
        (not (validate-issuer claims issuer-uri))
        {:valid? false :error (str "Invalid issuer. Expected: " issuer-uri ", Got: " (:iss claims))}

        ;; Validate audience
        (not (validate-audience claims client-id))
        {:valid? false :error (str "Invalid audience. Expected: " client-id ", Got: " (:aud claims))}

        ;; Validate nonce if provided
        (and nonce (not (validate-nonce claims nonce)))
        {:valid? false :error "Invalid nonce"}

        ;; All validations passed
        :else
        {:valid? true :claims claims})
      {:valid? false :error "JWT signature verification failed"})
    (catch Exception e
      {:valid? false :error (str "Token validation error: " (.getMessage e))})))
