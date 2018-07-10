(ns metabase.util.encryption
  "Utility functions for encrypting and decrypting strings using AES256 CBC + HMAC SHA512 and the
  `MB_ENCRYPTION_SECRET_KEY` env var."
  (:require [buddy.core
             [codecs :as codecs]
             [crypto :as crypto]
             [kdf :as kdf]
             [nonce :as nonce]]
            [clojure.tools.logging :as log]
            [environ.core :as env]
            [metabase.util :as u]
            [puppetlabs.i18n.core :refer [trs]]
            [ring.util.codec :as codec]))

(defn secret-key->hash
  "Generate a 64-byte byte array hash of `secret-key` using 100,000 iterations of PBKDF2+SHA512."
  ^bytes [^String secret-key]
  (kdf/get-bytes (kdf/engine {:alg        :pbkdf2+sha512
                              :key        secret-key
                              :iterations 100000}) ; 100,000 iterations takes about ~160ms on my laptop
                 64))

;; apperently if you're not tagging in an arglist, `^bytes` will set the `:tag` metadata to `clojure.core/bytes` (ick)
;; so you have to do `^{:tag 'bytes}` instead
(defonce ^:private ^{:tag 'bytes} default-secret-key
  (when-let [secret-key (env/env :mb-encryption-secret-key)]
    (when (seq secret-key)
      (assert (>= (count secret-key) 16)
        (trs "MB_ENCRYPTION_SECRET_KEY must be at least 16 characters."))
      (secret-key->hash secret-key))))

;; log a nice message letting people know whether DB details encryption is enabled
(log/info
 (if default-secret-key
   (trs "Saved credentials encryption is ENABLED for this Metabase instance.")
   (trs "Saved credentials encryption is DISABLED for this Metabase instance."))
 (u/emoji (if default-secret-key "🔐" "🔓"))
 (trs "\nFor more information, see")
 "https://www.metabase.com/docs/latest/operations-guide/start.html#encrypting-your-database-connection-details-at-rest")

(defn encrypt
  "Encrypt string `s` as hex bytes using a `secret-key` (a 64-byte byte array), by default the hashed value of
  `MB_ENCRYPTION_SECRET_KEY`."
  (^String [^String s]
   (encrypt default-secret-key s))
  (^String [^String secret-key, ^String s]
   (let [initialization-vector (nonce/random-bytes 16)]
     (codec/base64-encode
      (byte-array
       (concat initialization-vector
               (crypto/encrypt (codecs/to-bytes s) secret-key initialization-vector
                               {:algorithm :aes256-cbc-hmac-sha512})))))))

(defn decrypt
  "Decrypt string `s` using a `secret-key` (a 64-byte byte array), by default the hashed value of
  `MB_ENCRYPTION_SECRET_KEY`."
  (^String [^String s]
   (decrypt default-secret-key s))
  (^String [secret-key, ^String s]
   (let [bytes                           (codec/base64-decode s)
         [initialization-vector message] (split-at 16 bytes)]
     (codecs/bytes->str (crypto/decrypt (byte-array message) secret-key (byte-array initialization-vector)
                                        {:algorithm :aes256-cbc-hmac-sha512})))))


(defn maybe-encrypt
  "If `MB_ENCRYPTION_SECRET_KEY` is set, return an encrypted version of `s`; otherwise return `s` as-is."
  (^String [^String s]
   (maybe-encrypt default-secret-key s))
  (^String [secret-key, ^String s]
   (if secret-key
     (when (seq s)
       (encrypt secret-key s))
     s)))

(defn maybe-decrypt
  "If `MB_ENCRYPTION_SECRET_KEY` is set and `s` is encrypted, decrypt `s`; otherwise return `s` as-is."
  (^String [^String s]
   (maybe-decrypt default-secret-key s))
  (^String [secret-key, ^String s]
   (if (and secret-key (seq s))
     (try
       (decrypt secret-key s)
       (catch Throwable e
         (if (u/base64-string? s)
           ;; if we can't decrypt `s`, but it *is* encrypted, log an error message and return `nil`
           (log/error
            (trs "Cannot decrypt encrypted credentials. Have you changed or forgot to set MB_ENCRYPTION_SECRET_KEY?")
            (.getMessage e)
            (u/pprint-to-str (u/filtered-stacktrace e)))
           ;; otherwise return S without decrypting. It's probably not decrypted in the first place
           s)))
     s)))
