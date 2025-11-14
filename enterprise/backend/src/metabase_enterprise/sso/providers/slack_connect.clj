(ns metabase-enterprise.sso.providers.slack-connect
  "Slack Connect OIDC authentication provider. Derives from the base OIDC provider
   and adds Slack-specific configuration and claim extraction."
  (:require
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.premium-features.core :as premium-features]
   [metabase.sso.core :as sso]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

(derive :provider/slack-connect :provider/oidc)

;;; -------------------------------------------------- Slack-Specific Utilities --------------------------------------------------

(defn- extract-slack-claims
  "Extract Slack-specific claims from ID token.
   Returns map with Slack team and user information for storage in login_attributes.

   NOTE: team_name is NOT included in Slack ID tokens per research.
   Use team_id only or make additional API call if team name is required."
  [id-token-claims]
  (let [team-id-claim (sso-settings/slack-connect-attribute-team-id)]
    (cond-> {}
      (get id-token-claims team-id-claim)
      (assoc :slack-team-id (get id-token-claims team-id-claim))

      (:sub id-token-claims)
      (assoc :slack-user-id (:sub id-token-claims))

      (get id-token-claims "https://slack.com/team_image_230")
      (assoc :slack-team-image (get id-token-claims "https://slack.com/team_image_230"))

      (:email_verified id-token-claims)
      (assoc :slack-email-verified (:email_verified id-token-claims))

      (:locale id-token-claims)
      (assoc :slack-locale (:locale id-token-claims)))))

(defn- build-slack-oidc-config
  "Build OIDC configuration map for parent provider.
   Uses Slack settings and hardcoded Slack-specific values."
  [request]
  (when (and (sso-settings/slack-connect-client-id)
             (sso-settings/slack-connect-client-secret))
    {:client-id (sso-settings/slack-connect-client-id)
     :client-secret (sso-settings/slack-connect-client-secret)
     :issuer-uri "https://slack.com"
     :scopes ["openid" "profile" "email"]
     :redirect-uri (get request :redirect-uri)}))

(defn- slack-group-names->ids
  "Map Slack group names to Metabase group IDs using slack-connect-group-mappings."
  [slack-group-names]
  (when (and slack-group-names
             (seq slack-group-names))
    (let [mappings (update-keys (sso-settings/slack-connect-group-mappings) name)]
      (reduce (fn [acc group-name]
                (if-let [group-ids (get mappings group-name)]
                  (into acc group-ids)
                  acc))
              #{}
              slack-group-names))))

(defn- all-slack-mapped-group-ids
  "Get all Metabase group IDs that have Slack group mappings."
  []
  (let [mappings (sso-settings/slack-connect-group-mappings)]
    (into #{} (mapcat val mappings))))

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

    (and (= "link-only" (sso-settings/slack-connect-authentication-mode))
         (not (:code request))
         (not (:authenticated-user request)))
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
              (cond-> auth-result
                true
                (assoc-in [:user-data :sso_source] :slack)

                slack-attrs
                (assoc-in [:user-data :login_attributes] slack-attrs)

                slack-attrs
                (assoc :slack-data slack-attrs)))
            auth-result))))))

;;; -------------------------------------------------- Login Implementation --------------------------------------------------

(methodical/defmethod auth-identity/login! :provider/slack-connect
  [provider {:keys [user] :as request}]
  (case (sso-settings/slack-connect-authentication-mode)
    "sso"
    (do (when-not user
          (sso-utils/check-user-provisioning :slack-connect))
        (next-method provider request))

    "link-only" ;; don't call next-method to prevent user creation
    request))

(methodical/defmethod auth-identity/login! :after :provider/slack-connect
  [_provider {:keys [user slack-data] :as result}]
  (let [auth-mode (sso-settings/slack-connect-authentication-mode)]
    (case auth-mode
      "link-only"
      (dissoc result :user)

      "sso"
      (u/prog1 result
        (when (and (sso-settings/slack-connect-group-sync)
                   slack-data
                   (:groups slack-data))
          (let [group-ids (slack-group-names->ids (:groups slack-data))
                all-mapped-ids (all-slack-mapped-group-ids)]
            (sso/sync-group-memberships! user group-ids all-mapped-ids))))

      result)))
