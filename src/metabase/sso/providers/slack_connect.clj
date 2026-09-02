(ns metabase.sso.providers.slack-connect
  "Slack Connect OIDC authentication provider. Derives from the base OIDC provider
   and adds Slack-specific configuration and claim extraction."
  (:require
   [clojure.string :as str]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.server.settings :as server.settings]
   [metabase.sso.providers.oidc :as oidc]
   [metabase.sso.settings :as sso-settings]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

(derive :provider/slack-connect :provider/oidc)

;;; -------------------------------------------------- Constants --------------------------------------------------

(def provider-name
  "Provider name for Slack Connect authentication."
  "slack-connect")

(def slack-issuer-uri
  "Slack's OIDC issuer URI."
  "https://slack.com")

(def slack-team-image-claim
  "Claim key for Slack team image in ID token."
  "https://slack.com/team_image_230")

;;; -------------------------------------------------- Slack-Specific Utilities --------------------------------------------------

(defn- extract-slack-claims
  "Extract Slack-specific claims from ID token.
   Returns map with Slack team and user information for storage in login_attributes.
   Keys are strings to match the login_attributes schema [:map-of :string :string].

   NOTE: team_name is NOT included in Slack ID tokens per research.
   Use team_id only or make additional API call if team name is required."
  [id-token-claims]
  (let [team-id-claim (sso-settings/slack-connect-attribute-team-id)]
    (cond-> {}
      (get id-token-claims team-id-claim)
      (assoc "slack-team-id" (get id-token-claims team-id-claim))

      (:sub id-token-claims)
      (assoc "slack-user-id" (:sub id-token-claims))

      (get id-token-claims slack-team-image-claim)
      (assoc "slack-team-image" (get id-token-claims slack-team-image-claim))

      (:email_verified id-token-claims)
      (assoc "slack-email-verified" (str (:email_verified id-token-claims)))

      (:locale id-token-claims)
      (assoc "slack-locale" (:locale id-token-claims)))))

(defn- build-slack-oidc-config
  "Build OIDC configuration map for parent provider.
   Uses Slack settings and hardcoded Slack-specific values."
  [request]
  (when (and (sso-settings/slack-connect-client-id)
             (sso-settings/slack-connect-client-secret))
    {:client-id (sso-settings/slack-connect-client-id)
     :client-secret (sso-settings/unobfuscated-slack-connect-client-secret)
     :issuer-uri slack-issuer-uri
     :scopes ["openid" "profile" "email"]
     ;; Slack verifies account emails itself and may omit the email_verified claim; without this,
     ;; existing accounts could never auto-link (Slack has no linking-policy settings)
     :assume-email-verified true
     :redirect-uri (get request :redirect-uri)}))

;;; -------------------------------------------------- Utilities --------------------------------------------------

(defn- maybe-throw-user-provisioning
  "Throw an error if `enabled?` is falsey, indicating new user creation is not allowed."
  [enabled?]
  (when-not enabled?
    (throw (ex-info (tru "Sorry, but you''ll need a Metabase account to view this page. Please contact your administrator.")
                    {:status-code 401}))))

(defn check-sso-redirect
  "Check if open redirect is being exploited in SSO. If so, or if the redirect-url is invalid, throw a 400."
  [redirect-url]
  (try
    (let [redirect (some-> redirect-url (java.net.URI.))
          our-host (some-> ((requiring-resolve 'metabase.system.core/site-url)) (java.net.URI.) (.getHost))]
      (when-not (or (nil? redirect-url)
                    (and (nil? (.getHost redirect))
                         (nil? (.getScheme redirect)))
                    (= (.getHost redirect) our-host))
        (throw (ex-info (tru "Invalid redirect URL")
                        {:status-code  400
                         :redirect-url redirect-url})))
      redirect-url)
    (catch clojure.lang.ExceptionInfo e (throw e))
    (catch Exception _e
      (throw (ex-info (tru "Invalid redirect URL")
                      {:status-code  400
                       :redirect-url redirect-url})))))

;;; -------------------------------------------------- Authentication Implementation --------------------------------------------------

(methodical/defmethod auth-identity/authenticate :provider/slack-connect
  [_provider request]
  (cond
    (not (sso-settings/slack-connect-enabled))
    {:success? false
     :error :slack-connect-not-enabled
     :message (tru "Slack Connect authentication is not enabled")}

    (not (sso-settings/slack-connect-configured))
    {:success? false
     :error :slack-connect-not-configured
     :message (tru "Slack Connect is not configured")}

    (and (= sso-settings/slack-connect-auth-mode-link-only (sso-settings/slack-connect-authentication-mode))
         (not (:code request))
         (not (some-> (:authenticated-user request) deref)))
    {:success? false
     :error :authentication-required
     :message (tru "Account linking requires an authenticated session")}

    :else
    (let [oidc-config (build-slack-oidc-config request)]
      (if-not oidc-config
        {:success? false
         :error :configuration-error
         :message (tru "Failed to build Slack OIDC configuration")}
        (let [auth-result (next-method _provider (assoc request :oidc-config oidc-config))]
          (if (and (:success? auth-result)
                   (:user-data auth-result))
            (let [id-token-claims (or (get-in request [:id-token :claims])
                                      (get auth-result :claims))
                  slack-attrs (when id-token-claims
                                (extract-slack-claims id-token-claims))]
              (cond-> (assoc-in auth-result [:user-data :sso_source] :slack)
                slack-attrs
                (assoc-in [:user-data :login_attributes] slack-attrs)

                slack-attrs
                (assoc :slack-data slack-attrs)))
            auth-result))))))

;;; -------------------------------------------------- Login Implementation --------------------------------------------------

(defn- link-slack-identity!
  "Link (or relink) the authenticated user's Slack identity to the token's (iss, sub). Used in link-only mode,
   where the user is already signed in and linking is their explicit action."
  [provider user-id claims]
  (let [sub (some-> (:sub claims) str)]
    (cond
      (not user-id)
      {:success? false
       :error :authentication-required
       :message "Account linking requires an authenticated session"}

      (str/blank? sub)
      {:success? false
       :error :invalid-token
       :message "ID token is missing the sub claim"}

      :else
      (oidc/link-identity! provider user-id
                           (t2/select-one :model/AuthIdentity :user_id user-id :provider provider-name)
                           sub (:iss claims)))))

(methodical/defmethod auth-identity/login! :provider/slack-connect
  [provider {:keys [user authenticated-user claims] :as request}]
  (condp = (sso-settings/slack-connect-authentication-mode)
    sso-settings/slack-connect-auth-mode-sso
    ;; only gate provisioning on successful authentications: a failure must surface its own error
    (do (when (and (true? (:success? request)) (not user))
          (maybe-throw-user-provisioning (sso-settings/slack-connect-user-provisioning-enabled)))
        (next-method provider request))

    sso-settings/slack-connect-auth-mode-link-only
    ;; In link-only mode, create AuthIdentity for the authenticated user
    ;; but don't create a session or new user
    (if-not (true? (:success? request))
      ;; upstream failures and redirects pass through with their own error intact
      (next-method provider request)
      (let [result (link-slack-identity! provider (:id @authenticated-user) claims)]
        (if (:success? result)
          (assoc request :success? true)
          result)))))

(methodical/defmethod auth-identity/login! :after :provider/slack-connect
  [_provider result]
  (when (:success? result)
    (when-let [user-id (or (some-> result :user :id)
                           (some-> result :authenticated-user deref :id))]
      ;; merge into existing metadata so the :iss stored by OIDC identity linking survives
      (when-let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider provider-name)]
        (auth-identity/merge-metadata! auth-identity
                                       {:signing_secret_version (server.settings/slack-connect-signing-secret-version)}))))
  (if (= sso-settings/slack-connect-auth-mode-link-only (sso-settings/slack-connect-authentication-mode))
    (dissoc result :user)
    result))
