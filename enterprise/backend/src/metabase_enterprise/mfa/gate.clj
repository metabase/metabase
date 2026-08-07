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
    ;; Pass through the first factor's `login-result` in two cases:
    ;; 1. First factor login failed
    (not (and (true? (:success? login-result))
              (:user login-result)))                              login-result
    ;; 2. MFA is not enabled at all
    (not (mfa.settings/mfa-enabled?))                             login-result
    ;; 3. First factor does not need MFA (e.g. SSO, Google)
    (and (not (challenged-provider? provider))
         (not (contains? session-suppressed-providers provider))) login-result

    ;; At this point, we could plausibly require an MFA challenge or enrollment.
    :let [user-id (get-in login-result [:user :id])
          method  (when user-id (enrollment/enrolled-method user-id))]

    ;; MFA configured and the provider supports MFA challenges: issue a challenge.
    ;; This signals `login!` not to mint a session yet.
    (and method (challenged-provider? provider))
    (assoc login-result
           :success?         :mfa-required
           :mfa/pending?     true
           :mfa/methods      (available-methods)
           :mfa/first-factor provider)

    ;; If MFA is not enrolled, but not required, pass through the first factor.
    (and (nil? method)
         (not (mfa.settings/mfa-required?)))                      login-result

    ;; If the first factor is a special case (e.g. :provider/emailed-secret-password-reset) we don't log them in
    ;; directly after the new password is accepted, when MFA is in play. Instead, they get redirected to the regular
    ;; login page to re-enter their password and then answer an MFA challenge (or enroll).
    ;; This signals the `login!` flow accordingly.
    (contains? session-suppressed-providers provider)
    (assoc login-result :mfa/pending? true)

    ;; At this point, we know:
    ;; - First factor is a [[challenged-provider?]]
    ;; - User does not have MFA enrolled
    ;; - MFA is enabled
    ;; That leaves two cases.

    ;; 1. If MFA is *required*, they must immediately enroll.
    (mfa.settings/mfa-required?)
    (assoc login-result
           :success?         :mfa-required
           :mfa/pending?     true
           :mfa/enroll?      true
           :mfa/methods      ["totp"]
           :mfa/first-factor provider)

    ;; 2. MFA is enabled, but neither enrolled nor required: regular login.
    :else login-result))
