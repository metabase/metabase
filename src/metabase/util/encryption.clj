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
   [metabase.util.encryption.dek :as dek]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [ring.util.codec :as codec])
  (:import (java.io ByteArrayInputStream InputStream SequenceInputStream)
           (java.util Arrays)
           (javax.crypto Cipher CipherInputStream)
           (javax.crypto.spec GCMParameterSpec SecretKeySpec IvParameterSpec)))

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

(defn current-secret-key
  "The current KEK: the 64-byte hash of `MB_ENCRYPTION_SECRET_KEY`, or nil when encryption is disabled. Reads through
  the same var the encrypt/decrypt paths default to, so tests that rebind [[default-secret-key]] see the rebound key."
  ^bytes []
  default-secret-key)

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

;;; ---------------------------------------- v2 envelope ciphertext format ----------------------------------------

;; New writes use a *versioned envelope* format. Layout of the raw v2 blob:
;;
;;   magic "MB" (2 bytes) ‖ version 0x02 (1 byte) ‖ DEK generation id (4 bytes, big-endian int)
;;                        ‖ nonce (12 bytes) ‖ AES-256-GCM ciphertext+tag
;;
;; String values base64-encode this blob (exactly where the legacy string format is base64); byte values keep it raw.
;; Reads dispatch on the magic+version prefix; the legacy CBC+HMAC heuristic is tried only when the prefix is absent,
;; so legacy values stay readable forever. GCM authentication is what makes tampering detectable and makes a wrong DEK
;; (wrong KEK) a deterministic failure rather than garbage output.

(def ^:private ^{:tag 'bytes} v2-magic (byte-array [(byte \M) (byte \B)]))
(def ^:private ^:const v2-version (byte 2))
(def ^:private ^:const v2-header-length 7) ; 2 magic + 1 version + 4 generation-id
(def ^:private ^:const v2-nonce-length 12)
(def ^:private ^:const v2-gcm-tag-bits 128)

(defn- dek->aes-key
  ^SecretKeySpec [^bytes dek]
  (SecretKeySpec. dek "AES"))

(defn v2-bytes?
  "Does raw byte array `b` carry the v2 magic + version prefix? Cheap, exact, and never throws. Returns false for any
  non-byte-array input (e.g. a String), so it is safe to call from the shared detection predicates."
  [b]
  (boolean
   (and (bytes? b)
        (let [^bytes b b]
          (and (>= (alength b) v2-header-length)
               (= (aget b 0) (aget v2-magic 0))
               (= (aget b 1) (aget v2-magic 1))
               (= (aget b 2) v2-version))))))

(defn v2-string?
  "Is string `s` a base64-encoded v2 blob? Returns false for plaintext, legacy ciphertext, and non-base64 input."
  [^String s]
  (boolean
   (u/ignore-exceptions
     (and (not (str/blank? s))
          (u/base64-string? s)
          (v2-bytes? (codec/base64-decode s))))))

(defn- encrypt-v2-bytes
  "Encrypt bytes `b` under the DEK-store's active generation, returning the raw v2 blob."
  ^bytes [store ^bytes kek ^bytes b]
  (let [{:keys [generation-id ^bytes dek]} (dek/active-generation store kek)
        nonce  (nonce/random-bytes v2-nonce-length)
        cipher (Cipher/getInstance "AES/GCM/NoPadding")]
    (.init cipher Cipher/ENCRYPT_MODE (dek->aes-key dek) (GCMParameterSpec. v2-gcm-tag-bits nonce))
    (let [ct  (.doFinal cipher b)
          out (byte-array (+ v2-header-length v2-nonce-length (alength ct)))]
      (System/arraycopy v2-magic 0 out 0 2)
      (aset out 2 v2-version)
      ;; `unchecked-byte` (not `byte`) because `clojure.core/byte` throws for values 128-255, so any generation-id
      ;; byte >= 0x80 (first hit: id 128) would make every encrypted write throw. `unchecked-byte` wraps to a signed
      ;; byte; `v2-generation-id-of-bytes` masks with 0xFF on the way back out, so the round-trip is exact.
      (aset out 3 (unchecked-byte (bit-and (bit-shift-right generation-id 24) 0xFF)))
      (aset out 4 (unchecked-byte (bit-and (bit-shift-right generation-id 16) 0xFF)))
      (aset out 5 (unchecked-byte (bit-and (bit-shift-right generation-id 8) 0xFF)))
      (aset out 6 (unchecked-byte (bit-and generation-id 0xFF)))
      (System/arraycopy nonce 0 out v2-header-length v2-nonce-length)
      (System/arraycopy ct 0 out (+ v2-header-length v2-nonce-length) (alength ct))
      out)))

(defn v2-generation-id-of-bytes
  "The DEK generation id encoded in a raw v2 blob `b`."
  ^long [^bytes b]
  (bit-or (bit-shift-left (bit-and (aget b 3) 0xFF) 24)
          (bit-shift-left (bit-and (aget b 4) 0xFF) 16)
          (bit-shift-left (bit-and (aget b 5) 0xFF) 8)
          (bit-and (aget b 6) 0xFF)))

(defn v2-generation-id-of-string
  "The DEK generation id encoded in a base64-encoded v2 string `s`."
  ^long [^String s]
  (v2-generation-id-of-bytes (codec/base64-decode s)))

(defn- decrypt-v2-bytes
  "Decrypt a raw v2 blob `b` using `store` to fetch the DEK named by its generation id, unwrapping with `kek`.
  Returns the plaintext bytes. Throws on a wrong KEK (GCM auth failure) or an unknown generation."
  ^bytes [store ^bytes kek ^bytes b]
  (when-not store
    (throw (ex-info "Cannot decrypt a v2 envelope value: no DEK store is initialized" {})))
  (let [generation-id (v2-generation-id-of-bytes b)
        dek           (dek/dek-by-id store kek generation-id)
        nonce         (Arrays/copyOfRange b v2-header-length (+ v2-header-length v2-nonce-length))
        ct            (Arrays/copyOfRange b (+ v2-header-length v2-nonce-length) (alength b))
        cipher        (Cipher/getInstance "AES/GCM/NoPadding")]
    (.init cipher Cipher/DECRYPT_MODE (dek->aes-key dek) (GCMParameterSpec. v2-gcm-tag-bits nonce))
    (.doFinal cipher ct)))

(defn maybe-encrypt
  "If `MB_ENCRYPTION_SECRET_KEY` is set, return an encrypted version of `s`; otherwise return `s` as-is. When a DEK
  store is initialized ([[metabase.util.encryption.dek/*store*]]), writes use the v2 envelope format; before
  initialization they fall back to the legacy KEK-direct format."
  (^String [^String s]
   (maybe-encrypt default-secret-key s))
  (^String [secret-key, ^String s]
   (if secret-key
     (when (seq s)
       (if-let [store (dek/store)]
         (codec/base64-encode (encrypt-v2-bytes store secret-key (codecs/to-bytes s)))
         (encrypt secret-key s)))
     s)))

(defn maybe-encrypt-bytes
  "If `MB_ENCRYPTION_SECRET_KEY` is set, return an encrypted version of the given bytes `b`; otherwise return `b`
  as-is. When a DEK store is initialized, writes use the v2 envelope format; before initialization they fall back to
  the legacy KEK-direct format."
  {:added "0.41.0"}
  (^bytes [^bytes b]
   (maybe-encrypt-bytes default-secret-key b))
  (^bytes [secret-key, ^bytes b]
   (if secret-key
     (when (seq b)
       (if-let [store (dek/store)]
         (encrypt-v2-bytes store secret-key b)
         (encrypt-bytes secret-key b)))
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
  "Returns true if it's likely that `b` is an encrypted byte array. A v2 envelope blob is recognized exactly by its
  version prefix. Otherwise this falls back to the legacy heuristic: subtract the bytes used by the cipher type tag
  (`aes256-tag-length`) and what is left should be divisible by the cipher's block size (`aes256-block-size`). If it's
  not divisible by that number it is either not encrypted or it has been corrupted as it must always have a multiple
  of the block size or it won't decrypt."
  [^bytes b]
  (if (nil? b)
    false
    (or (v2-bytes? b)
        (u/ignore-exceptions
          (let [byte-length (alength b)]
            (zero? (mod (- byte-length aes256-tag-length)
                        aes256-block-size)))))))

(defn possibly-encrypted-string?
  "Returns true if it's likely that `s` is an encrypted string. A v2 envelope string is recognized exactly by its
  base64-decoded version prefix; otherwise `s` must be a non-blank, base64 encoded string of the correct legacy
  length. See docstring for `possibly-encrypted-bytes?` for an explanation of correct length."
  [^String s]
  (u/ignore-exceptions
    (when-let [b (and (not (str/blank? s))
                      (u/base64-string? s)
                      (codec/base64-decode s))]
      (possibly-encrypted-bytes? b))))

(defn- decrypt-legacy-string
  "Try the legacy CBC+HMAC decrypt path for string `v`. Returns the plaintext on success, or `v` unchanged (logging a
  warning) if `v` looks legacy-encrypted but does not decrypt. `already-warned?` suppresses a duplicate warning when
  the v2 branch already logged one before falling through."
  [secret-key ^String v log-error-fn already-warned?]
  (if (possibly-encrypted-string? v)
    (try
      (decrypt secret-key v)
      (catch Throwable e
        (when-not already-warned? (log-error-fn "String" e))
        v))
    v))

(defn- decrypt-legacy-bytes
  "Try the legacy CBC+HMAC decrypt path for byte-array `v`. Returns the plaintext bytes on success, or `v` unchanged
  (logging a warning) if `v` looks legacy-encrypted but does not decrypt."
  [secret-key ^bytes v log-error-fn already-warned?]
  (if (possibly-encrypted-bytes? v)
    (try
      (decrypt-bytes secret-key v)
      (catch Throwable e
        (when-not already-warned? (log-error-fn "bytes" e))
        v))
    v))

(defn maybe-decrypt
  "If `MB_ENCRYPTION_SECRET_KEY` is set and `v` is encrypted, decrypt `v`; otherwise return `s` as-is. Attempts to check
  whether `v` is an encrypted String, in which case the decrypted String is returned, or whether `v` is encrypted bytes,
  in which case the decrypted bytes are returned.

  A value carrying the v2 magic prefix is decrypted through the envelope path. If that path fails because there is a
  *store* but the DEK generation is unknown or GCM authentication fails, we fall through to the legacy CBC+HMAC path:
  a legacy value's random bytes can (rarely, ~2^-24) begin with the v2 magic, and it must still decrypt. If there is
  *no* store at all, a well-formed v2 value cannot be legacy (its magic is exact), so rather than silently returning
  ciphertext (which a pre-init custom migration would then persist, corrupting data) we THROW."
  {:arglists '([secret-key? s])}
  [& args]
  ;; secret-key as an argument so that tests can pass it directly without using `with-redefs` to run in parallel.
  ;; Two args means `[secret-key value]` (value may be a String or a byte array); one arg means `[value]` and uses the
  ;; default key.
  (let [[secret-key v]     (if (and (= (count args) 2) (bytes? (first args)))
                             args
                             (cons default-secret-key args))
        log-error-fn (fn [kind ^Throwable e]
                       (log/warnf "Cannot decrypt encrypted %s. Have you changed or forgot to set MB_ENCRYPTION_SECRET_KEY? %s"
                                  kind
                                  (ex-message e)))]
    (cond (nil? secret-key)
          v

          ;; v2 string: base64-encoded envelope. Dispatch on the exact version prefix, never the base64-shape guess.
          (and (string? v) (v2-string? v))
          (if-let [store (dek/store)]
            (try
              (codecs/bytes->str (decrypt-v2-bytes store secret-key (codec/base64-decode v)))
              (catch Throwable e
                ;; unknown generation or GCM auth failure: this might be a legacy value whose random bytes happened to
                ;; start with the v2 magic. Fall through to the legacy path before giving up.
                (log-error-fn "String" e)
                (decrypt-legacy-string secret-key v log-error-fn true)))
            ;; No store: a well-formed v2 value can never be legacy. Refuse to silently return ciphertext.
            (throw (ex-info "Cannot decrypt a v2 envelope value: no DEK store is initialized" {})))

          ;; v2 raw bytes: envelope stored as-is (secret values).
          (and (bytes? v) (v2-bytes? v))
          (if-let [store (dek/store)]
            (try
              (decrypt-v2-bytes store secret-key v)
              (catch Throwable e
                (log-error-fn "bytes" e)
                (decrypt-legacy-bytes secret-key v log-error-fn true)))
            (throw (ex-info "Cannot decrypt a v2 envelope value: no DEK store is initialized" {})))

          (possibly-encrypted-string? v)
          (decrypt-legacy-string secret-key v log-error-fn false)

          (possibly-encrypted-bytes? v)
          (decrypt-legacy-bytes secret-key v log-error-fn false)

          :else
          v)))
