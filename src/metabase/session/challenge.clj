(ns metabase.session.challenge
  "Short-lived signed challenge tokens bridging the two steps of an MFA login or enrollment.

  A token is NOT a session: nothing is written to the session table and no cookie is set
  until the second factor passes. The token is a 5-minute HS256 JWT carrying the user, the
  first-factor provider (so session auth-tracking records it correctly), and a `jti` that is
  consumed on successful verification so one token cannot mint two sessions."
  (:require
   [buddy.sign.jwt :as jwt]
   [metabase.session.settings :as session.settings]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private challenge-ttl-seconds
  "How long a challenge or enrollment token stays valid. (Consumed `jti`s are retained longer — see
  `enrollment/consume-jti`'s conservative 2-hour window.)"
  (* 5 60))

(defn- create-token
  "Helper for creating signed, single-use JWTs with different `purpose` and TTLs."
  [user-id provider purpose ttl-seconds]
  (jwt/sign {:user-id  user-id
             :provider (name provider)
             :purpose  purpose
             :jti      (str (random-uuid))
             :exp      (+ (quot (System/currentTimeMillis) 1000) ttl-seconds)}
            (session.settings/mfa-challenge-signing-key)
            {:alg :hs256}))

(defn issue-challenge-token
  "Create a signed token authorizing a second-factor attempt for `user-id`, remembering the
  first-factor `provider`."
  [user-id provider]
  (create-token user-id provider "mfa-challenge" challenge-ttl-seconds))

(defn issue-enrollment-token
  "Create a signed token authorizing second-factor enrollment for `user-id`.

  This is used for *unauthenticated* enrollment, when MFA is required and the user has entered their password but does
  not yet have MFA enrolled."
  [user-id provider]
  (create-token user-id provider "mfa-enrollment" challenge-ttl-seconds))

(defn- verify-token
  "Helper for verifying a token's signature, expiry and `purpose`. Returns nil if the token is invalid, expired or
  tampered with, or if the `:purpose` in its claims don't match what we expect.

  Returns the claims map if successful."
  [token expected-purpose]
  (try
    (let [claims (jwt/unsign token (session.settings/mfa-challenge-signing-key) {:alg :hs256})]
      (if (= (:purpose claims) expected-purpose)
        claims
        (log/debugf "Invalid MFA token - unexpected :purpose %s (expected %s)"
                    (:purpose claims) expected-purpose)))
    (catch Exception e
      (log/debug e "Invalid MFA token")
      nil)))

;; NOTE: The `:purpose` claim checked by these verifiers is a critical check! If a `mfa-challenge` token were
;; accepted by the enrollment API, an attacker with the password but not the MFA could bypass an existing MFA by
;; using the challenge token to instead enroll their own authenticator instead.
(defn verify-challenge-token
  "Verify an `mfa-challenge` token's signature and expiry. Returns its claims map, or nil if
  invalid/expired/tampered. Does NOT consume the `jti` — that happens only on successful
  second-factor verification, so a user can retry codes on the same token."
  [token]
  (verify-token token "mfa-challenge"))

(defn verify-enrollment-token
  "Verify an `mfa-enrollment` token's signature and expiry. Returns its claims map, or nil if
  invalid/expired/tampered. Does NOT consume the `jti` — that happens only on successful
  second-factor verification, so a user can retry codes on the same token."
  [token]
  (verify-token token "mfa-enrollment"))
