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

(defn maybe-decrypt-accepting-plaintext
  "Plaintext-tolerant decrypt of a String `s`. If `MB_ENCRYPTION_SECRET_KEY` is set and `s` is encrypted, decrypt it;
  a value that is stored as plaintext is returned as-is. A value that *looks* encrypted but cannot be decrypted with
  the current key (wrong key, tampering, corruption) throws — it must not be silently returned, or a re-encrypting
  caller would double-encrypt it into something permanently unrecoverable. This differs from the strict
  [[maybe-decrypt]] only in tolerating genuine plaintext; use it for values that may legitimately be plaintext at rest
  (rows written before encryption was enabled, key rotation, settings, and migration reads).

  `secret-key` is accepted as an argument so tests can pass it directly instead of using `with-redefs` to run in
  parallel."
  (^String [^String s] (maybe-decrypt-accepting-plaintext default-secret-key s))
  (^String [secret-key ^String s]
   (cond
     (nil? secret-key)              s
     (possibly-encrypted-string? s) (decrypt secret-key s)
     :else                          s)))

(defn maybe-decrypt-bytes-accepting-plaintext
  "Plaintext-tolerant counterpart to [[maybe-decrypt-accepting-plaintext]] for a byte array `b` (e.g. secret values):
  an encrypted value is decrypted, a plaintext value is returned as-is, and a value that looks encrypted but cannot be
  decrypted with the current key throws rather than being returned (returning it would let a re-encrypting caller
  double-encrypt it into something permanently unrecoverable)."
  (^bytes [^bytes b] (maybe-decrypt-bytes-accepting-plaintext default-secret-key b))
  (^bytes [secret-key ^bytes b]
   (cond
     (nil? secret-key)             b
     (possibly-encrypted-bytes? b) (decrypt-bytes secret-key b)
     :else                         b)))

(defn maybe-decrypt
  "Strict decrypt of a String `s`. When `MB_ENCRYPTION_SECRET_KEY` is set, `s` must be an encrypted value that decrypts
  with the current key: a value that is not encrypted throws (it was written outside the encrypting path — a plaintext
  value cannot stand in for an encrypted one), and a value that is encrypted but cannot be decrypted with the current
  key (wrong key, tampering, or corruption) also throws rather than being trusted. When no key is set, `s` is returned
  as-is (there is no key to decrypt with). For values that may legitimately be plaintext at rest, use
  [[maybe-decrypt-accepting-plaintext]].

  `secret-key` is accepted as an argument so tests can pass it directly instead of using `with-redefs` to run in
  parallel."
  (^String [^String s] (maybe-decrypt default-secret-key s))
  (^String [secret-key ^String s]
   (cond
     (nil? secret-key)              s
     (nil? s)                       s
     (possibly-encrypted-string? s) (decrypt secret-key s)
     :else                          (throw (ex-info "Expected an encrypted value but the stored value is not encrypted."
                                                    {:type ::not-encrypted})))))

(defn maybe-decrypt-bytes
  "Strict counterpart to [[maybe-decrypt-bytes-accepting-plaintext]] for a byte array `b`: a value that is not encrypted,
  or that cannot be decrypted with the current key, throws rather than being trusted. When no key is set, `b` is returned
  as-is."
  (^bytes [^bytes b] (maybe-decrypt-bytes default-secret-key b))
  (^bytes [secret-key ^bytes b]
   (cond
     (nil? secret-key)             b
     (nil? b)                      b
     (possibly-encrypted-bytes? b) (decrypt-bytes secret-key b)
     :else                         (throw (ex-info "Expected an encrypted value but the stored value is not encrypted."
                                                   {:type ::not-encrypted})))))
