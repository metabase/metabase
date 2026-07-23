(ns metabase.session.challenge
  "Short-lived signed challenge tokens bridging the two steps of an MFA login.

  A challenge token is NOT a session: nothing is written to the session table and no cookie is set
  until the second factor passes. The token is a 5-minute HS256 JWT carrying the user, the
  first-factor provider (so session auth-tracking records it correctly), and a `jti` that is
  consumed on successful verification so one token cannot mint two sessions."
  (:require
   [buddy.sign.jwt :as jwt]
   [metabase.session.settings :as session.settings]
   [metabase.util.log :as log]))

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
            (session.settings/mfa-challenge-signing-key)
            {:alg :hs256}))

(defn verify-challenge-token
  "Verify a challenge token's signature and expiry. Returns its claims map, or nil if
  invalid/expired/tampered. Does NOT consume the `jti` — that happens only on successful
  second-factor verification, so a user can retry codes on the same token."
  [token]
  (try
    (let [claims (jwt/unsign token (session.settings/mfa-challenge-signing-key) {:alg :hs256})]
      (when (= (:purpose claims) "mfa-challenge")
        claims))
    (catch Exception e
      (log/debug e "Invalid MFA challenge token")
      nil)))
