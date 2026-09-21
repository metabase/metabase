(ns metabase-enterprise.mfa.totp
  "RFC 6238 TOTP (time-based one-time password) primitives for native MFA.

  Deliberately has no third-party TOTP dependency: HMAC comes from `buddy-core` and Base32 secret
  encoding from Apache Commons Codec, both already on the classpath. Codes are SHA1 / 6-digit /
  30-second period, which is what Google Authenticator, 1Password, Authy, etc. default to.

  Validation accepts a ±1 time-step window. RFC 6238 §5.2 recommends tolerating only *earlier*
  steps (network delay); we also accept one step ahead so clients whose clock runs slightly fast
  can still log in, which is the norm among large providers. Replay protection (callers reject any
  step at or before the last accepted one — see `metabase-enterprise.mfa.enrollment`) caps the
  exposure this adds."
  (:require
   [buddy.core.mac :as mac]
   [clojure.string :as str]
   [metabase.util :as u])
  (:import
   (java.net URLEncoder)
   (java.nio ByteBuffer)
   (java.security MessageDigest SecureRandom)
   (org.apache.commons.codec.binary Base32)))

(set! *warn-on-reflection* true)

(def ^:private ^:const time-step-seconds 30)
(def ^:private ^:const num-digits 6)
(def ^:private ^:const modulo 1000000) ; 10^num-digits
;; 160-bit secret, the size RFC 4226 recommends for HMAC-SHA1.
(def ^:private ^:const secret-num-bytes 20)

(defn generate-secret
  "Generate a new random Base32-encoded TOTP secret (uppercase, unpadded), suitable for an
  `otpauth://` URI / QR code."
  ^String []
  (let [bytes (byte-array secret-num-bytes)]
    (.nextBytes (SecureRandom.) bytes)
    (-> (.encodeToString (Base32.) bytes)
        (str/replace "=" ""))))

(defn- decode-secret ^bytes [^String secret]
  (.decode (Base32.) (u/upper-case-en secret)))

(defn- counter->bytes ^bytes [^long counter]
  (-> (ByteBuffer/allocate 8) (.putLong counter) .array))

(defn- hotp
  "HOTP value (RFC 4226) for Base32 `secret` and integer `counter`."
  ^long [^String secret ^long counter]
  (let [^bytes hs (mac/hash (counter->bytes counter) {:key (decode-secret secret) :alg :hmac+sha1})
        offset    (int (bit-and (aget hs (dec (alength hs))) 0xf))
        binary    (bit-or (bit-shift-left (bit-and (long (aget hs offset))         0x7f) 24)
                          (bit-shift-left (bit-and (long (aget hs (inc offset)))   0xff) 16)
                          (bit-shift-left (bit-and (long (aget hs (+ offset 2)))   0xff) 8)
                          (bit-and (long (aget hs (+ offset 3))) 0xff))]
    (mod binary modulo)))

(defn- format-code ^String [^long code]
  (format (str "%0" num-digits "d") code))

(defn current-time-step
  "The current 30-second time-step counter."
  []
  (quot (quot (System/currentTimeMillis) 1000) time-step-seconds))

(defn code-for-unix-time
  "TOTP code for `secret` at a given absolute `unix-seconds`. Exposed mainly for deterministic tests."
  ^String [^String secret ^long unix-seconds]
  (format-code (hotp secret (quot unix-seconds time-step-seconds))))

(defn generate-code
  "Current TOTP code for `secret` (for tests and enrollment-confirmation helpers)."
  ^String [^String secret]
  (code-for-unix-time secret (quot (System/currentTimeMillis) 1000)))

(defn- code-matches-step?
  "Constant-time comparison of `code` against the TOTP for `secret` at `step`."
  [^String secret ^String code ^long step]
  ;; the ^String call-site hint is load-bearing: format-code's return hint is lost through its
  ;; primitive-arg (^long) signature, leaving a reflective .getBytes on every comparison
  (MessageDigest/isEqual (.getBytes ^String (format-code (hotp secret step)) "UTF-8")
                         (.getBytes code "UTF-8")))

(defn matching-time-step
  "The time step whose TOTP code for `secret` equals `code`, searching the current step and one step
  either side. Returns nil when nothing matches. Callers enforcing one-time use (RFC 6238 §5.2)
  compare the returned step against the last accepted one."
  [^String secret code]
  (when (and secret (string? code) (re-matches #"\d{6}" code))
    (let [now (current-time-step)]
      (some (fn [^long step]
              (when (code-matches-step? secret code step)
                step))
            [(dec now) now (inc now)]))))

(defn valid-code?
  "True if `code` matches the TOTP for `secret` within the validation window. Use
  [[matching-time-step]] instead wherever replay protection applies."
  [^String secret code]
  (some? (matching-time-step secret code)))

(defn otpauth-uri
  "Build an `otpauth://totp/...` URI for QR-code enrollment."
  ^String [{:keys [issuer account secret]}]
  ;; URLEncoder form-encodes spaces as "+", which authenticator apps display literally
  ;; ("Acme+Analytics"); otpauth URIs need percent-encoding.
  (let [enc (fn [s] (str/replace (URLEncoder/encode (str s) "UTF-8") "+" "%20"))]
    (format "otpauth://totp/%s:%s?secret=%s&issuer=%s&digits=%d&period=%d"
            (enc issuer) (enc account) secret (enc issuer) num-digits time-step-seconds)))
