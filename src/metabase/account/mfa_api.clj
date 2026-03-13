(ns metabase.account.mfa-api
  "API endpoints for managing TOTP-based multi-factor authentication.
   All endpoints require authentication (the user must already be logged in)."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.auth-identity.totp :as totp]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- verify-user-password!
  "Verify the current user's password. Throws 403 if invalid."
  [password]
  (let [{:keys [password_salt]
         hashed-password :password} (t2/select-one [:model/User :password :password_salt]
                                                   :id api/*current-user-id*)]
    (when-not (u.password/verify-password password password_salt hashed-password)
      (throw (ex-info (tru "Invalid password")
                      {:status-code 403
                       :errors      {:password (tru "Invalid password")}})))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/setup"
  "Begin TOTP enrollment. Generates a new secret and recovery codes.
   Requires password confirmation to prevent session-hijacking from escalating to MFA enrollment.
   The secret is stored on the user but TOTP is not yet enabled — call `POST /confirm` to activate."
  [_route-params
   _query-params
   {:keys [password]} :- [:map
                          [:password ms/NonBlankString]]]
  (verify-user-password! password)
  (when (t2/select-one-fn :totp_enabled :model/User :id api/*current-user-id*)
    (throw (ex-info (tru "TOTP is already enabled") {:status-code 400})))
  (let [secret         (totp/generate-secret)
        {:keys [plaintext hashed]} (totp/generate-recovery-codes)
        user           (t2/select-one [:model/User :email] :id api/*current-user-id*)]
    ;; Store the secret and hashed recovery codes, but don't enable TOTP yet
    (t2/update! :model/User api/*current-user-id*
                {:totp_secret         secret
                 :totp_recovery_codes hashed})
    {:secret         secret
     :otpauth_uri    (totp/otpauth-uri secret (:email user) "Metabase")
     :recovery_codes plaintext}))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/confirm"
  "Confirm TOTP enrollment by verifying a code from the authenticator app.
   This activates TOTP for the user's account."
  [_route-params
   _query-params
   {:keys [totp-code]} :- [:map
                           [:totp-code ms/NonBlankString]]]
  (let [secret (t2/select-one-fn :totp_secret :model/User :id api/*current-user-id*)]
    (when-not secret
      (throw (ex-info (tru "Call POST /setup first") {:status-code 400})))
    (when-not (totp/valid-code? secret totp-code)
      (throw (ex-info (tru "Invalid verification code")
                      {:status-code 400
                       :errors {:totp-code (tru "Invalid verification code")}})))
    (t2/update! :model/User api/*current-user-id* {:totp_enabled true})
    {:success true}))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/disable"
  "Disable TOTP for the current user. Requires password confirmation.
   Uses POST instead of DELETE to ensure request body is reliably transmitted
   through proxies and CDNs."
  [_route-params
   _query-params
   {:keys [password]} :- [:map
                          [:password ms/NonBlankString]]]
  (verify-user-password! password)
  (t2/update! :model/User api/*current-user-id*
              {:totp_enabled        false
               :totp_secret         nil
               :totp_recovery_codes nil})
  api/generic-204-no-content)

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/recovery-codes"
  "Regenerate recovery codes. Requires password confirmation.
   Returns new plaintext codes (shown once) and replaces the stored hashed codes."
  [_route-params
   _query-params
   {:keys [password]} :- [:map
                          [:password ms/NonBlankString]]]
  (verify-user-password! password)
  (when-not (t2/select-one-fn :totp_enabled :model/User :id api/*current-user-id*)
    (throw (ex-info (tru "TOTP is not enabled") {:status-code 400})))
  (let [{:keys [plaintext hashed]} (totp/generate-recovery-codes)]
    (t2/update! :model/User api/*current-user-id* {:totp_recovery_codes hashed})
    {:recovery_codes plaintext}))
