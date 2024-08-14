(ns metabase.util.encryption
  "Utility functions for encrypting and decrypting strings using AES256 CBC + HMAC SHA512 and the
  `MB_ENCRYPTION_SECRET_KEY` env var."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.crypto :as crypto]
   [buddy.core.kdf :as kdf]
   [buddy.core.nonce :as nonce]
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(defn secret-key->hash
  "Generate a 64-byte byte array hash of `secret-key` using 100,000 iterations of PBKDF2+SHA512."
  ^bytes [^String secret-key]
  (kdf/get-bytes (kdf/engine {:alg        :pbkdf2+sha512
                              :key        secret-key
                              :iterations 100000}) ; 100,000 iterations takes about ~160ms on my laptop
                 64))

(defn validate-and-hash-secret-key
  "Check the minimum length of the key and hash it for internal usage."
  [^String secret-key]
  (when-let [secret-key secret-key]
    (when (seq secret-key)
      (assert (>= (count secret-key) 16)
              (str (trs "MB_ENCRYPTION_SECRET_KEY must be at least 16 characters.")))
      (secret-key->hash secret-key))))

;; apperently if you're not tagging in an arglist, `^bytes` will set the `:tag` metadata to `clojure.core/bytes` (ick)
;; so you have to do `^{:tag 'bytes}` instead
(defonce ^:private ^{:tag 'bytes} default-secret-key
  (validate-and-hash-secret-key (env/env :mb-encryption-secret-key)))

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
      (when-let [byte-length (alength b)]
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
                       (log/warnf e
                                  "Cannot decrypt encrypted %s. Have you changed or forgot to set MB_ENCRYPTION_SECRET_KEY?"
                                  kind))]

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
