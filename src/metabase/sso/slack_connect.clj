(ns metabase.sso.slack-connect
  (:require
   [metabase.server.settings :as server.settings]
   [metabase.sso.db :as sso.db]
   [metabase.sso.settings :as sso-settings]))

(defn slack-connect-identity-current?
  "Whether `identity` was linked under the current signing secret. Missing versions are treated as zero."
  [identity]
  (and (some? identity)
       (= (or (get-in identity [:metadata :signing_secret_version]) 0)
          (server.settings/slack-connect-signing-secret-version))))

(defn slack-account-status
  "Return \"active\" or \"inactive\" for the user's Slack identity, or nil when none exists."
  [user-id]
  (when-let [identity (sso.db/slack-connect-identity user-id)]
    (if (and (sso-settings/slack-connect-enabled)
             (slack-connect-identity-current? identity))
      "active"
      "inactive")))

(defn disconnect-slack-account!
  "Remove every Slack link for the Slack account linked to `user-id`."
  [user-id]
  (when-let [slack-user-id (:provider_id (sso.db/slack-connect-identity user-id))]
    (sso.db/delete-slack-connect-identities! slack-user-id)))
