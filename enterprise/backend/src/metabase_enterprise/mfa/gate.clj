(ns metabase-enterprise.mfa.gate
  "Login-flow gate for native multi-factor authentication.

  Session-issuance coverage, decided per provider (the login! pipeline is the only place
  interactive sessions are minted; API keys and MCP OAuth never pass through it):

  - `:provider/password`, `:provider/ldap` — challenged (the OSS session API signs the relay token
    from :mfa/first-factor; no token is issued here).
  - `:provider/emailed-secret-password-reset` — the password change completes but no session is
    issued for an enrolled user; they go through normal, gated login. Otherwise anyone who can
    trigger a reset email routes around the second factor.
  - `:provider/support-access-grant` — exempt: support sessions are admin-granted, time-boxed, and
    audited, and Metabase staff cannot hold the user's second factor.
  - SSO providers — exempt: the identity provider owns MFA there."
  (:require
   [better-cond.core :as b]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.settings :as mfa.settings]
   [metabase.channel.settings :as channel.settings]))

(set! *warn-on-reflection* true)

(defn- available-methods
  "Second-factor methods the challenge UI may offer. Email OTP is a fallback to TOTP, advertised
  only when the instance can actually send email."
  []
  (cond-> ["totp"]
    (channel.settings/email-configured?) (conj "email")))

(defn- challenged-provider?
  [provider]
  (isa? provider :metabase.auth-identity.provider/supports-mfa))

(def ^:private session-suppressed-providers
  #{:provider/emailed-secret-password-reset})

(defn apply-mfa-gate
  "Decide whether a successful first-factor login must complete a second factor before a session is created.

  - If the login was not successful, return it directly.
  - Transparent if MFA is disabled (`:off`); just returns the initial login result.
  - If this user is enrolled in MFA, signals that MFA is required to complete log-in:
      - Sets `:mfa/pending?`, which suppresses creating a session in the `login!` pipeline.
      - Attaches `:mfa/first-factor` to the `:provider/*` keyword used for the initial login.
      - Attaches `:mfa/methods` giving a list of second factor approaches this user and instance can support.
  - If MFA is *required* but this user is not enrolled yet, signals that MFA must be enrolled immediately to log in:
      - Sets `:mfa/pending?` and `:mfa/first-factor` as above.
      - Sets `:mfa/enroll? true` as well.
      - `:mfa/methods` is hard-coded to `\"totp\"`, since that's the method we want to configure, and we don't want to
        fall back to email here."
  [provider login-result]
  (b/cond
    ;; Unsuccessful login: just return the error.
    (not (and (true? (:success? login-result))
              (:user login-result)))             login-result

    ;; MFA disabled: return the first factor's `login-result`.
    (not (mfa.settings/mfa-enabled?))            login-result

    :let [user-id (get-in login-result [:user :id])
          method  (when user-id (enrollment/enrolled-method user-id))]

    ;; Unenrolled and MFA is *required*! Signal to `login!` that enrollment is required, and prevent it minting a
    ;; session for now.
    (and (nil? method)
         (mfa.settings/mfa-required?))
    (assoc login-result
           :success?         :mfa-required
           :mfa/pending?     true
           :mfa/enroll?      true
           :mfa/methods      ["totp"]
           :mfa/first-factor provider)

    ;; Unenrolled, but MFA is optional: just return the first factor's `login-result`.
    (nil? method) login-result

    ;; First factor needs an MFA challenge and MFA is enrolled: Signal `login!` to require MFA and not mint a session.
    (challenged-provider? provider)
    (assoc login-result
           :success?         :mfa-required
           :mfa/pending?     true
           :mfa/methods      (available-methods)
           :mfa/first-factor provider)

    ;; First factor is a special case that requires a fresh login with a different provider. Signal that no session
    ;; should be minted; the FE will redirect to a regular login.
    ;; This is intended for flows like `:provider/emailed-secret-password-reset`, which needs a full login when MFA
    ;; is enrolled, rather than directly logging the user in on a successful password reset.
    (contains? session-suppressed-providers provider)
    (assoc login-result
           :mfa/pending? true)

    ;; Fallback: accept the first factor (e.g. SSO) by itself without an MFA challenge, even though MFA is configured.
    ;; For example, if you have a password and MFA but also have Google OAuth, Google logins are accepted without a
    ;; Metabase OTP. (Set up your Google Workspace to require MFA and rely on that.)
    :else login-result))
