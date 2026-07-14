(ns metabase-enterprise.mfa.core
  "Public API of the mfa module. All cross-boundary entry points live here.

  Consumers outside this module must go through this namespace; they must not require mfa.gate,
  or mfa.settings directly."
  (:require
   [metabase-enterprise.mfa.gate :as gate]
   [metabase-enterprise.mfa.settings]
   [metabase-enterprise.mfa.verification :as verification]
   [metabase.channel.email.messages :as messages]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [potemkin :as p]
   [toucan2.core :as t2]))

(comment metabase-enterprise.mfa.settings/keep-me)

(p/import-vars
 [metabase-enterprise.mfa.settings
  mfa-enforcement
  mfa-enabled?])

(defenterprise apply-mfa-gate
  "Decide whether a successful first-factor login must complete a second factor before a session is
  created. Sets `:mfa/pending?` (which suppresses session creation in the `login!` pipeline) and,
  for challenged providers, attaches `:mfa/first-factor` and `:mfa/methods` so the OSS session API can
  sign the relay token.

  Uses `:feature :none` deliberately: enforcement must not depend on the current token, so a lapsed
  license never silently stops challenging enrolled users. The token instead gates setup — setting
  `mfa-enforcement` to a non-`:off` value and (in later PRs) starting new enrollments."
  :feature :none
  [provider login-result]
  (gate/apply-mfa-gate provider login-result))

(defenterprise verify-second-factor!
  "Verify a second-factor code (TOTP, recovery, or emailed one-time code) for user-id, atomically
  consuming it plus the challenge jti. Returns boolean.

  OSS fallback returns false — OSS can never have issued a challenge token (the MFA gate lives in
  EE), so this is unreachable in practice."
  :feature :none
  [user-id code jti]
  (verification/verify-attempt! user-id code jti))

(defenterprise send-mfa-email-otp!
  "Generate + email a one-time fallback code for user-id's confirmed enrollment; rejects a jti that
  already minted a session.

  OSS fallback throws (unreachable, as above)."
  :feature :none
  [user-id jti]
  ;; a token that already minted a session must not keep sending codes for its remaining TTL
  (when (verification/jti-consumed? user-id jti)
    (throw (ex-info (tru "Authentication session expired. Please log in again.")
                    {:status-code 401})))
  (let [code       (or (verification/set-email-otp! user-id)
                       ;; nil = no confirmed enrollment — same message, no oracle semantics
                       (throw (ex-info (tru "Authentication session expired. Please log in again.")
                                       {:status-code 401})))
        user-email (t2/select-one-fn :email :model/User :id user-id)]
    (try
      (messages/send-mfa-login-code-email! user-email code)
      (catch Throwable e
        (log/warn e "Failed to send MFA email OTP")
        ;; don't tell an unauthenticated caller "the code exists but the email failed"
        (throw (ex-info (tru "Failed to send the sign-in code. Please try again or contact your administrator.")
                        {:status-code 500}))))))
