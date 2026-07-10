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

(def ^:private challenged-providers
  #{:provider/password :provider/ldap})

(def ^:private session-suppressed-providers
  #{:provider/emailed-secret-password-reset})

(defn apply-mfa-gate
  "Decide whether a successful first-factor login must complete a second factor before a session is
  created. Sets `:mfa/pending?` (which suppresses session creation in the `login!` pipeline) and,
  for challenged providers, attaches `:mfa/first-factor` (the provider keyword) and `:mfa/methods` so
  the OSS session API can sign the relay token."
  [provider login-result]
  (if-not (and (true? (:success? login-result))
               (:user login-result)
               (mfa.settings/mfa-enabled?))
    login-result
    (let [user-id (get-in login-result [:user :id])
          method  (when user-id (enrollment/enrolled-method user-id))]
      (cond
        (nil? method)
        login-result

        (contains? challenged-providers provider)
        (assoc login-result
               :success?         :mfa-required
               :mfa/pending?     true
               :mfa/methods      (available-methods)
               :mfa/first-factor provider)

        (contains? session-suppressed-providers provider)
        (assoc login-result
               :mfa/pending? true)

        :else
        login-result))))
