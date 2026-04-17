(ns metabase.sso.oidc.check
  "OIDC configuration validation.

   Validates OIDC provider configuration by probing the discovery document
   and testing client credentials against the token endpoint."
  (:require
   [clj-http.client :as http]
   [metabase.sso.oidc.discovery :as discovery]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn check-discovery
  "Validate that the issuer's discovery document is fetchable and contains required endpoints.

   Invalidates the cache first to ensure a fresh fetch, then checks for authorization,
   token, and JWKS endpoints.

   Returns `{:step :discovery, :success bool, :error str?, :token-endpoint str?}`."
  [issuer-uri]
  (discovery/invalidate-cache! issuer-uri)
  (let [doc (discovery/discover-oidc-configuration issuer-uri)]
    (if (nil? doc)
      {:step :discovery
       :success false
       :error (str "Could not fetch OIDC discovery document from " issuer-uri)}
      (let [config {:discovery-document doc}]
        (if (discovery/validate-configuration config)
          {:step :discovery
           :success true
           :token-endpoint (discovery/get-token-endpoint config)}
          {:step :discovery
           :success false
           :error "Discovery document is missing required endpoints (authorization, token, or JWKS)"})))))

(defn check-credentials
  "Validate client credentials by POSTing a client_credentials grant to the token endpoint.

   Interprets the response:
   - HTTP 200 → credentials confirmed valid
   - `unsupported_grant_type` / `unauthorized_client` → inconclusive (IdP may not have checked the secret)
   - `invalid_client` → invalid credentials
   - Other errors → reported as-is

   Returns `{:step :credentials, :success bool, :verified bool, :error str?}`.
   When `:verified` is false, the IdP did not confirm the credentials but didn't reject them either."
  [token-endpoint client-id client-secret]
  (try
    (let [response (http/post token-endpoint
                              {:form-params {:grant_type    "client_credentials"
                                             :client_id     client-id
                                             :client_secret client-secret}
                               :as :json
                               :coerce :always
                               :throw-exceptions false
                               :conn-timeout 5000
                               :socket-timeout 5000})
          status   (:status response)
          body     (:body response)
          error-code  (or (:error body)
                          (when (string? body) body))]
      (cond
        (= 200 status)
        {:step :credentials :success true :verified true}

        (contains? #{"unsupported_grant_type" "unauthorized_client"} error-code)
        {:step :credentials :success true :verified false}

        (= "invalid_client" error-code)
        {:step :credentials :success false :verified true :error "Invalid client ID or client secret"}

        :else
        {:step :credentials
         :success false
         :verified true
         :error (str "Unexpected response from token endpoint (HTTP " status "): "
                     (or (:error_description body) error-code body))}))
    (catch Exception e
      (log/warnf e "OIDC credential check failed for %s" token-endpoint)
      {:step :credentials
       :success false
       :verified false
       :error (str "Could not connect to token endpoint: " (.getMessage e))})))

(defn check-oidc-configuration
  "Run full OIDC configuration validation: discovery then credentials.

   Parameters:
   - issuer-uri: The OIDC issuer URL
   - client-id: OAuth2 client ID
   - client-secret: OAuth2 client secret

   Returns `{:ok bool, :discovery {...}, :credentials {...}}`."
  [issuer-uri client-id client-secret]
  (let [disc (check-discovery issuer-uri)]
    (if-not (:success disc)
      {:ok false :discovery disc}
      (let [cred (check-credentials (:token-endpoint disc) client-id client-secret)]
        {:ok (:success cred)
         :discovery disc
         :credentials cred}))))
