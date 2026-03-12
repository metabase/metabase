(ns metabase.auth-identity.provider
  "Provider multimethod system for authentication. This namespace defines the core protocol
  that all authentication providers must implement.

  The provider system uses three multimethods:
  - validate: Validate credentials before database insert/update (throws on error)
  - authenticate: Core authentication logic (returns success/failure/redirect)
  - login!: Complete login orchestration (calls authenticate, creates session)

  Providers are organized in a hierarchy:
  - ::provider (root) - Base provider with default implementations
  - ::create-user-if-not-exists - Mixin for SSO providers that auto-provision users

  ## How to Implement a Provider

  Each provider implementation should:
  1. Use a keyword in the :provider namespace (e.g., :provider/password)
  2. Declare hierarchy with (derive :provider/name ::provider/provider)
  3. For SSO providers that auto-create users, also (derive :provider/name ::provider/create-user-if-not-exists)
  4. Implement the authenticate multimethod (required)
  5. Optionally implement validate for credential validation

  Example:
    (ns metabase.sso.providers.my-provider
      (:require [metabase.auth-identity.provider :as provider]
                [methodical.core :as methodical]))

    ;; Declare this provider derives from ::provider/provider
    (derive :provider/my-provider ::provider/provider)

    ;; For SSO providers that auto-create users:
    (derive :provider/my-provider ::provider/create-user-if-not-exists)

    ;; Implement authentication
    (methodical/defmethod provider/authenticate :provider/my-provider
      [_provider request]
      {:success? true
       :user-id 123
       :auth-identity {...}})

    ;; Optional: Implement validation
    (methodical/defmethod provider/validate :provider/my-provider
      [_provider auth-identity-data]
      (when-not (valid? auth-identity-data)
        (throw (ex-info \"Invalid credentials\" {:error :invalid}))))

  Example provider implementations:
  - metabase.auth-identity.providers.password (OSS)
  - metabase.sso.providers.ldap (OSS)
  - metabase.sso.providers.google (OSS)
  - metabase-enterprise.sso.providers.jwt (Enterprise)
  - metabase-enterprise.sso.providers.saml (Enterprise)"
  (:require
   [java-time.api :as t]
   [metabase.auth-identity.session :as auth-session]
   [metabase.events.core :as events]
   [metabase.notification.core :as notification]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Provider Hierarchy --------------------------------------------------

;; Provider hierarchy is defined by individual provider implementations
;; Each provider namespace should use (derive :provider/name ::provider/provider)
;; SSO providers that auto-provision users should also derive from ::provider/create-user-if-not-exists

;;; -------------------------------------------------- Shared Error Messages --------------------------------------------------

(def ^:private disabled-account-message (deferred-tru "Your account is disabled. Please contact your administrator."))
(def ^:private disabled-account-snippet (deferred-tru "Your account is disabled."))

;;; -------------------------------------------------- Multimethod: validate --------------------------------------------------

(methodical/defmulti validate
  "Validate credentials and settings for a provider before insert/update into AuthIdentity.
   Throws an exception with error details if invalid. This ensures transaction rollback on validation failure.
   Returns nil if valid.

   This method is called from define-before-insert and define-before-update hooks in the AuthIdentity model.

   Args:
     provider: Provider keyword (e.g., ::provider/password)
     auth-identity-data: Map containing :credentials, :metadata, etc.

   Returns:
     nil if valid

   Throws:
     ExceptionInfo if validation fails

   Examples:
     ;; Password provider validates credentials structure
     (validate ::provider/password {:credentials {:password_hash \"...\" :password_salt \"...\"}})
     => nil

     ;; Throws if invalid
     (validate ::provider/password {:credentials {:password_hash nil}})
     => throws ExceptionInfo"
  {:arglists '([provider auth-identity-data])}
  (fn [provider _auth-identity-data]
    provider))

(methodical/defmethod validate ::provider
  [_provider _auth-identity-data]
  ;; Default: no validation (SSO providers typically don't need credential validation)
  nil)

;;; -------------------------------------------------- Multimethod: authenticate --------------------------------------------------

(methodical/defmulti authenticate
  "Authenticate a login request for a provider. This method handles the complete authentication logic
   including token validation, credential verification, and user data extraction.

   For token-based providers (JWT, Google OAuth, SAML), this method is responsible for:
   - Verifying token signatures/validity
   - Decoding tokens and extracting claims
   - Validating assertions
   - Extracting user information from the verified token

   For credential-based providers (password, LDAP), this method verifies credentials against stored
   or external data.

   For OAuth/OIDC providers without tokens, this method returns redirect instructions to initiate
   the external authentication flow.

   Args:
     provider: Provider keyword (e.g., ::provider/password)
     request: Login request map (varies by provider, contains raw authentication data)

   Returns:
     Map with one of three result types:

     1. Success (authentication complete):
        {:success? true
         :user-id <id>                    ; User ID if user exists
         :auth-identity <auth-identity>   ; AuthIdentity record if found
         :user-data <map>                 ; User data for provisioning (SSO providers)
         :provider-id <string>}           ; Provider-specific identifier (email for password/Google,
                                          ; DN for LDAP, subject for SAML/JWT)

     2. Redirect needed (OAuth/OIDC flow initiation):
        {:success? :redirect
         :redirect-url <url>              ; URL to redirect to external provider
         :message <string>}               ; Human-readable message

     3. Failure:
        {:success? false
         :error <keyword>                 ; Error type (:invalid-credentials, :account-disabled, etc.)
         :message <string>}               ; Human-readable error message

   Examples:
     ;; Password authentication
     (authenticate ::provider/password {:email \"user@example.com\" :password \"secret\"})
     => {:success? true :user-id 123 :auth-identity {...} :provider-id \"user@example.com\"}

     ;; OAuth flow initiation
     (authenticate ::provider/google {:redirect-url \"/dashboard\"})
     => {:success? :redirect :redirect-url \"https://accounts.google.com/oauth/authorize?...\"}

     ;; OAuth callback
     (authenticate ::provider/google {:code \"abc123\" :state \"xyz\"})
     => {:success? true :user-data {:email \"user@example.com\" ...} :provider-id \"user@example.com\"}

     ;; Authentication failure
     (authenticate ::provider/password {:email \"user@example.com\" :password \"wrong\"})
     => {:success? false :error :invalid-credentials :message \"Password did not match stored password.\"}"
  {:arglists '([provider request])}
  (fn [provider _request]
    provider))

(methodical/defmethod authenticate ::provider
  [provider _request]
  (throw (ex-info (str "Authentication not implemented for provider: " provider)
                  {:provider provider})))

(methodical/defmethod authenticate :after ::provider
  [_provider result]
  (if (and (:success? result)
           (:auth-identity result))
    (let [auth-identity (:auth-identity result)
          expires-at (:expires_at auth-identity)]
      (if (and expires-at
               (t/before? (t/offset-date-time expires-at)
                          (t/offset-date-time)))
        (assoc result
               :success? false
               :error :authentication-expired
               :message (deferred-tru "This authentication method has expired. Please contact your administrator."))
        result))
    result))

;;; -------------------------------------------------- Multimethod: login! --------------------------------------------------

(methodical/defmulti login!
  "Complete login flow: authenticate, create/find user if needed, create session.

   This is called AFTER any external verification/redirects are complete and we have an identity
   assertion. It does NOT handle OAuth redirects, SAML flows, or other external verification steps.

   Args:
     provider: Provider keyword (e.g., ::provider/password)
     request: Login request map containing:
       - Authentication data (credentials, tokens, etc.)
       - :device-info - Device information for session tracking
       - :redirect-url - Optional redirect URL after login

   Returns:
     Map with one of three result types:

     1. Success (authentication complete, session created):
        {:success? true
         :session <session-id>           ; Session ID
         :user <user-record>             ; User record
         :redirect-url <url>}            ; Suggested redirect URL

     2. Redirect needed (OAuth/OIDC flow initiation, no session yet):
        {:success? :redirect
         :redirect-url <url>             ; URL to redirect to external provider
         :message <string>}              ; Human-readable message

     3. Failure:
        {:success? false
         :error <keyword>                ; Error type
         :message <string>}              ; Human-readable error message

   Examples:
     ;; Successful password login
     (login! ::provider/password {:email \"...\" :password \"...\" :device-info {...}})
     => {:success? true :session \"...\" :user {...} :redirect-url \"/\"}

     ;; OAuth flow initiation
     (login! ::provider/google {:redirect-url \"/dashboard\" :device-info {...}})
     => {:success? :redirect :redirect-url \"https://accounts.google.com/oauth/...\"}

     ;; Failed login
     (login! ::provider/password {:email \"...\" :password \"wrong\" :device-info {...}})
     => {:success? false :error :invalid-credentials :message \"...\"}"
  {:arglists '([provider request])}
  (fn [provider _request]
    provider))

(mu/defn- create-session!
  "Create a new session for a user with the given provider.
   Updates the last_used_at timestamp on the corresponding AuthIdentity."
  [request :- [:map
               [:user [:map
                       [:id ms/PositiveInt]
                       [:is_active :boolean]]]
               [:device-info {:optional true} [:maybe [:map
                                                       [:device_id {:optional true} [:maybe ms/NonBlankString]]
                                                       [:device_description {:optional true} [:maybe ms/NonBlankString]]
                                                       [:ip_address {:optional true} [:maybe ms/NonBlankString]]]]]]
   provider :- :keyword]
  (if-not (get-in request [:user :is_active])
    (assoc request :success? false
           :error disabled-account-snippet
           :message disabled-account-message)
    (let [{:keys [user device-info]} request
          session (auth-session/create-session-with-auth-tracking! user device-info provider)]
      (assoc request :session session))))

(methodical/defmethod login! ::provider
  [provider request]
  (cond
    (= :redirect (:success? request))
    request

    (not (:success? request))
    request

    next-method
    (next-method provider request)

    :else
    (let [redirect-url (or (:redirect-url request) "/")]
      (assoc request
             :success? true
             :redirect-url redirect-url))))

(methodical/defmethod login! :around ::provider
  [provider request]
  (as-> (merge request (authenticate provider request)) $
    (assoc $ :user
           (or (when-let [user-id (:user-id $)]
                 (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id))
               (when-let [email (get-in $ [:user-data :email])]
                 (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :%lower.email (u/lower-case-en email)))))
    (cond-> $
      (and (:provider-id $) (:user-data $))
      (assoc-in [:user-data :provider-id] (:provider-id $)))
    (next-method provider $)
    (cond-> $
      (:user $) (create-session! provider))
    (select-keys $ [:success? :user :redirect-url :error :message :user-data :session :jwt-data])))

(defenterprise sso-user-fields
  "Return the list of User model fields that should be populated from SSO user data.
   OSS version includes basic fields. Enterprise version includes login_attributes and jwt_attributes."
  metabase-enterprise.auth-identity.provider
  []
  [:email :first_name :last_name :sso_source])

(mu/defn update-user!
  "Updates a user from user-data in the request"
  [{user-id :id} :- [:map [:id ms/PositiveInt]]
   user-data :- [:map
                 [:email :string]
                 [:first_name {:optional true} [:maybe :string]]
                 [:last_name {:optional true} [:maybe :string]]
                 [:sso_source {:optional true} :keyword]
                 [:is_active {:optional true} :boolean]
                 [:jwt_attributes {:optional true} [:maybe [:map-of :string [:maybe :string]]]]
                 [:login_attributes {:optional true} [:maybe [:map-of :string [:maybe :string]]]]
                 [:provider-id {:optional true} [:maybe :string]]]
   provider :- :keyword]
  (t2/with-transaction [_]
    (t2/update! :model/User user-id (select-keys user-data (conj (sso-user-fields) :is_active)))
    (when-not (t2/exists? :model/AuthIdentity :user_id user-id :provider (name provider))
      (t2/insert! :model/AuthIdentity (cond-> {:user_id user-id :provider (name provider)}
                                        (:provider-id user-data) (assoc :provider_id (:provider-id user-data)))))
    (t2/select-one [:model/User :id :is_active :last_login] user-id)))

(mu/defn- create-user!
  "Create a user from user-data in the request "
  [user-data :- [:map
                 [:email :string]
                 [:first_name {:optional true} [:maybe :string]]
                 [:last_name {:optional true} [:maybe :string]]
                 [:sso_source {:optional true} :keyword]
                 [:jwt_attributes {:optional true} [:maybe [:map-of :string [:maybe :string]]]]
                 [:login_attributes {:optional true} [:maybe [:map-of :string [:maybe :string]]]]
                 [:provider-id {:optional true} [:maybe :string]]
                 [:tenant_id {:optional true} [:maybe ms/PositiveInt]]]
   provider :- :keyword]
  (t2/with-transaction [_]
    (u/prog1
      (t2/insert-returning-instance! [:model/User :id :last_login :is_active :tenant_id]
                                     (select-keys user-data (sso-user-fields)))
      (t2/insert! :model/AuthIdentity (cond-> {:user_id (:id <>) :provider (name provider)}
                                        (:provider-id user-data) (assoc :provider_id (:provider-id user-data))))
      (notification/with-skip-sending-notification true
        (events/publish-event! :event/user-invited {:object (assoc (t2/select-one :model/User (:id <>))
                                                                   :sso_source (name provider))})))))

(methodical/defmethod login! ::create-user-if-not-exists
  [provider request]
  (let [user (or (when-let [user (:user request)]
                   (cond-> user
                     (:user-data request) (update-user! (:user-data request) provider)))
                 (when-let [user-data (:user-data request)]
                   (create-user! user-data provider)))
        redirect-url (or (:redirect-url request) "/")]
    (assoc request
           :success? true
           :user user
           :redirect-url redirect-url)))

(methodical/prefer-method! #'login! ::provider ::create-user-if-not-exists)

;;; -------------------------------------------------- Helper Functions --------------------------------------------------

(mu/defn provider-string->keyword :- :keyword
  "Convert a provider string to a provider keyword in the :provider namespace.

   Examples:
     (provider-string->keyword \"password\")
     => :provider/password

     (provider-string->keyword \"google\")
     => :provider/google"
  [provider-str :- :string]
  (keyword "provider" provider-str))

(mu/defn provider-keyword->string :- :string
  "Convert a provider keyword to a string for storage.

   Examples:
     (provider-keyword->string :provider/password)
     => \"password\"

     (provider-keyword->string :some-namespace/google)
     => \"google\""
  [provider :- :keyword]
  (name provider))
