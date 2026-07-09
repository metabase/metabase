(ns metabase-enterprise.mfa.gate
  "Login-flow gate for native multi-factor authentication.

  Uses `:feature :none` deliberately: enforcement must not depend on the current token, so a lapsed
  license never silently stops challenging enrolled users. The token instead gates setup — turning
  `mfa-enabled` on and (in later PRs) starting new enrollments.

  Session-issuance coverage, decided per provider (the login! pipeline is the only place
  interactive sessions are minted; API keys and MCP OAuth never pass through it):

  - `:provider/password`, `:provider/ldap` — challenged (a challenge token replaces the session).
  - `:provider/emailed-secret-password-reset` — the password change completes but no session is
    issued for an enrolled user; they go through normal, gated login. Otherwise anyone who can
    trigger a reset email routes around the second factor.
  - `:provider/support-access-grant` — exempt: support sessions are admin-granted, time-boxed, and
    audited, and Metabase staff cannot hold the user's second factor.
  - SSO providers — exempt: the identity provider owns MFA there."
  (:require
   [metabase-enterprise.mfa.challenge :as challenge]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.settings :as mfa.settings]
   [metabase.premium-features.core :refer [defenterprise]]))

(def ^:private challenged-providers
  #{:provider/password :provider/ldap})

(def ^:private session-suppressed-providers
  #{:provider/emailed-secret-password-reset})

(defenterprise apply-mfa-gate
  "Decide whether a successful first-factor login must complete a second factor before a session is
  created. Sets `:mfa-pending?` (which suppresses session creation in the `login!` pipeline) and,
  for challenged providers, attaches a challenge token."
  :feature :none
  [provider login-result]
  (if-not (and (true? (:success? login-result))
               (:user login-result)
               (mfa.settings/mfa-enabled))
    login-result
    (let [user-id (get-in login-result [:user :id])
          method  (when user-id (enrollment/enrolled-method user-id))]
      (cond
        (nil? method)
        login-result

        (contains? challenged-providers provider)
        (assoc login-result
               :success?     :mfa-required
               :mfa-pending? true
               :mfa-required true
               :mfa-method   (name method)
               :mfa-token    (challenge/issue-challenge-token user-id provider))

        (contains? session-suppressed-providers provider)
        (assoc login-result
               :mfa-pending? true
               :mfa-required true)

        :else
        login-result))))
