(ns metabase.auth-identity.totp
  "TOTP (Time-based One-Time Password) implementation per RFC 6238/4226.
   Provides functions for generating secrets, computing and validating TOTP codes,
   and managing recovery codes."
  (:require
   [metabase.util.password :as u.password])
  (:import
   (java.security MessageDigest SecureRandom)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)
   (org.apache.commons.codec.binary Base32)))

(set! *warn-on-reflection* true)

(def ^:private ^:const totp-digits
  "Number of digits in a TOTP code."
  6)

(def ^:private ^:const totp-period
  "Time step in seconds for TOTP."
  30)

(def ^:private ^:const totp-window
  "Number of time steps to check in each direction for clock skew tolerance."
  1)

(def ^:private ^:const secret-bytes
  "Number of random bytes for TOTP secret (20 bytes = 160 bits, standard for HMAC-SHA1)."
  20)

(def ^:private ^:const recovery-code-count
  "Number of recovery codes to generate."
  10)

(def ^:private ^:const recovery-code-length
  "Length of each recovery code."
  8)

(def ^:private ^:const recovery-code-chars
  "Characters used in recovery codes."
  "abcdefghijklmnopqrstuvwxyz0123456789")

;;; -------------------------------------------------- Secret Generation --------------------------------------------------

(defn generate-secret
  "Generate a random TOTP secret as a Base32-encoded string."
  ^String []
  (let [random (SecureRandom.)
        buf    (byte-array secret-bytes)]
    (.nextBytes random buf)
    (.encodeToString (Base32.) buf)))

;;; -------------------------------------------------- TOTP Code Computation --------------------------------------------------

(defn- decode-base32
  "Decode a Base32-encoded string to bytes."
  ^bytes [^String s]
  (.decode (Base32.) s))

(defn- time-step
  "Return the current TOTP time step (Unix time / period)."
  (^long []
   (time-step (quot (System/currentTimeMillis) 1000)))
  (^long [^long unix-seconds]
   (quot unix-seconds totp-period)))

(defn- long->bytes
  "Convert a long to an 8-byte big-endian byte array."
  ^bytes [^long n]
  (let [buf (byte-array 8)]
    (doseq [i (range 7 -1 -1)]
      (aset-byte buf (- 7 i) (unchecked-byte (bit-shift-right n (* i 8)))))
    buf))

(defn- hmac-sha1
  "Compute HMAC-SHA1 of `data` using `key-bytes`."
  ^bytes [^bytes key-bytes ^bytes data]
  (let [mac (Mac/getInstance "HmacSHA1")]
    (.init mac (SecretKeySpec. key-bytes "HmacSHA1"))
    (.doFinal mac data)))

(defn- dynamic-truncate
  "RFC 4226 dynamic truncation: extract a 4-byte dynamic binary code from the HMAC result."
  ^long [^bytes hmac-result]
  (let [offset (bit-and (aget hmac-result 19) 0x0f)]
    (bit-and (bit-or (bit-shift-left (bit-and (aget hmac-result offset) 0x7f) 24)
                     (bit-shift-left (bit-and (aget hmac-result (+ offset 1)) 0xff) 16)
                     (bit-shift-left (bit-and (aget hmac-result (+ offset 2)) 0xff) 8)
                     (bit-and (aget hmac-result (+ offset 3)) 0xff))
             0x7fffffff)))

(defn totp-code
  "Generate a TOTP code for the given Base32-encoded `secret` at the given `step`.
   Returns a zero-padded string of `totp-digits` digits."
  ^String [^String secret-b32 ^long step]
  (let [key-bytes   (decode-base32 secret-b32)
        time-bytes  (long->bytes step)
        hmac-result (hmac-sha1 key-bytes time-bytes)
        code        (mod (dynamic-truncate hmac-result)
                         (long (Math/pow 10 totp-digits)))]
    (format (str "%0" totp-digits "d") code)))

;;; -------------------------------------------------- TOTP Validation --------------------------------------------------

(defn- constant-time-equals?
  "Constant-time string comparison to prevent timing attacks."
  [^String a ^String b]
  (MessageDigest/isEqual (.getBytes a "UTF-8") (.getBytes b "UTF-8")))

(defn valid-code?
  "Check if `code` is a valid TOTP code for the given Base32-encoded `secret`.
   Checks the current time step and ±`totp-window` steps for clock skew tolerance."
  [^String secret-b32 ^String code]
  (let [current-step (time-step)]
    (boolean
     (some (fn [offset]
             (constant-time-equals? code (totp-code secret-b32 (+ current-step offset))))
           (range (- totp-window) (inc totp-window))))))

;;; -------------------------------------------------- Recovery Codes --------------------------------------------------

(defn generate-recovery-codes
  "Generate a set of recovery codes. Returns a map with:
   - `:plaintext` — vector of plaintext codes (shown to user once)
   - `:hashed`    — vector of bcrypt-hashed codes (stored in DB)"
  []
  (let [random    (SecureRandom.)
        chars-len (count recovery-code-chars)
        codes     (vec (repeatedly recovery-code-count
                                   (fn []
                                     (apply str (repeatedly recovery-code-length
                                                            #(nth recovery-code-chars (.nextInt random chars-len)))))))]
    {:plaintext codes
     :hashed    (mapv u.password/hash-bcrypt codes)}))

(defn verify-recovery-code
  "Check if `code` matches any of the `hashed-codes`. Returns a map with:
   - `:valid?`    — whether the code matched
   - `:remaining` — the hashed codes with the matched code removed (or unchanged if no match)
   Checks all codes to avoid timing side-channel that could reveal position."
  [^String code hashed-codes]
  (let [results (mapv (fn [hashed] (u.password/bcrypt-verify code hashed)) hashed-codes)
        match-idx (first (keep-indexed (fn [i matched?] (when matched? i)) results))]
    (if match-idx
      {:valid?    true
       :remaining (into (subvec (vec hashed-codes) 0 match-idx)
                        (subvec (vec hashed-codes) (inc match-idx)))}
      {:valid? false :remaining hashed-codes})))

;;; -------------------------------------------------- OTPAuth URI --------------------------------------------------

(defn otpauth-uri
  "Build an otpauth:// URI for QR code generation.
   See: https://github.com/google/google-authenticator/wiki/Key-Uri-Format"
  ^String [^String secret ^String email ^String issuer]
  (format "otpauth://totp/%s:%s?secret=%s&issuer=%s&digits=%d&period=%d"
          (java.net.URLEncoder/encode issuer "UTF-8")
          (java.net.URLEncoder/encode email "UTF-8")
          (java.net.URLEncoder/encode secret "UTF-8")
          (java.net.URLEncoder/encode issuer "UTF-8")
          totp-digits
          totp-period))
