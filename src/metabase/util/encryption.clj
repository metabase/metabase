(ns metabase.util.encryption
  "Utility functions for encrypting and decrypting strings using AES256 CBC + HMAC SHA512 and the
  `MB_ENCRYPTION_SECRET_KEY` env var.

  You can generate a new key with something like

  ```clj
  (let [ba (byte-array 32)
        _  (.nextBytes (java.security.SecureRandom.) ba)
        k  (codecs/bytes->b64-str ba)]
    (alter-var-root #'env/env assoc :mb-encryption-secret-key k)
    k)
  ```"
  (:require
   [buddy.core.bytes :as bytes]
   [buddy.core.codecs :as codecs]
   [buddy.core.crypto :as crypto]
   [buddy.core.kdf :as kdf]
   [buddy.core.mac :as mac]
   [buddy.core.nonce :as nonce]
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [ring.util.codec :as codec])
  (:import (java.io ByteArrayInputStream InputStream SequenceInputStream)
           (javax.crypto Cipher CipherInputStream)
           (javax.crypto.spec SecretKeySpec IvParameterSpec)))

(set! *warn-on-reflection* true)

(def ^:private ^:const aes-streaming-spec "AES/CBC/PKCS5Padding")

(defn secret-key->hash
  "Generate a 64-byte byte array hash of `secret-key` using 100,000 iterations of PBKDF2+SHA512."
  ^bytes [^String secret-key]
  (kdf/get-bytes (kdf/engine {:alg        :pbkdf2+sha512
                              :key        secret-key
                              :iterations 100000}) ; 100,000 iterations takes about ~160ms on my laptop
                 64))

(defn validate-and-hash-secret-key
  "Check the minimum length of the key and hash it for internal usage. Returns nil for a blank key. `env-var-name` names
  the source in the length-assertion message."
  ([^String secret-key]
   (validate-and-hash-secret-key secret-key "MB_ENCRYPTION_SECRET_KEY"))
  ([^String secret-key env-var-name]
   (when-let [secret-key secret-key]
     (when (seq secret-key)
       (assert (>= (count secret-key) 16)
               (str (trs "{0} must be at least 16 characters." env-var-name)))
       (secret-key->hash secret-key)))))

;; apparently if you're not tagging in an arglist, `^bytes` will set the `:tag` metadata to `clojure.core/bytes` (ick)
;; so you have to do `^{:tag 'bytes}` instead
;;
;; TODO -- we should probably put a watch on `env/env` so if it changes this gets recaclulated as needed... or just make
;; it a memoized function or something
(defonce ^:private ^{:tag 'bytes} default-secret-key
  (validate-and-hash-secret-key (env/env :mb-encryption-secret-key)))

;;; ---------------------------------------------------------------------------
;;; Keyed HMAC signing of stored values
;;; ---------------------------------------------------------------------------

;; validated eagerly at load so a misconfigured secret fails at startup rather than on the first request
(defonce ^:private ^{:tag 'bytes} default-hmac-signing-secret
  (let [dedicated (env/env :mb-session-hash-secret-key)]
    (if-not (str/blank? dedicated)
      (do (assert (>= (count dedicated) 16)
                  (str (trs "MB_SESSION_HASH_SECRET_KEY must be at least 16 characters.")))
          (secret-key->hash dedicated))
      ;; nil for a nil/blank encryption key; a too-short one already failed the load-time assert above
      (validate-and-hash-secret-key (env/env :mb-encryption-secret-key)))))

(defn hmac-signing-secret
  "Server-side secret used to keyed-hash stored values. Read from `MB_SESSION_HASH_SECRET_KEY`,
  falling back to `MB_ENCRYPTION_SECRET_KEY`. Nil when neither is set."
  ^bytes []
  default-hmac-signing-secret)

;; Length-prefix each stringified part ("<byte-count>:<utf8-bytes>") so the encoding is unambiguous:
;; distinct part lists always map to distinct bytes.
(defn- sig-input-bytes ^bytes [parts]
  (let [out (java.io.ByteArrayOutputStream.)]
    (doseq [p parts]
      (let [^bytes b      (.getBytes (str p) java.nio.charset.StandardCharsets/UTF_8)
            ^bytes prefix (.getBytes (str (alength b) ":") java.nio.charset.StandardCharsets/UTF_8)]
        (.write out prefix 0 (alength prefix))
        (.write out b 0 (alength b))))
    (.toByteArray out)))

(defn hmac-signature
  "Hex HMAC-SHA512 of `parts` (each stringified and length-prefixed) keyed by [[hmac-signing-secret]].
  Nil when no secret is configured. Use on the write path and to backfill existing rows."
  ^String [& parts]
  (when-let [secret (hmac-signing-secret)]
    (codecs/bytes->hex (mac/hash (sig-input-bytes parts) {:key secret :alg :hmac+sha512}))))

(defn hmac-signature-valid?
  "Constant-time check that hex `signature` matches an HMAC over `parts`. When no secret is configured
  the check is a no-op that returns true, so instances without a key are not locked out."
  [signature & parts]
  (if-let [secret (hmac-signing-secret)]
    (boolean
     (when (seq signature)
       (u/ignore-exceptions
         (mac/verify (sig-input-bytes parts)
                     (codecs/hex->bytes signature)
                     {:key secret :alg :hmac+sha512}))))
    true))

(defn default-encryption-enabled?
  "Is the `MB_ENCRYPTION_SECRET_KEY` set, enabling encryption?"
  []
  (boolean default-secret-key))

;; log a nice message letting people know whether DB details encryption is enabled
(when-not *compile-files*
  (log/info
   (if default-secret-key
     "Saved credentials encryption is ENABLED for this Metabase instance."
     "Saved credentials encryption is DISABLED for this Metabase instance.")
   (u/emoji (if default-secret-key "🔐" "🔓"))
   "\n"
   "For more information, see https://metabase.com/docs/latest/operations-guide/encrypting-database-details-at-rest.html"))

(defn encrypt-bytes
  "Encrypt bytes `b` using a `secret-key` (a 64-byte byte array), by default is the hashed value of
  `MB_ENCRYPTION_SECRET_KEY`."
  {:added "0.41.0"}
  (^String [^bytes b]
   (encrypt-bytes default-secret-key b))
  (^String [^String secret-key, ^bytes b]
   (let [initialization-vector (nonce/random-bytes 16)]
     (->> (crypto/encrypt b
                          secret-key
                          initialization-vector
                          {:algorithm :aes256-cbc-hmac-sha512})
          (concat initialization-vector)
          byte-array))))

(defn encrypt
  "Encrypt string `s` as hex bytes using a `secret-key` (a 64-byte byte array), which by default is the hashed value of
  `MB_ENCRYPTION_SECRET_KEY`."
  (^String [^String s]
   (encrypt default-secret-key s))
  (^String [^String secret-key, ^String s]
   (->> (codecs/to-bytes s)
        (encrypt-bytes secret-key)
        codec/base64-encode)))

(defn decrypt-bytes
  "Decrypt bytes `b` using a `secret-key` (a 64-byte byte array), which by default is the hashed value of
  `MB_ENCRYPTION_SECRET_KEY`."
  {:added "0.41.0"}
  (^String [^bytes b]
   (decrypt-bytes default-secret-key b))
  (^String [secret-key, ^bytes b]
   (let [[initialization-vector message] (split-at 16 b)]
     (crypto/decrypt (byte-array message)
                     secret-key
                     (byte-array initialization-vector)
                     {:algorithm :aes256-cbc-hmac-sha512}))))

(defn encrypt-stream
  "Wraps a plaintext input stream into an input stream that encrypts it using AES256 CBC.
  The encryption format is slightly different for streams vs. fixed length data"
  {:added "0.53.0"}
  (^InputStream [^InputStream input-stream]
   (encrypt-stream default-secret-key input-stream))
  (^InputStream [secret-key ^InputStream input-stream]
   (let [spec aes-streaming-spec
         spec-header (codecs/to-bytes (format "%-32s" spec))
         cipher (Cipher/getInstance spec)
         iv (nonce/random-bytes 16)]
     (.init cipher Cipher/ENCRYPT_MODE (SecretKeySpec. (bytes/slice secret-key 32 64) "AES") (IvParameterSpec. iv))
     (SequenceInputStream. (ByteArrayInputStream. (bytes/concat spec-header iv)) (CipherInputStream. input-stream cipher)))))

(defn encrypt-for-stream
  "Encrypts a byte-array in a way that can be used to read it with decrypt-stream instead of decrypt."
  {:added "0.53.0"}
  (^bytes [^bytes input]
   (encrypt-for-stream default-secret-key input))
  (^bytes [secret-key ^bytes input]
   (with-open [encrypted (encrypt-stream secret-key (ByteArrayInputStream. input))]
     (.readAllBytes encrypted))))

(defn maybe-decrypt-stream
  "Wraps a possibly-encrypted input stream into a new input stream that decrypts it if necessary."
  {:added "0.53.0"}
  (^InputStream [^InputStream input-stream]
   (maybe-decrypt-stream default-secret-key input-stream))
  (^InputStream [secret-key ^InputStream input-stream]
   (let [spec-array (byte-array 32)
         spec-array-length (.read input-stream spec-array)
         spec (str/trim (codecs/bytes->str spec-array))]
     (cond
       (= spec-array-length -1)
       input-stream

       (and (= spec-array-length 32) (= spec aes-streaming-spec))
       (let [cipher (Cipher/getInstance spec)
             iv (byte-array 16)
             _ (.read input-stream iv)]
         (.init cipher Cipher/DECRYPT_MODE (SecretKeySpec. (bytes/slice secret-key 32 64) "AES") (IvParameterSpec. iv))
         (CipherInputStream. input-stream cipher))

       :else
       (SequenceInputStream.
        (ByteArrayInputStream. (bytes/slice spec-array 0 spec-array-length))
        input-stream)))))

(defn decrypt
  "Decrypt string `s` using a `secret-key` (a 64-byte byte array), by default the hashed value of
  `MB_ENCRYPTION_SECRET_KEY`."
  (^String [^String s]
   (decrypt default-secret-key s))
  (^String [secret-key, ^String s]
   (codecs/bytes->str (decrypt-bytes secret-key (codec/base64-decode s)))))

(defn maybe-encrypt
  "If `MB_ENCRYPTION_SECRET_KEY` is set, return an encrypted version of `s`; otherwise return `s` as-is."
  (^String [^String s]
   (maybe-encrypt default-secret-key s))
  (^String [secret-key, ^String s]
   (if secret-key
     (when (seq s)
       (encrypt secret-key s))
     s)))

(defn maybe-encrypt-bytes
  "If `MB_ENCRYPTION_SECRET_KEY` is set, return an encrypted version of the given bytes `b`; otherwise return `b`
  as-is."
  {:added "0.41.0"}
  (^bytes [^bytes b]
   (maybe-encrypt-bytes default-secret-key b))
  (^bytes [secret-key, ^bytes b]
   (if secret-key
     (when (seq b)
       (encrypt-bytes secret-key b))
     b)))

(defn maybe-encrypt-for-stream
  "If `MB_ENCRYPTION_SECRET_KEY` is set, return an encrypted version of `s` that can be used to stream the data; otherwise return `s` as-is."
  (^bytes [^bytes s]
   (maybe-encrypt-for-stream default-secret-key s))
  (^bytes [secret-key, ^bytes s]
   (if secret-key
     (encrypt-for-stream secret-key s)
     s)))

(def ^:private ^:const aes256-tag-length 32)
(def ^:private ^:const aes256-block-size 16)

(defn possibly-encrypted-bytes?
  "Returns true if it's likely that `b` is an encrypted byte array.  To compute this, we need the number of bytes in
  the input, subtract the bytes used by the cipher type tag (`aes256-tag-length`) and what is left should be divisible
  by the cipher's block size (`aes256-block-size`). If it's not divisible by that number it is either not encrypted or
  it has been corrupted as it must always have a multiple of the block size or it won't decrypt."
  [^bytes b]
  (if (nil? b)
    false
    (u/ignore-exceptions
      (let [byte-length (alength b)]
        (zero? (mod (- byte-length aes256-tag-length)
                    aes256-block-size))))))

(defn possibly-encrypted-string?
  "Returns true if it's likely that `s` is an encrypted string. Specifically we need `s` to be a non-blank, base64
  encoded string of the correct length. See docstring for `possibly-encrypted-bytes?` for an explanation of correct
  length."
  [^String s]
  (u/ignore-exceptions
    (when-let [b (and (not (str/blank? s))
                      (u/base64-string? s)
                      (codec/base64-decode s))]
      (possibly-encrypted-bytes? b))))

(defn maybe-decrypt
  "If `MB_ENCRYPTION_SECRET_KEY` is set and `v` is encrypted, decrypt `v`; otherwise return `s` as-is. Attempts to check
  whether `v` is an encrypted String, in which case the decrypted String is returned, or whether `v` is encrypted bytes,
  in which case the decrypted bytes are returned."
  {:arglists '([secret-key? s])}
  [& args]
  ;; secret-key as an argument so that tests can pass it directly without using `with-redefs` to run in parallel
  (let [[secret-key v]     (if (and (bytes? (first args)) (string? (second args)))
                             args
                             (cons default-secret-key args))
        log-error-fn (fn [kind ^Throwable e]
                       (log/warnf "Cannot decrypt encrypted %s. Have you changed or forgot to set MB_ENCRYPTION_SECRET_KEY? %s"
                                  kind
                                  (ex-message e)))]
    (cond (nil? secret-key)
          v

          (possibly-encrypted-string? v)
          (try
            (decrypt secret-key v)
            (catch Throwable e
              ;; if we can't decrypt `v`, but it *is* probably encrypted, log a warning
              (log-error-fn "String" e)
              v))

          (possibly-encrypted-bytes? v)
          (try
            (decrypt-bytes secret-key v)
            (catch Throwable e
              ;; if we can't decrypt `v`, but it *is* probably encrypted, log a warning
              (log-error-fn "bytes" e)
              v))

          :else
          v)))
