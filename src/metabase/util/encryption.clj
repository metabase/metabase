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
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [ring.util.codec :as codec])
  (:import (java.io ByteArrayInputStream InputStream SequenceInputStream)
           (javax.crypto Cipher CipherInputStream)
           (javax.crypto.spec SecretKeySpec IvParameterSpec)))

(set! *warn-on-reflection* true)

(def ^:private ^:const aes-streaming-spec "AES/CBC/PKCS5Padding")

(def ^:private InputStreamSchema
  [:fn {:error/message "an InputStream"} #(instance? InputStream %)])

(def ^:private ThrowableSchema
  [:fn {:error/message "a Throwable"} #(instance? Throwable %)])

(mu/defn secret-key->hash :- bytes?
  "Generate a 64-byte byte array hash of `secret-key` using 100,000 iterations of PBKDF2+SHA512."
  ^bytes [^String secret-key :- [:maybe :string]]
  (kdf/get-bytes (kdf/engine {:alg        :pbkdf2+sha512
                              :key        secret-key
                              :iterations 100000}) ; 100,000 iterations takes about ~160ms on my laptop
                 64))

(mu/defn validate-and-hash-secret-key :- [:maybe bytes?]
  "Check the minimum length of the key and hash it for internal usage. Returns nil for a blank key. `env-var-name` names
  the source in the length-assertion message."
  ([secret-key :- [:maybe :string]]
   (validate-and-hash-secret-key secret-key "MB_ENCRYPTION_SECRET_KEY"))
  ([secret-key   :- [:maybe :string]
    env-var-name :- :string]
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

(mu/defn default-encryption-enabled? :- :boolean
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

(mr/def ::source
  "What a ciphertext is bound to: an `:encryption/...` keyword naming the slot the value lives in — `table.column` for a
  model column (`:encryption/api_key.key`), `setting.<key>` for a setting, and its own name for anything else
  (`:encryption/oidc.state`). The keyword is authenticated along with the value, so a value moved to another slot no
  longer decrypts."
  [:and
   :qualified-keyword
   [:fn {:error/message "must be an :encryption/... keyword"}
    #(= "encryption" (namespace %))]])

(mu/defn- aad-opts :- :map
  "Cipher options binding the ciphertext to `source`, so a value moved to another setting or column no longer
  authenticates. `nil` leaves it unbound, which is what values written before this existed look like."
  [source :- [:maybe ::source]]
  (cond-> {:algorithm :aes256-cbc-hmac-sha512}
    source (assoc :aad (codecs/to-bytes (u/qualified-name source)))))

(def EncryptOpts
  "Options for the encrypting functions.

    :secret-key - the 64-byte key to encrypt with, defaulting to the hashed `MB_ENCRYPTION_SECRET_KEY`. Passed
                  explicitly by tests, which would otherwise need `with-redefs` and could not run in parallel, and by
                  key rotation, which writes under a key that is not the current one. An explicit `nil` means no key
                  is set, i.e. encryption is off."
  [:map {:closed true}
   [:secret-key {:optional true} [:maybe bytes?]]])

(def DecryptOpts
  "Options for the decrypting functions. Both relaxations are off by default: a value must decrypt bound to the
  `source` it is stored under, and must actually be encrypted.

    :secret-key       - see [[EncryptOpts]].
    :accept-unbound   - also read a value encrypted before it was bound to a source, by retrying with no binding.
                        Only the startup jobs that rewrite values into their bound form, and key rotation, may pass
                        this; the app requires the binding, so a value moved from another setting or column is
                        refused.
    :accept-plaintext - return a value that is not encrypted at all as-is instead of throwing, for values that may
                        legitimately be plaintext at rest (rows predating encryption, key rotation, migration reads).
                        A value that looks encrypted but does not decrypt still throws either way: returning it would
                        let a re-encrypting caller double-encrypt it into something permanently unrecoverable."
  [:map {:closed true}
   [:secret-key {:optional true} [:maybe bytes?]]
   [:accept-unbound {:optional true} :boolean]
   [:accept-plaintext {:optional true} :boolean]])

(mu/defn- opts-secret-key :- [:maybe bytes?]
  "The key `opts` say to use: `MB_ENCRYPTION_SECRET_KEY`'s hash unless one is given (an explicit `nil` means no key)."
  ^bytes [opts :- [:maybe :map]]
  (get opts :secret-key default-secret-key))

(mu/defn encrypt-bytes :- bytes?
  "Encrypt bytes `b`, binding the ciphertext to `source` so it cannot be read from anywhere else. `opts` are
  [[EncryptOpts]]."
  {:added "0.41.0"}
  (^bytes [b      :- bytes?
           source :- [:maybe ::source]]
   (encrypt-bytes b source nil))
  (^bytes [b      :- bytes?
           source :- [:maybe ::source]
           opts   :- [:maybe EncryptOpts]]
   (let [initialization-vector (nonce/random-bytes 16)]
     (->> (crypto/encrypt b
                          (opts-secret-key opts)
                          initialization-vector
                          (aad-opts source))
          (concat initialization-vector)
          byte-array))))

(mu/defn encrypt :- :string
  "Encrypt string `s` as hex bytes, binding the ciphertext to `source`. `opts` are [[EncryptOpts]]."
  (^String [s      :- :string
            source :- [:maybe ::source]]
   (encrypt s source nil))
  (^String [s      :- :string
            source :- [:maybe ::source]
            opts   :- [:maybe EncryptOpts]]
   (-> (encrypt-bytes (codecs/to-bytes s) source opts)
       codec/base64-encode)))

(mu/defn- decryption-error
  "Rethrow a decryption failure with `source` named in the message. Only the message survives into the logs (ex-data
  is not), so a failure that cannot otherwise be traced to a row without a debugger has to carry it there. Never
  includes the value."
  ^Throwable [source       :- [:maybe ::source]
              ^Throwable e :- ThrowableSchema]
  (if source
    (ex-info (format "Error decrypting %s: %s" source (ex-message e)) {:source source} e)
    e))

(mu/defn decrypt-bytes :- bytes?
  "Decrypt bytes `b` using a `secret-key` (a 64-byte byte array), which by default is the hashed value of
  `MB_ENCRYPTION_SECRET_KEY`. Of [[DecryptOpts]] only `:accept-unbound` applies here."
  {:added "0.41.0"}
  (^bytes [b      :- bytes?
           source :- [:maybe ::source]]
   (decrypt-bytes b source nil))
  (^bytes [b      :- bytes?
           source :- [:maybe ::source]
           opts   :- [:maybe DecryptOpts]]
   (letfn [(decrypt-with [source]
             (let [[initialization-vector message] (split-at 16 b)]
               (crypto/decrypt (byte-array message)
                               (opts-secret-key opts)
                               (byte-array initialization-vector)
                               (aad-opts source))))]
     (try
       (decrypt-with source)
       (catch Throwable bound-failure
         ;; an unbound value is one encrypted with no aad, so the retry is just the same call with no source
         (or (when (and (:accept-unbound opts) source)
               (u/ignore-exceptions (decrypt-with nil)))
             (throw (decryption-error source bound-failure))))))))

(mu/defn encrypt-stream :- InputStreamSchema
  "Wraps a plaintext input stream into an input stream that encrypts it using AES256 CBC.
  The encryption format is slightly different for streams vs. fixed length data"
  {:added "0.53.0"}
  (^InputStream [^InputStream input-stream :- InputStreamSchema]
   (encrypt-stream default-secret-key input-stream))
  (^InputStream [secret-key                :- [:maybe bytes?]
                 ^InputStream input-stream :- InputStreamSchema]
   (let [spec aes-streaming-spec
         spec-header (codecs/to-bytes (format "%-32s" spec))
         cipher (Cipher/getInstance spec)
         iv (nonce/random-bytes 16)]
     (.init cipher Cipher/ENCRYPT_MODE (SecretKeySpec. (bytes/slice secret-key 32 64) "AES") (IvParameterSpec. iv))
     (SequenceInputStream. (ByteArrayInputStream. (bytes/concat spec-header iv)) (CipherInputStream. input-stream cipher)))))

(mu/defn encrypt-for-stream :- bytes?
  "Encrypts a byte-array in a way that can be used to read it with decrypt-stream instead of decrypt."
  {:added "0.53.0"}
  (^bytes [^bytes input :- bytes?]
   (encrypt-for-stream default-secret-key input))
  (^bytes [secret-key   :- [:maybe bytes?]
           ^bytes input :- bytes?]
   (with-open [encrypted (encrypt-stream secret-key (ByteArrayInputStream. input))]
     (.readAllBytes encrypted))))

(mu/defn maybe-decrypt-stream :- InputStreamSchema
  "Wraps a possibly-encrypted input stream into a new input stream that decrypts it if necessary."
  {:added "0.53.0"}
  (^InputStream [^InputStream input-stream :- InputStreamSchema]
   (maybe-decrypt-stream default-secret-key input-stream))
  (^InputStream [secret-key                :- [:maybe bytes?]
                 ^InputStream input-stream :- InputStreamSchema]
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

(mu/defn decrypt :- :string
  "Decrypt string `s` using a `secret-key` (a 64-byte byte array), by default the hashed value of
  `MB_ENCRYPTION_SECRET_KEY`. Of [[DecryptOpts]] only `:accept-unbound` applies here."
  (^String [s      :- :string
            source :- [:maybe ::source]]
   (decrypt s source nil))
  (^String [s      :- :string
            source :- [:maybe ::source]
            opts   :- [:maybe DecryptOpts]]
   (codecs/bytes->str (decrypt-bytes (codec/base64-decode s) source opts))))

(mu/defn maybe-encrypt :- [:maybe :string]
  "If `MB_ENCRYPTION_SECRET_KEY` is set, return an encrypted version of `s` bound to `source`; otherwise return `s`
  as-is. `opts` are [[EncryptOpts]]."
  (^String [s      :- [:maybe :string]
            source :- [:maybe ::source]]
   (maybe-encrypt s source nil))
  (^String [s      :- [:maybe :string]
            source :- [:maybe ::source]
            opts   :- [:maybe EncryptOpts]]
   (if (opts-secret-key opts)
     (when (seq s)
       (encrypt s source opts))
     s)))

(mu/defn maybe-encrypt-bytes :- [:maybe bytes?]
  "If `MB_ENCRYPTION_SECRET_KEY` is set, return an encrypted version of the given bytes `b` bound to `source`;
  otherwise return `b` as-is. `opts` are [[EncryptOpts]]."
  {:added "0.41.0"}
  (^bytes [b      :- [:maybe bytes?]
           source :- [:maybe ::source]]
   (maybe-encrypt-bytes b source nil))
  (^bytes [b      :- [:maybe bytes?]
           source :- [:maybe ::source]
           opts   :- [:maybe EncryptOpts]]
   (if (opts-secret-key opts)
     (when (seq b)
       (encrypt-bytes b source opts))
     b)))

(mu/defn maybe-encrypt-for-stream :- bytes?
  "If `MB_ENCRYPTION_SECRET_KEY` is set, return an encrypted version of `s` that can be used to stream the data; otherwise return `s` as-is."
  (^bytes [^bytes s :- bytes?]
   (maybe-encrypt-for-stream default-secret-key s))
  (^bytes [secret-key :- [:maybe bytes?]
           ^bytes s   :- bytes?]
   (if secret-key
     (encrypt-for-stream secret-key s)
     s)))

(def ^:private ^:const aes256-tag-length 32)
(def ^:private ^:const aes256-block-size 16)

(mu/defn possibly-encrypted-bytes? :- :boolean
  "Whether `b` has the shape of an encrypted byte array: at least the length of the shortest ciphertext, and a length
  that leaves a multiple of the cipher block size (`aes256-block-size`) once the tag (`aes256-tag-length`) is taken off.

  This is a shape check, and its only guarantee is one-sided:

  - `false`: `b` is definitely NOT encrypted (or is corrupted beyond decrypting).
  - `true`: `b` is encrypted, OR it is plaintext that merely happens to have the right length.

  So it can rule encryption out, never in. Anything that decides whether a value gets encrypted, decrypted, skipped
  or trusted must use [[decryptable-bytes?]], which actually decrypts."
  [^bytes b :- [:maybe bytes?]]
  (boolean
   (when b
     (u/ignore-exceptions
       (let [byte-length (alength b)]
         ;; IV + at least one cipher block + tag: anything shorter cannot be ciphertext, and `mod` alone would accept
         ;; 16- and 32-byte plaintext too
         (and (>= byte-length (+ (* 2 aes256-block-size) aes256-tag-length))
              (zero? (mod (- byte-length aes256-tag-length)
                          aes256-block-size))))))))

(mu/defn possibly-encrypted-string? :- :boolean
  "Whether `s` has the shape of an encrypted string: non-blank base64 that decodes to something
  [[possibly-encrypted-bytes?]]. The same one-sided guarantee applies: `false` means definitely not encrypted, `true`
  means encrypted or plaintext that merely matches the pattern (a 64-character hex digest, for one). Use
  [[decryptable-string?]] wherever the answer decides what happens to the value."
  [^String s :- [:maybe :string]]
  (boolean
   (u/ignore-exceptions
     (when-let [b (and (not (str/blank? s))
                       (u/base64-string? s)
                       (codec/base64-decode s))]
       (possibly-encrypted-bytes? b)))))

(mu/defn decryptable-bytes? :- :boolean
  "Whether `b` is encrypted with `secret-key`: it has the shape of ciphertext *and* decrypts. The ciphertext is
  authenticated, so a wrong key, corruption, and plaintext that merely looks like ciphertext all yield false. Always
  false when no key is set. Use this, not [[possibly-encrypted-bytes?]], wherever the answer decides whether a value is
  encrypted, decrypted, or left alone."
  ([b      :- [:maybe bytes?]
    source :- [:maybe ::source]]
   (decryptable-bytes? b source nil))
  ([b      :- [:maybe bytes?]
    source :- [:maybe ::source]
    opts   :- [:maybe DecryptOpts]]
   (boolean (and (opts-secret-key opts)
                 (possibly-encrypted-bytes? b)
                 (u/ignore-exceptions (decrypt-bytes b source opts) true)))))

(mu/defn decryptable-string? :- :boolean
  "Whether `s` is encrypted with `secret-key`: it has the shape of ciphertext *and* decrypts. See [[decryptable-bytes?]]."
  ([s      :- [:maybe :string]
    source :- [:maybe ::source]]
   (decryptable-string? s source nil))
  ([s      :- [:maybe :string]
    source :- [:maybe ::source]
    opts   :- [:maybe DecryptOpts]]
   (boolean (and (opts-secret-key opts)
                 (possibly-encrypted-string? s)
                 (u/ignore-exceptions (decrypt s source opts) true)))))

(mu/defn- not-encrypted-error
  "The failure for a value that is stored as plaintext where an encrypted one is required, naming `source`."
  ^Throwable [source :- [:maybe ::source]]
  (ex-info (if source
             (format "Error decrypting %s: Expected an encrypted value but the stored value is not encrypted." source)
             "Expected an encrypted value but the stored value is not encrypted.")
           {:type ::not-encrypted, :source source}))

(mu/defn maybe-decrypt :- [:maybe :string]
  "Decrypt a String `s` that is expected to be encrypted and bound to `source`. When `MB_ENCRYPTION_SECRET_KEY` is
  set, `s` must be an encrypted value that decrypts with the current key: a value that is not encrypted throws (it was
  written outside the encrypting path -- a plaintext value cannot stand in for an encrypted one), and one that is
  encrypted but cannot be decrypted with the current key and binding (wrong key, another column's value, tampering,
  corruption) also throws rather than being trusted. When no key is set, `s` is returned as-is. `opts` relax these
  rules -- see [[DecryptOpts]]."
  (^String [s      :- [:maybe :string]
            source :- [:maybe ::source]]
   (maybe-decrypt s source nil))
  (^String [s      :- [:maybe :string]
            source :- [:maybe ::source]
            opts   :- [:maybe DecryptOpts]]
   (cond
     (nil? (opts-secret-key opts))  s
     (nil? s)                       s
     (possibly-encrypted-string? s) (decrypt s source opts)
     (:accept-plaintext opts)       s
     :else                          (throw (not-encrypted-error source)))))

(mu/defn maybe-decrypt-bytes :- [:maybe bytes?]
  "[[maybe-decrypt]] for a byte array `b` (e.g. secret values)."
  (^bytes [b      :- [:maybe bytes?]
           source :- [:maybe ::source]]
   (maybe-decrypt-bytes b source nil))
  (^bytes [b      :- [:maybe bytes?]
           source :- [:maybe ::source]
           opts   :- [:maybe DecryptOpts]]
   (cond
     (nil? (opts-secret-key opts)) b
     (nil? b)                      b
     (possibly-encrypted-bytes? b) (decrypt-bytes b source opts)
     (:accept-plaintext opts)      b
     :else                         (throw (not-encrypted-error source)))))
