(ns metabase-enterprise.sso.providers.slack-connect
  "Slack Connect OIDC authentication provider. Derives from the base OIDC provider
   and adds Slack-specific configuration and claim extraction."
  (:require
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.premium-features.core :as premium-features]
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
     :client-secret (sso-settings/slack-connect-client-secret)
     :issuer-uri slack-issuer-uri
     :scopes ["openid" "profile" "email"]
     :redirect-uri (get request :redirect-uri)}))

;;; -------------------------------------------------- Authentication Implementation --------------------------------------------------

(methodical/defmethod auth-identity/authenticate :provider/slack-connect
  [_provider request]
  (cond
    (not (premium-features/enable-sso-slack?))
    {:success? false
     :error :feature-not-available
     :message (tru "Slack Connect authentication is not available on your plan")}

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

(defn- create-auth-identity-for-link!
  "Create an AuthIdentity record linking an authenticated user to their Slack identity.
   Used in link-only mode where we don't create users or sessions."
  [user-id provider-id]
  (when (and user-id provider-id)
    (when-not (t2/exists? :model/AuthIdentity
                          :user_id user-id
                          :provider provider-name)
      (t2/insert! :model/AuthIdentity
                  {:user_id user-id
                   :provider provider-name
                   :provider_id provider-id}))))

(methodical/defmethod auth-identity/login! :provider/slack-connect
  [provider {:keys [user authenticated-user user-data] :as request}]
  (condp = (sso-settings/slack-connect-authentication-mode)
    sso-settings/slack-connect-auth-mode-sso
    (do (when-not user
          (sso-utils/check-user-provisioning (keyword provider-name)))
        (next-method provider request))

    sso-settings/slack-connect-auth-mode-link-only
    ;; In link-only mode, create AuthIdentity for the authenticated user
    ;; but don't create a session or new user
    (do
      (create-auth-identity-for-link! (:id @authenticated-user) (:provider-id user-data))
      (assoc request :success? true))))

(methodical/defmethod auth-identity/login! :after :provider/slack-connect
  [_provider result]
  (if (= sso-settings/slack-connect-auth-mode-link-only (sso-settings/slack-connect-authentication-mode))
    (dissoc result :user)
    result))
