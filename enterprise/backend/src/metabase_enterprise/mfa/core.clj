(ns metabase-enterprise.mfa.core
  "Public API of the mfa module. All cross-boundary entry points live here.

  Consumers outside this module must go through this namespace; they must not require mfa.gate,
  mfa.challenge, or mfa.settings directly."
  (:require
   [metabase-enterprise.mfa.challenge :as challenge]
   [metabase-enterprise.mfa.gate :as gate]
   [metabase-enterprise.mfa.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [potemkin :as p]))

(comment metabase-enterprise.mfa.settings/keep-me)

(p/import-vars
 [metabase-enterprise.mfa.settings
  mfa-enabled])

(defenterprise apply-mfa-gate
  "Decide whether a successful first-factor login must complete a second factor before a session is
  created. Sets `:mfa-pending?` (which suppresses session creation in the `login!` pipeline) and,
  for challenged providers, attaches a challenge token.

  Uses `:feature :none` deliberately: enforcement must not depend on the current token, so a lapsed
  license never silently stops challenging enrolled users. The token instead gates setup — turning
  `mfa-enabled` on and (in later PRs) starting new enrollments."
  :feature :none
  [provider login-result]
  (gate/apply-mfa-gate provider login-result))

(defenterprise verify-mfa-code
  "Verify a second-factor `code` (TOTP, recovery, or emailed one-time code) against the `mfa-token`
  challenge issued by `POST /api/session`. Returns `{:user-id ..., :first-factor <provider keyword>}`
  on success; throws 401 otherwise.

  The OSS fallback always throws: OSS can never have issued a challenge token (MFA gate lives in EE),
  so this path is unreachable without EE present."
  :feature :none
  [mfa-token code ip-address]
  (challenge/verify-mfa-code mfa-token code ip-address))

(defenterprise send-mfa-email-otp!
  "Email a one-time code as a fallback second factor. Requires a valid challenge token from
  `POST /api/session`; a token that already minted a session is rejected (jti consumed). The code
  is single-use with a 10-minute expiry and is accepted by `POST /api/session/mfa/verify`.
  Returns nil on success; throws on error.

  The OSS fallback always throws: OSS can never have issued a challenge token (MFA gate lives in EE),
  so this path is unreachable without EE present."
  :feature :none
  [mfa-token ip-address]
  (challenge/send-mfa-email-otp! mfa-token ip-address))
