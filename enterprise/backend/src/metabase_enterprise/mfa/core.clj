(ns metabase-enterprise.mfa.core
  "Public API of the mfa module. All cross-boundary entry points live here.

  Consumers outside this module must go through this namespace; they must not require mfa.gate,
  or mfa.settings directly."
  (:require
   [metabase-enterprise.mfa.db :as mfa.db]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.gate :as gate]
   [metabase-enterprise.mfa.settings]
   [metabase-enterprise.mfa.verification :as verification]
   [metabase.channel.email.messages :as messages]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [potemkin :as p]))

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
  consuming it plus the challenge jti.

  Returns the AuthIdentity of the 2nd factor method verified, else nil.

  OSS fallback returns nil — OSS can never have issued a challenge token (the MFA gate lives in
  EE), so this is unreachable in practice."
  :feature :none
  [user-id code jti]
  (verification/verify-attempt! user-id code jti))

(defenterprise start-enrollment!
  "Begin enrollment of a new authenticator for a user who is not currently enrolled, and attempting to log in.
  Only called when the instance is configured to *require* MFA, but this user is not enrolled.

  Precondition: caller must validate that the correct username and password for this `user-id` have been provided.

  Returns a map intended for the `:body` of a response, containing the plaintext `:secret` and the `:otpauth_uri`
  used for the QR code. Returns nil if any conditions fail (e.g. if the user is already enrolled).

  OSS always returns nil, since new enrollments are not allowed without the `:multi-factor-auth` feature."
  :feature :multi-factor-auth
  [user-id]
  (enrollment/start-enrollment! user-id))

(defenterprise confirm-enrollment!
  "Complete enrollment of a new authenticator for a currently pending enrollment. Requires the `user-id` and `code`,
  plus the single-use `jti` from a [[metabase.session.challenge/issue-enrollment-token]].

  On success, marks the enrollment as confirmed, consumes the OTP's time step (so it can't be reused), generates the
  recovery codes, and consumes the `jti` so it can't be reused either.

  Returns a map containing the plaintext recovery codes + the id of the AuthIdentity record which was confirmed,
  or nil if any conditions fail.

  Note that this actually requires the `:multi-factor-auth` feature. [[verify-second-factor!]] above will still verify
  existing OTPs after a downgrade, but we won't allow new enrollments. The OSS counterpart always returns nil."
  :feature :multi-factor-auth
  [user-id code jti]
  (enrollment/confirm-enrollment! user-id code jti))

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
        user-email (mfa.db/user-email user-id)]
    (try
      (messages/send-mfa-login-code-email! user-email code)
      (catch Throwable e
        (log/warnf "Failed to send MFA email OTP: %s" (ex-message e))
        ;; don't tell an unauthenticated caller "the code exists but the email failed"
        (throw (ex-info (tru "Failed to send the sign-in code. Please try again or contact your administrator.")
                        {:status-code 500}))))))

(defenterprise mfa-required?
  "Whether MFA is currently required for all users on the instance"
  :feature :multi-factor-auth
  []
  (metabase-enterprise.mfa.settings/mfa-required?))
