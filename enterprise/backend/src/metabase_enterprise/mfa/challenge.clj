(ns metabase-enterprise.mfa.challenge
  "Short-lived signed challenge tokens bridging the two steps of an MFA login, and the EE-side
  operations those tokens authorize.

  A challenge token is NOT a session: nothing is written to the session table and no cookie is set
  until the second factor passes. The token is a 5-minute HS256 JWT carrying the user, the
  first-factor provider (so session auth-tracking records it correctly), and a `jti` that is
  consumed on successful verification so one token cannot mint two sessions.

  The two `defenterprise` functions here are the EE half of the 'EE judges, OSS mints' split:
  - [[verify-mfa-code]] verifies the second factor and returns a verdict as plain data.
  - [[send-mfa-email-otp!]] sends an emailed one-time code.
  OSS creates the session on success; EE does no session work here."
  (:require
   [buddy.sign.jwt :as jwt]
   [metabase-enterprise.mfa.settings :as mfa.settings]
   [metabase-enterprise.mfa.throttling :as mfa.throttling]
   [metabase-enterprise.mfa.verification :as verification]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.channel.email :as email]
   [metabase.channel.settings :as channel.settings]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ttl-seconds
  "How long a challenge token stays valid. (Consumed `jti`s are retained longer — see
  `enrollment/consume-jti`'s conservative 2-hour window.)"
  (* 5 60))

(defn issue-challenge-token
  "Create a signed token authorizing a second-factor attempt for `user-id`, remembering the
  first-factor `provider`."
  [user-id provider]
  (jwt/sign {:user-id  user-id
             :provider (name provider)
             :purpose  "mfa-challenge"
             :jti      (str (random-uuid))
             :exp      (+ (quot (System/currentTimeMillis) 1000) ttl-seconds)}
            (mfa.settings/mfa-challenge-signing-key)
            {:alg :hs256}))

(defn verify-challenge-token
  "Verify a challenge token's signature and expiry. Returns its claims map, or nil if
  invalid/expired/tampered. Does NOT consume the `jti` — that happens only on successful
  second-factor verification, so a user can retry codes on the same token."
  [token]
  (try
    (let [claims (jwt/unsign token (mfa.settings/mfa-challenge-signing-key) {:alg :hs256})]
      (when (= (:purpose claims) "mfa-challenge")
        claims))
    (catch Exception e
      (log/debug e "Invalid MFA challenge token")
      nil)))

(def ^:private verify-throttlers
  ;; Codes are 6 digits, so brute-force limits are load-bearing. Only failures count (see
  ;; `mfa.throttling`), so 5 wrong codes per user per hour, not 5 logins.
  {:user-id    (throttle/make-throttler :user-id, :attempts-threshold 5)
   :ip-address (throttle/make-throttler :ip-address, :attempts-threshold 50)})

(def ^:private email-otp-send-throttlers
  ;; sending is expensive and spammable — every send counts, much tighter than verification
  {:user-id    (throttle/make-throttler :user-id, :attempts-threshold 3)
   :ip-address (throttle/make-throttler :ip-address, :attempts-threshold 20)})

(defn- invalid-token-ex []
  (ex-info (tru "Authentication session expired. Please log in again.")
           {:status-code 401}))

(defenterprise verify-mfa-code
  "Verify a second-factor `code` (TOTP, recovery, or emailed one-time code) against the `mfa-token`
  challenge issued by `POST /api/session`. Returns `{:user-id ..., :first-factor <provider keyword>}`
  on success; throws 401 otherwise. Only failures are throttled — a legitimately busy user is never
  throttled by their own successful logins."
  :feature :none
  [mfa-token code ip-address]
  (let [claims  (or (verify-challenge-token mfa-token)
                    (throw (invalid-token-ex)))
        {:keys [jti]} claims
        user-id (:user-id claims)
        first-factor (auth-identity/provider-string->keyword (:provider claims))]
    (when-not jti
      (throw (invalid-token-ex)))
    (mfa.throttling/call-with-failure-throttling
     [[(verify-throttlers :ip-address) ip-address]
      [(verify-throttlers :user-id) user-id]]
     (fn []
       (if (verification/verify-attempt! user-id code jti)
         {:user-id      user-id
          :first-factor first-factor}
         (do
           (events/publish-event! :event/mfa-verification-failed
                                  {:object (t2/select-one :model/User :id user-id)})
           (throw (ex-info (tru "Invalid authentication code.")
                           {:status-code 401}))))))))

(defenterprise send-mfa-email-otp!
  "Email a one-time code as a fallback second factor. Requires a valid challenge token from
  `POST /api/session`; a token that already minted a session is rejected (jti consumed). The code
  is single-use with a 10-minute expiry and is accepted by `POST /api/session/mfa/verify`.
  Returns nil on success; throws on error."
  :feature :none
  [mfa-token ip-address]
  (let [claims  (or (verify-challenge-token mfa-token)
                    (throw (invalid-token-ex)))
        {:keys [jti]} claims
        user-id (:user-id claims)]
    ;; a token that already minted a session must not keep sending codes for its remaining TTL
    (when (or (not jti) (verification/jti-consumed? user-id jti))
      (throw (invalid-token-ex)))
    (mfa.throttling/check (email-otp-send-throttlers :ip-address) ip-address)
    (mfa.throttling/check (email-otp-send-throttlers :user-id) user-id)
    (when-not (channel.settings/email-configured?)
      (throw (ex-info (tru "Email is not configured on this instance.")
                      {:status-code 400})))
    (let [code       (or (verification/set-email-otp! user-id)
                         (throw (invalid-token-ex)))
          user-email (t2/select-one-fn :email :model/User :id user-id)]
      (try
        (email/send-message-or-throw!
         {:subject      (tru "Your Metabase sign-in code")
          :recipients   [user-email]
          :message-type :text
          :message      (str (tru "Your one-time sign-in code is: {0}" code)
                             "\n\n"
                             (tru "It expires in 10 minutes. If you didn''t try to sign in, contact your administrator."))})
        (catch Throwable e
          (log/warn e "Failed to send MFA email OTP")
          ;; don't tell an unauthenticated caller "the code exists but the email failed"
          (throw (ex-info (tru "Failed to send the sign-in code. Please try again or contact your administrator.")
                          {:status-code 500})))))))
