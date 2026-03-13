(ns metabase.auth-identity.mfa-token
  "Short-lived JWT tokens for the MFA verification step during login.
   After a user with TOTP enabled provides valid credentials, they receive an MFA pending token
   instead of a session. This token is then exchanged for a real session after TOTP verification."
  (:require
   [buddy.sign.jwt :as jwt]
   [java-time.api :as t]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log])
  (:import
   (java.security SecureRandom)
   (java.util.concurrent ConcurrentHashMap)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)))

(set! *warn-on-reflection* true)

(def ^:private ^:const mfa-token-expiry-minutes
  "How long an MFA pending token is valid."
  5)

(def ^:private ^:const token-type
  "Token type claim to prevent reuse of other JWTs as MFA tokens."
  "mfa-pending")

(defn- derive-signing-key
  "Derive a 32-byte signing key from the encryption secret via HMAC-SHA256.
   Falls back to a random key if no encryption secret is configured."
  ^bytes []
  (if (encryption/default-encryption-enabled?)
    (let [mac (Mac/getInstance "HmacSHA256")
          ;; Use a fixed context string to derive the MFA-specific key
          context (.getBytes "metabase-mfa-signing-key" "UTF-8")]
      (.init mac (SecretKeySpec. (encryption/default-secret-key-hashed) "HmacSHA256"))
      (.doFinal mac context))
    (do
      (log/warn "MB_ENCRYPTION_SECRET_KEY is not set; MFA signing key is instance-local."
                "MFA tokens will not be portable across instances.")
      (let [buf (byte-array 32)]
        (.nextBytes (SecureRandom.) buf)
        buf))))

(defonce ^:private ^bytes signing-key
  (derive-signing-key))

;; Track consumed token JTIs to enforce single-use. Values are expiry instants for cleanup.
;; NOTE: This is an in-memory store, so single-use enforcement is per-instance. Given the
;; 5-minute token expiry, the replay window in multi-instance deployments is small.
(defonce ^:private ^ConcurrentHashMap consumed-tokens
  (ConcurrentHashMap.))

(defn- cleanup-expired-tokens!
  "Remove expired entries from the consumed-tokens map."
  []
  (let [now (t/instant)]
    (doseq [^java.util.Map$Entry entry (.entrySet consumed-tokens)]
      (when (t/before? (.getValue entry) now)
        (.remove consumed-tokens (.getKey entry))))))

(defn create-mfa-token
  "Create a short-lived JWT for MFA verification. Contains the user-id and expires in 5 minutes.
   Each token has a unique `jti` claim to enforce single-use."
  ^String [user-id]
  (jwt/sign {:user-id user-id
             :type    token-type
             :jti     (str (random-uuid))
             :exp     (t/plus (t/instant) (t/minutes mfa-token-expiry-minutes))}
            signing-key))

(defn verify-mfa-token
  "Verify and decode an MFA pending token. Returns `{:user-id <id>}` on success.
   Throws an exception if the token is invalid, expired, already used, or not an MFA pending token.
   Each token can only be verified once (single-use enforcement via `jti` claim)."
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
    ;; Enforce single-use via jti
    (let [jti (:jti claims)]
      (when-not jti
        (throw (ex-info "MFA token missing jti claim"
                        {:status-code 401})))
      (when (.putIfAbsent consumed-tokens jti
                          (t/plus (t/instant) (t/minutes (inc mfa-token-expiry-minutes))))
        (throw (ex-info "MFA token has already been used"
                        {:status-code 401})))
      ;; Periodically clean up expired entries
      (cleanup-expired-tokens!))
    {:user-id (:user-id claims)}))
