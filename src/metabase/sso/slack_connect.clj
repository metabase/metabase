(ns metabase.sso.slack-connect
  (:require
   [metabase.auth-identity.db :as auth-identity.db]
   [metabase.server.settings :as server.settings]
   [metabase.sso.db :as sso.db]
   [metabase.sso.settings :as sso-settings]))

(defn slack-connect-identity-active?
  "Whether Slack Connect is enabled and `identity` was linked under the current signing secret. Missing versions are
  treated as zero."
  [identity]
  (and (some? identity)
       (sso-settings/slack-connect-enabled)
       (= (or (get-in identity [:metadata :signing_secret_version]) 0)
          (server.settings/slack-connect-signing-secret-version))))

(defn slack-account-status
  "Return \"active\" or \"inactive\" for the user's Slack identity, or nil when none exists."
  [user-id]
  (when-let [identity (auth-identity.db/auth-identity-columns {:user-id user-id :provider "slack-connect" :columns [:provider_id :metadata]})]
    (if (slack-connect-identity-active? identity)
      "active"
      "inactive")))

(defn disconnect-slack-account!
  "Remove the Slack link of the user with `user-id`."
  [user-id]
  (sso.db/delete-slack-connect-identity! user-id))
