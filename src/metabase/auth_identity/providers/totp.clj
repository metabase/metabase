(ns metabase.auth-identity.providers.totp
  "Native TOTP (authenticator-app) second-factor provider.

  Unlike first-factor providers it is never reached via `login!` directly; the two-step login API
  calls `authenticate` after the first factor has succeeded and a valid challenge token has been
  presented."
  (:require
   [metabase.auth-identity.provider :as provider]
   [metabase.auth-identity.totp :as totp]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(derive :provider/totp :metabase.auth-identity.provider/provider)

(methodical/defmethod provider/authenticate :provider/totp
  "Verify a TOTP `:code` for `:user-id`. Succeeds only for a confirmed enrollment."
  [_provider {:keys [user-id code]}]
  (try
    (if-let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "totp")]
      (let [secret (some-> (get-in auth-identity [:credentials :secret]) encryption/maybe-decrypt)]
        (if (and secret
                 (get-in auth-identity [:credentials :confirmed_at])
                 (totp/valid-code? secret code))
          {:success? true :user-id user-id :auth-identity auth-identity}
          {:success? false :error :invalid-credentials :message "Invalid authentication code."}))
      {:success? false :error :no-auth-identity :message "Two-factor authentication is not set up for this account."})
    (catch Exception e
      (log/error e "Error verifying TOTP code")
      {:success? false :error :server-error :message "An unexpected error occurred verifying the code."})))
