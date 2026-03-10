(ns metabase.sso.oidc.common
  "Common utilities for OIDC authentication."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.nonce :as nonce]
   [clojure.string :as str]
   [ring.util.codec :as codec]))

(defn generate-state
  "Generate a cryptographically random state token for CSRF protection."
  []
  (-> (nonce/random-bytes 32) codecs/bytes->hex))

(defn generate-nonce
  "Generate a cryptographically random nonce for token validation."
  []
  (-> (nonce/random-bytes 32) codecs/bytes->hex))

(defn build-query-string
  "Build a URL query string from a map of parameters.
   Properly encodes parameter names and values."
  [params]
  (str/join "&"
            (for [[k v] params]
              (str (codec/url-encode (name k))
                   "="
                   (codec/url-encode (str v))))))

(defn generate-authorization-url
  "Generate the authorization URL for OIDC flow.

   Parameters:
   - authorization-endpoint: The authorization endpoint URL
   - client-id: OAuth client ID
   - redirect-uri: Callback URI for the authorization response
   - scopes: Vector of scope strings (e.g., [\"openid\" \"email\" \"profile\"])
   - state: CSRF protection state token
   - nonce: Token validation nonce

   Returns the complete authorization URL."
  [authorization-endpoint client-id redirect-uri scopes state nonce]
  (let [params {:response_type "code"
                :client_id client-id
                :redirect_uri redirect-uri
                :scope (str/join " " scopes)
                :state state
                :nonce nonce}
        query-string (build-query-string params)]
    (str authorization-endpoint "?" query-string)))

(defn extract-oidc-config
  "Extract OIDC configuration from various sources.

   Tries in order:
   1. :oidc-config key in request
   2. :metadata field in :auth-identity
   3. Direct keys in request

   Parameters:
   - request: Ring request map

   Returns the OIDC configuration map or nil."
  [request]
  (not-empty (or (:oidc-config request)
                 (get-in request [:auth-identity :metadata])
                 (select-keys request [:client-id :client-secret :issuer-uri :redirect-uri
                                       :authorization-endpoint :token-endpoint
                                       :userinfo-endpoint :jwks-uri :scopes]))))

(defn parse-token-response
  "Parse the token endpoint response.

   Parameters:
   - response-body: Token endpoint response body (map)

   Returns a map with :id-token, :access-token, :refresh-token (if present)."
  [response-body]
  {:id-token (:id_token response-body)
   :access-token (:access_token response-body)
   :refresh-token (:refresh_token response-body)
   :expires-in (:expires_in response-body)})

(defn validate-callback-params
  "Validate OIDC callback parameters.

   Parameters:
   - params: Query parameters from callback request

   Returns a map with:
   - :valid? - boolean indicating if params are valid
   - :code - authorization code if valid
   - :state - state token if valid
   - :error - error information if invalid"
  [params]
  (cond
    ;; Error response from provider
    (:error params)
    {:valid? false
     :error {:code (:error params)
             :description (:error_description params)}}

    ;; Missing authorization code
    (not (:code params))
    {:valid? false
     :error {:code :missing_code
             :description "Authorization code not found in callback"}}

    ;; Missing state
    (not (:state params))
    {:valid? false
     :error {:code :missing_state
             :description "State parameter not found in callback"}}

    ;; Valid
    :else
    {:valid? true
     :code (:code params)
     :state (:state params)}))
