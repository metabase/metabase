(ns metabase.sso.providers.oidc
  "Base OIDC authentication provider. Provides generic OIDC support that concrete
   implementations (Auth0, Okta, etc.) can derive from."
  (:require
   [clojure.string :as str]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.sso.db :as sso.db]
   [metabase.sso.oidc.common :as oidc.common]
   [metabase.sso.oidc.discovery :as oidc.discovery]
   [metabase.sso.oidc.http :as oidc.http]
   [metabase.sso.oidc.schema :as oidc.schema]
   [metabase.sso.oidc.state :as oidc.state]
   [metabase.sso.oidc.tokens :as oidc.tokens]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

;; Register the OIDC provider in the hierarchy
(auth-identity/derive! :provider/oidc :metabase.auth-identity.provider/provider)
(auth-identity/derive! :provider/oidc :metabase.auth-identity.provider/create-user-if-not-exists)

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
        (:iss claims) (assoc :provider-metadata {:iss (:iss claims)})
        ;; carried into the AuthIdentity row and session tracking on the JIT-provisioning path
        (:identity-provider-name config) (assoc :identity-provider-name (:identity-provider-name config))))))

;;; -------------------------------------------------- Identity Linking --------------------------------------------------

(defn- trusted-email-domain?
  "True if `email`'s domain is listed in the provider's `:trusted-email-domains` (\"*\" trusts every domain)."
  [email domains]
  (let [email-domain (some-> email u/email->domain u/lower-case-en)]
    (boolean (some #(contains? #{"*" email-domain} (-> % str/trim (str/replace #"^@" "") u/lower-case-en))
                   domains))))

(defn- may-auto-link?
  "Whether this token may establish a new link between the email-resolved user and its (iss, sub) identity."
  [claims config email]
  (let [verified (email-verified-claim claims)]
    (or (and (not (false? (:auto-link-verified-email config)))
             (or (true? verified)
                 ;; providers that verify emails out of band (e.g. Slack) may omit the claim entirely
                 (and (nil? verified) (true? (:assume-email-verified config)))))
        (trusted-email-domain? email (:trusted-email-domains config)))))

(def ^:private linking-config-keys
  "The keys of the OIDC config `login!` reads, which [[auth-identity/authenticate]] passes on as `:oidc-config`."
  [:identity-provider-name :legacy-provider-name :auto-link-verified-email :trusted-email-domains
   :assume-email-verified])

(defn- provider-names
  "AuthIdentity provider names that may hold identities for this login: the per-IdP name plus, when
   configured, the shared legacy name that pre-migration rows still live under."
  [pname config]
  (cond-> [pname] (:legacy-provider-name config) (conj (:legacy-provider-name config))))

(defn- linked-to-other-user?
  "True if (iss, sub) is linked to a user other than `user-id` (nil: to anyone) under any of `provider-names`. A row
  without a stored issuer may be that issuer's, so it counts."
  [provider-names user-id sub iss]
  (boolean
   (some (fn [{row-user :user_id {row-iss :iss} :metadata}]
           (and (not= row-user user-id) (contains? #{nil iss} row-iss)))
         (sso.db/auth-identities-with-provider-id provider-names sub))))

(defn- with-identity-link-check*
  "Run the write `f` unless (iss, sub) is linked to a user other than `user-id`, serializing check and write: iss lives
  in metadata JSON, so no DB constraint can enforce the uniqueness."
  [provider-names user-id sub iss f]
  (cluster-lock/with-cluster-lock ::link-identity
    (if (linked-to-other-user? provider-names user-id sub iss)
      (do (log/warnf "OIDC login rejected: token identity is already linked to a different user than %s" user-id)
          {:success? false
           :error :identity-already-linked
           :message "This identity provider account is already linked to a different Metabase account. Please contact your administrator."})
      (f))))

(defn link-identity!
  "Point `user-id`'s AuthIdentity row for `provider` (`auth-identity`, or a new row when nil) at (iss, sub). Returns
  {:success? true}, or a failure map when that identity is linked to another user under any of `check-names`
  (default: just `provider`'s)."
  [provider user-id auth-identity sub iss & {:keys [check-names]}]
  (with-identity-link-check* (or check-names [(name provider)]) user-id sub iss
    (fn []
      (if auth-identity
        (sso.db/update-auth-identity! auth-identity {:provider (name provider) :provider_id sub} {:iss iss})
        (sso.db/insert-auth-identity! user-id (name provider) sub {:iss iss}))
      {:success? true})))

(defn- verify-or-link-identity!
  "Enforce that the token's (iss, sub) matches the AuthIdentity linked to the email-resolved user, linking it
   first when the provider's linking policy allows. Returns {:success? true} or a failure map."
  [provider user claims config email]
  (let [pname         (auth-identity/identity-provider-name provider config)
        names         (provider-names pname config)
        sub           (subject claims)
        iss           (:iss claims)
        auth-identity (sso.db/auth-identity (:id user) pname)
        stored-sub    (:provider_id auth-identity)
        stored-iss    (get-in auth-identity [:metadata :iss])
        ;; rows written before per-IdP provider names live under the shared :legacy-provider-name; this user's row
        ;; with the same sub is the same identity, so it is migrated in place
        legacy-identity (when-let [legacy-name (and (not auth-identity) (:legacy-provider-name config))]
                          (let [row (sso.db/auth-identity (:id user) legacy-name)]
                            (when (= (:provider_id row) sub) row)))]
    (cond
      (and (= stored-sub sub) (= stored-iss iss))
      {:success? true}

      ;; rows created before iss tracking have no :iss in metadata; a matching sub backfills it
      (and (= stored-sub sub) (nil? stored-iss))
      (link-identity! pname (:id user) auth-identity sub iss :check-names names)

      legacy-identity
      (link-identity! pname (:id user) legacy-identity sub iss :check-names names)

      ;; linked to another identity (another sub, or another issuer): only the explicit linking flow replaces a link
      stored-sub
      {:success? false
       :error :identity-mismatch
       :message (str "This identity provider account doesn't match the one linked to your Metabase account. To use it "
                     "instead, sign in to Metabase another way and link it from your account settings, or contact your "
                     "administrator.")}

      (may-auto-link? claims config email)
      (link-identity! pname (:id user) nil sub iss :check-names names)

      :else
      {:success? false
       :error :account-linking-required
       :message (str "Your identity provider account is not linked to this Metabase account. Sign in to Metabase "
                     "another way and link it from your account settings, or contact your administrator.")})))

(defn- link-account!
  "Explicit account linking: link the token's (iss, sub) to the signed-in user who started this flow (`link-user-id`
  from the state cookie), establishing or replacing their link regardless of the auto-link policy. The token's email
  must resolve to that same user. Creates no session."
  [provider {:keys [user claims authenticated-user oidc-link-user-id] :as request}]
  (let [config     (:oidc-config request)
        pname      (auth-identity/identity-provider-name provider config)
        current-id (:id (some-> authenticated-user deref))]
    (cond
      (not= current-id oidc-link-user-id)
      {:success? false
       :error :authentication-required
       :message "Account linking must be finished in the session that started it. Please sign in and try again."}

      (not= (:id user) current-id)
      {:success? false
       :error :email-mismatch
       :message "This identity provider account's email doesn't match your Metabase account's email."}

      :else
      (let [result (link-identity! pname current-id (sso.db/auth-identity current-id pname) (subject claims) (:iss claims)
                                   :check-names (provider-names pname config))]
        (if (:success? result)
          (assoc request :session/skip? true)
          result)))))

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
                    (cond
                      ;; (iss, sub) is the identity everything downstream links against; a token without a
                      ;; sub could provision an account that can never log in again
                      (str/blank? (subject claims))
                      {:success? false
                       :error :invalid-token
                       :message "ID token is missing the sub claim"}

                      (false? (email-verified-claim claims))
                      {:success? false
                       :error :email-not-verified
                       :message "Email address is not verified by the identity provider"}

                      :else
                      (let [user-data (extract-user-data claims config)]
                        (if-not user-data
                          {:success? false
                           :error :user-data-extraction-failed
                           :message "Failed to extract user email from token"}
                          {:success? true
                           :claims claims
                           :user-data user-data
                           :oidc-config (select-keys config linking-config-keys)
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

(defn- attribute-session
  "Attribute a successful login's session to the AuthIdentity named `pname`, the per-IdP row it linked."
  [pname result]
  (cond-> result
    (true? (:success? result)) (assoc :session/provider (keyword pname))))

(methodical/defmethod auth-identity/login! :provider/oidc
  [provider {:keys [user claims] :as request}]
  ;; `user` was resolved by email alone; before provisioning/session creation, require the token's
  ;; (iss, sub) to match (or establish, per policy) that user's linked identity
  (cond
    ;; failures and redirects pass through untouched
    (not (true? (:success? request)))
    (next-method provider request)

    ;; a signed-in user's explicit linking flow, bound to them by the state cookie
    (:oidc-link-user-id request)
    (link-account! provider request)

    ;; JIT provisioning pins the new account's email to the token's (iss, sub), so it follows the same
    ;; linking policy as an existing account, and the identity must not already belong to another account
    (not user)
    (let [config (:oidc-config request)
          pname  (auth-identity/identity-provider-name provider config)]
      (if-not (may-auto-link? claims config (get-in request [:user-data :email]))
        (do (log/warn "OIDC login rejected: the token cannot establish a link for a new account; not provisioning")
            {:success? false
             :error :account-linking-required
             :message "Metabase couldn't verify your email address, so an account can't be created for it. Please contact your administrator."})
        (with-identity-link-check* (provider-names pname config) nil (subject claims) (:iss claims)
          #(attribute-session pname (next-method provider request)))))

    :else
    (let [result (verify-or-link-identity! provider user claims (:oidc-config request)
                                           (get-in request [:user-data :email]))]
      (if (:success? result)
        (attribute-session (auth-identity/identity-provider-name provider (:oidc-config request))
                           (next-method provider request))
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
        ;; :oidc-link-user-id comes only from the validated state cookie, never from the caller
        (next-method provider (cond-> (-> request
                                          (dissoc :oidc-link-user-id)
                                          (assoc :oidc-nonce (:nonce validation)))
                                (get-in validation [:state-data :link-user-id])
                                (assoc :oidc-link-user-id (get-in validation [:state-data :link-user-id]))
                                ;; Use redirect from state cookie if not already set in request
                                (and (:redirect validation)
                                     (not (:redirect-url request)))
                                (assoc :redirect-url (:redirect validation))))))
    ;; Not a callback - pass through to next method
    (next-method provider request)))
