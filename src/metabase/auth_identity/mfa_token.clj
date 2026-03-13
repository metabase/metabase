(ns metabase.auth-identity.mfa-token
  "Short-lived JWT tokens for the MFA verification step during login.
   After a user with TOTP enabled provides valid credentials, they receive an MFA pending token
   instead of a session. This token is then exchanged for a real session after TOTP verification."
  (:require
   [buddy.sign.jwt :as jwt]
   [java-time.api :as t])
  (:import
   (java.security SecureRandom)))

(set! *warn-on-reflection* true)

(def ^:private ^:const mfa-token-expiry-minutes
  "How long an MFA pending token is valid."
  5)

(def ^:private ^:const token-type
  "Token type claim to prevent reuse of other JWTs as MFA tokens."
  "mfa-pending")

(defonce ^:private ^bytes signing-key
  (let [buf (byte-array 32)]
    (.nextBytes (SecureRandom.) buf)
    buf))

(defn create-mfa-token
  "Create a short-lived JWT for MFA verification. Contains the user-id and expires in 5 minutes."
  ^String [user-id]
  (jwt/sign {:user-id user-id
             :type    token-type
             :exp     (t/plus (t/instant) (t/minutes mfa-token-expiry-minutes))}
            signing-key))

(defn verify-mfa-token
  "Verify and decode an MFA pending token. Returns `{:user-id <id>}` on success.
   Throws an exception if the token is invalid, expired, or not an MFA pending token."
  [^String token]
  (let [claims (try
                 (jwt/unsign token signing-key {:leeway 0})
                 (catch Exception e
                   (throw (ex-info "Invalid or expired MFA token"
                                   {:status-code 401}
                                   e))))]
    (when-not (= token-type (:type claims))
      (throw (ex-info "Invalid token type"
                      {:status-code 401
                       :type        (:type claims)})))
    {:user-id (:user-id claims)}))
