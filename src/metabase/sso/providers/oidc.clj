(ns metabase.sso.providers.oidc
  "Base OIDC authentication provider. Provides generic OIDC support that concrete
   implementations (Auth0, Okta, etc.) can derive from."
  (:require
   [clojure.string :as str]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.sso.oidc.common :as oidc.common]
   [metabase.sso.oidc.discovery :as oidc.discovery]
   [metabase.sso.oidc.http :as oidc.http]
   [metabase.sso.oidc.schema :as oidc.schema]
   [metabase.sso.oidc.state :as oidc.state]
   [metabase.sso.oidc.tokens :as oidc.tokens]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

;; Register the OIDC provider in the hierarchy
(derive :provider/oidc :metabase.auth-identity.provider/provider)
(derive :provider/oidc :metabase.auth-identity.provider/create-user-if-not-exists)

;;; -------------------------------------------------- Configuration Handling --------------------------------------------------

(defn- enrich-config-with-discovery
  "Enrich configuration with OIDC discovery endpoints if needed.

   If the configuration doesn't have manual endpoints, attempts discovery
   using the issuer URI.

   Returns updated configuration map with :discovery-document."
  [config]
  (if (oidc.schema/discovery-based? config)
    ;; Use discovery
    (if-let [discovery-doc (oidc.discovery/discover-oidc-configuration (:issuer-uri config))]
      (assoc config :discovery-document discovery-doc)
      (do
        (log/warnf "OIDC discovery failed for issuer %s, falling back to manual configuration" (:issuer-uri config))
        config))
    config))

;;; -------------------------------------------------- Token Exchange --------------------------------------------------

(defn- exchange-code-for-tokens
  "Exchange authorization code for tokens at the token endpoint.

   Parameters:
   - code: Authorization code
   - config: Enriched OIDC configuration with discovery document (if applicable),
             token endpoint, client credentials, redirect URI

   Returns token response map with :id-token, :access-token, etc."
  [code config]
  (let [token-endpoint (oidc.discovery/get-token-endpoint config)]
    (try
      (let [response (oidc.http/oidc-post token-endpoint
                                          {:form-params {:grant_type "authorization_code"
                                                         :code code
                                                         :redirect_uri (:redirect-uri config)
                                                         :client_id (:client-id config)
                                                         :client_secret (:client-secret config)}})]
        (if (= 200 (:status response))
          (oidc.common/parse-token-response (:body response))
          (do
            (log/errorf "Token exchange failed with status %s" (:status response))
            nil)))
      (catch Exception e
        (log/errorf "Token exchange failed: %s" (ex-message e))
        nil))))

;;; -------------------------------------------------- User Data Extraction --------------------------------------------------

(defn- email-verified-claim
  "Normalize the id-token `email_verified` claim (OIDC Core §5.1) to true, false, or nil when absent.
   Any value other than boolean/string `true` counts as unverified."
  [claims]
  (let [verified (:email_verified claims)]
    (cond
      (nil? verified)                            nil
      (or (true? verified) (= verified "true")) true
      :else                                      false)))

(defn- subject
  "The token's `sub` claim as a string (OIDC requires a string; tolerate IdPs that send a number)."
  [claims]
  (some-> (:sub claims) str))

(defn- extract-user-data
  "Extract user data from ID token claims.

   Parameters:
   - claims: ID token claims map
   - config: OIDC configuration (for custom attribute mappings)

   Returns user data map with :email, :first_name, :last_name, :provider-id"
  [claims config]
  (let [;; Get attribute mappings from config, or use defaults
        email-attr (get config :attribute-email "email")
        firstname-attr (get config :attribute-firstname "given_name")
        lastname-attr (get config :attribute-lastname "family_name")

        ;; Extract values
        email (get claims (keyword email-attr))
        first-name (get claims (keyword firstname-attr))
        last-name (get claims (keyword lastname-attr))
        provider-id (subject claims)]
    (when email
      (cond-> {:email email
               :first_name first-name
               :last_name last-name
               :provider-id provider-id
               :sso_source :oidc}
        (:iss claims) (assoc :provider-metadata {:iss (:iss claims)})))))

;;; -------------------------------------------------- Identity Linking --------------------------------------------------

(defn- normalize-domain
  [domain]
  (-> domain str/trim (str/replace #"^@" "") u/lower-case-en))

(defn- trusted-email-domain?
  "True if `email`'s domain is listed in the provider's `:trusted-email-domains` (\"*\" trusts every domain)."
  [email domains]
  (boolean
   (when-let [email-domain (some-> email u/email->domain u/lower-case-en)]
     (some (fn [domain]
             (let [domain (normalize-domain domain)]
               (or (= domain "*") (= domain email-domain))))
           domains))))

(defn- may-auto-link?
  "Whether this token may establish a new link between the email-resolved user and its (iss, sub) identity."
  [claims config email]
  (or (and (not (false? (:auto-link-verified-email config)))
           (true? (email-verified-claim claims)))
      (trusted-email-domain? email (:trusted-email-domains config))))

(defn- linked-to-other-user?
  "True if (provider, iss, sub) is already linked to a user other than `user-id`. Rows without a stored iss count."
  [provider user-id sub iss]
  (boolean
   (some (fn [row]
           (and (not= (:user_id row) user-id)
                (let [stored-iss (get-in row [:metadata :iss])]
                  (or (nil? stored-iss) (= stored-iss iss)))))
         (t2/select :model/AuthIdentity :provider (name provider) :provider_id sub))))

(defn link-identity!
  "Point `user-id`'s single AuthIdentity row for `provider` (unique per user+provider) at (iss, sub). Returns
   {:success? true}, or a failure map when that identity is already linked to another user."
  [provider user-id auth-identity sub iss]
  (if (linked-to-other-user? provider user-id sub iss)
    (do (log/warnf "OIDC login rejected: token identity is already linked to a different user than %d" user-id)
        {:success? false
         :error :identity-already-linked
         :message "This identity provider account is already linked to a different Metabase account. Please contact your administrator."})
    (do (if auth-identity
          (auth-identity/merge-metadata! auth-identity {:iss iss} {:provider_id sub})
          (t2/insert! :model/AuthIdentity {:user_id     user-id
                                           :provider    (name provider)
                                           :provider_id sub
                                           :metadata    {:iss iss}}))
        {:success? true})))

(defn- verify-or-link-identity!
  "Enforce that the token's (iss, sub) matches the AuthIdentity linked to the email-resolved user, linking it
   first when the provider's linking policy allows. Returns {:success? true} or a failure map."
  [provider user claims config email]
  (let [sub (subject claims)
        iss (:iss claims)]
    (if (str/blank? sub)
      {:success? false
       :error :invalid-token
       :message "ID token is missing the sub claim"}
      (let [auth-identity (t2/select-one :model/AuthIdentity :user_id (:id user) :provider (name provider))
            stored-sub    (:provider_id auth-identity)
            stored-iss    (get-in auth-identity [:metadata :iss])
            same-sub?     (= stored-sub sub)]
        (cond
          (and same-sub? (= stored-iss iss))
          {:success? true}

          ;; rows created before iss tracking have no :iss in metadata; a matching sub backfills it
          (and same-sub? (nil? stored-iss))
          (do (auth-identity/merge-metadata! auth-identity {:iss iss})
              {:success? true})

          (and stored-sub (= stored-iss iss))
          (do (log/warnf "OIDC login rejected: token subject does not match the identity linked to user %d" (:id user))
              {:success? false
               :error :identity-mismatch
               :message "This identity provider account is linked to a different identity for this Metabase account. Please contact your administrator."})

          ;; no link yet, a link to a different issuer, or a legacy link (no iss, so possibly another issuer's):
          ;; establishing/replacing the link is governed by the provider's linking policy
          (may-auto-link? claims config email)
          (do (when stored-sub
                (log/infof "OIDC login: relinking user %d from %s to the token's identity" (:id user)
                           (if stored-iss (str "issuer " stored-iss) "a legacy identity without issuer")))
              (link-identity! provider (:id user) auth-identity sub iss))

          :else
          (do (log/warnf "OIDC login rejected: no linked identity for user %d and the token cannot establish one" (:id user))
              {:success? false
               :error :account-linking-required
               :message "Your identity provider account is not linked to this Metabase account. Please contact your administrator."}))))))

;;; -------------------------------------------------- Authentication Implementation --------------------------------------------------

(methodical/defmethod auth-identity/authenticate :provider/oidc
  [_provider request]
  (let [config (oidc.common/extract-oidc-config request)]
    (cond
      ;; Configuration missing
      (not config)
      {:success? false
       :error :configuration-error
       :message "OIDC configuration not found in request"}

      ;; Callback handling (has authorization code or state or error)
      (some #(contains? request %) [:code :error :state])
      (let [;; Validate callback parameters
            validation (oidc.common/validate-callback-params request)]
        (if-not (:valid? validation)
          {:success? false
           :error :invalid-callback
           :message (get-in validation [:error :description] "Invalid callback parameters")}
          ;; Enrich config with discovery once for the entire callback flow
          (let [enriched-config (enrich-config-with-discovery config)
                code (:code validation)
                tokens (exchange-code-for-tokens code enriched-config)]
            (if-not (:id-token tokens)
              {:success? false
               :error :token-exchange-failed
               :message "Failed to exchange authorization code for tokens"}
              ;; Validate ID token
              (let [jwks-uri (oidc.discovery/get-jwks-uri enriched-config)
                    validation-config {:jwks-uri jwks-uri
                                       :issuer-uri (:issuer-uri config)
                                       :client-id (:client-id config)}
                    ;; Use :oidc-nonce to avoid collision with CSP :nonce from security middleware
                    nonce (:oidc-nonce request)
                    validation-result (oidc.tokens/validate-id-token (:id-token tokens)
                                                                     validation-config
                                                                     nonce)]
                (if-not (:valid? validation-result)
                  {:success? false
                   :error :invalid-token
                   :message (:error validation-result)}
                  ;; Extract user data from claims
                  (let [claims (:claims validation-result)]
                    (if (false? (email-verified-claim claims))
                      {:success? false
                       :error :email-not-verified
                       :message "Email address is not verified by the identity provider"}
                      (let [user-data (extract-user-data claims config)]
                        (if-not user-data
                          {:success? false
                           :error :user-data-extraction-failed
                           :message "Failed to extract user email from token"}
                          {:success? true
                           :claims claims
                           :user-data user-data
                           :oidc-config config
                           :provider-id (:provider-id user-data)}))))))))))

      ;; Initiate authorization flow
      :else
      (let [enriched-config (enrich-config-with-discovery config)
            authorization-endpoint (oidc.discovery/get-authorization-endpoint enriched-config)]
        (if-not authorization-endpoint
          {:success? false
           :error :configuration-error
           :message "Authorization endpoint not found. Check OIDC configuration or discovery."}
          ;; Generate authorization URL
          (let [state (oidc.common/generate-state)
                nonce (oidc.common/generate-nonce)
                scopes (get config :scopes ["openid" "email" "profile"])
                auth-url (oidc.common/generate-authorization-url
                          authorization-endpoint
                          (:client-id config)
                          (:redirect-uri config)
                          scopes
                          state
                          nonce)]
            {:success? :redirect
             :redirect-url auth-url
             :message "Redirecting to OIDC provider for authentication"
             ;; Store state and nonce for validation on callback
             :state state
             :nonce nonce}))))))

;;; -------------------------------------------------- Login Implementation --------------------------------------------------

(methodical/defmethod auth-identity/login! :provider/oidc
  [provider {:keys [user claims] :as request}]
  ;; `user` was resolved by email alone; before provisioning/session creation, require the token's
  ;; (iss, sub) to match (or establish, per policy) that user's linked identity
  (cond
    ;; failures/redirects, and new users (provisioned with their (iss, sub) by create-user!)
    (not (and (true? (:success? request)) user))
    (next-method provider request)

    ;; never fall through to email-only login for an existing user without the token's claims
    (not claims)
    {:success? false
     :error :invalid-token
     :message "ID token claims are missing"}

    :else
    (let [result (verify-or-link-identity! provider user claims (:oidc-config request)
                                           (get-in request [:user-data :email]))]
      (if (:success? result)
        (next-method provider request)
        result))))

(methodical/defmethod auth-identity/login! :around :provider/oidc
  [provider {:keys [code state] :as request}]
  ;; Only validate state for OIDC callbacks (when we have code and state parameters)
  (if (and code state)
    (let [;; Get provider-specific keyword from request or derive from provider
          provider-keyword (or (:oidc-provider request) provider)
          validation (oidc.state/validate-oidc-callback request
                                                        state
                                                        provider-keyword
                                                        {:validate-browser-id (:browser-id request)})]
      (if-not (:valid? validation)
        {:success? false
         :error (:error validation)
         :message (:message validation)}
        ;; Add nonce and redirect from validated state to request
        ;; Use :oidc-nonce to avoid collision with CSP :nonce from security middleware
        (next-method provider (cond-> (assoc request :oidc-nonce (:nonce validation))
                                ;; Use redirect from state cookie if not already set in request
                                (and (:redirect validation)
                                     (not (:redirect-url request)))
                                (assoc :redirect-url (:redirect validation))))))
    ;; Not a callback - pass through to next method
    (next-method provider request)))
