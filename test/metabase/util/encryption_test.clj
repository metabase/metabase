(ns metabase.util.encryption-test
  "Tests for encryption of Metabase DB details."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.crypto :as crypto]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.test :as mt]
   [metabase.test.initialize :as initialize]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption.dek :as dek]
   [metabase.util.string :as string]
   [ring.util.codec :as codec])
  (:import (java.io ByteArrayInputStream)
           (org.apache.commons.io IOUtils)))

(set! *warn-on-reflection* true)

(defn do-with-secret-key! [^String secret-key thunk]
  ;; flush the Setting cache so unencrypted values have to be fetched from the DB again
  (initialize/initialize-if-needed! :db)
  (setting.cache/restore-cache!)
  (try
    (with-redefs [encryption/default-secret-key (when (seq secret-key)
                                                  (encryption/secret-key->hash secret-key))]
      (thunk))
    (finally
      ;; reset the cache again so nothing that happened during the test is persisted.
      (setting.cache/restore-cache!))))

(defmacro with-secret-key
  "Run `body` with the encryption secret key temporarily bound to `secret-key`. Useful for testing how functions behave
  with and without encryption disabled. A nil secret key disables encryption."
  {:style/indent 1}
  [^String secret-key & body]
  `(let [secret-key# ~secret-key]
     (testing (format "\nwith secret key %s" (pr-str secret-key#))
       (do-with-secret-key! secret-key# (fn [] ~@body)))))

(def ^:private secret-string "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ=")

(def ^:private secret   (encryption/secret-key->hash secret-string))
(def ^:private secret-2 (encryption/secret-key->hash "0B9cD6++AME+A7/oR7Y2xvPRHX3cHA2z7w+LbObd/9Y="))

(deftest ^:parallel repeatable-hashing-test
  (testing "test that hashing a secret key twice gives you the same results"
    (is (= (vec (encryption/secret-key->hash "Toucans"))
           (vec (encryption/secret-key->hash "Toucans"))))))

(deftest ^:parallel unique-hashes-test
  (is (not= (vec secret)
            (vec secret-2))))

(deftest ^:parallel hash-pattern-test
  (is (re= #"^[0-9A-Za-z/+]+=*$"
           (encryption/encrypt secret "Hello!"))))

(deftest ^:parallel hashing-isnt-idempotent-test
  (testing "test that encrypting something twice gives you two different ciphertexts"
    (is (not= (encryption/encrypt secret "Hello!")
              (encryption/encrypt secret "Hello!")))))

(deftest ^:parallel decrypt-test
  (testing "test that we can decrypt something"
    (is (= "Hello!"
           (encryption/decrypt secret (encryption/encrypt secret "Hello!"))))))

(deftest ^:parallel decrypt-bytes-test
  (testing "test that we can decrypt binary data"
    (let [data (byte-array (range 0 100))]
      (is (= (seq data)
             (seq (encryption/decrypt-bytes secret (encryption/encrypt-bytes secret data))))))))

(deftest ^:parallel exception-with-wrong-decryption-key-test
  (testing "trying to decrypt something with the wrong key with `decrypt` should throw an Exception"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Message seems corrupt or manipulated"
         (encryption/decrypt secret-2 (encryption/encrypt secret "WOW"))))))

(deftest ^:parallel maybe-decrypt-not-encrypted-test
  (testing "trying to `maybe-decrypt` something that's not encrypted should return it as-is"
    (is (= "{\"a\":100}"
           (encryption/maybe-decrypt secret "{\"a\":100}")))
    (is (= "abc"
           (encryption/maybe-decrypt secret "abc")))))

(deftest ^:parallel maybe-decrypt-with-wrong-key-test
  (testing (str "trying to decrypt something that is encrypted with the wrong key with `maybe-decrypt` should return "
                "the ciphertext...")
    (let [original-ciphertext (encryption/encrypt secret "WOW")]
      (is (= original-ciphertext
             (encryption/maybe-decrypt secret-2 original-ciphertext))))))

(defn- includes-encryption-warning? [log-messages]
  (some (fn [{:keys [level message]}]
          (and (= level :warn)
               (str/includes? message (str "Cannot decrypt encrypted String. Have you changed or forgot to set "
                                           "MB_ENCRYPTION_SECRET_KEY?"))))
        log-messages))

(deftest ^:parallel no-errors-for-unencrypted-test
  (testing "Something obviously not encrypted should avoiding trying to decrypt it (and thus not log an error)"
    (mt/with-log-messages-for-level [messages :warn]
      (encryption/maybe-decrypt secret "abc")
      (is (empty? (messages))))))

(def ^:private fake-ciphertext
  "AES+CBC's block size is 16 bytes and the tag length is 32 bytes. This is a string of characters that is the same
  length as would be expected for something that has been encrypted, but it is not encrypted, just unlucky enough to
  have the same size"
  (apply str (repeat 64 "a")))

(deftest ^:parallel log-warning-on-failure-test
  (testing (str "Something that is not encrypted, but might be (is the correct shape etc) should attempt to be "
                "decrypted. If unable to decrypt it, log a warning.")
    (mt/with-log-messages-for-level [messages :warn]
      (encryption/maybe-decrypt secret fake-ciphertext)
      (is (includes-encryption-warning? (messages))))
    (mt/with-log-messages-for-level [messages :warn]
      (encryption/maybe-decrypt secret-2 (encryption/encrypt secret "WOW"))
      (is (includes-encryption-warning? (messages))))))

(deftest ^:parallel possibly-encrypted-test
  (testing "Something that is not encrypted, but might be should return the original text"
    (is (= fake-ciphertext
           (encryption/maybe-decrypt secret fake-ciphertext)))))

(deftest ^:parallel stream-encryption-test
  (testing "Can encrypt stream"
    (let [input-stream (ByteArrayInputStream. (.getBytes "test string"))
          encrypted-stream (encryption/encrypt-stream secret input-stream)
          output-string (slurp encrypted-stream)]
      (is (not= "test string" output-string))))
  (testing "Can encrypt and decrypt streams"
    (let [input-stream (ByteArrayInputStream. (.getBytes "test string"))]
      (with-open [encrypted-stream (encryption/encrypt-stream secret input-stream)
                  decrypted-stream (encryption/maybe-decrypt-stream secret encrypted-stream)]
        (is (= "test string" (slurp decrypted-stream))))))
  (testing "Can encrypt and decrypt a large stream"
    (let [data (string/random-string 100000)
          input-stream (ByteArrayInputStream. (codecs/to-bytes data))]
      (with-open [encrypted-stream (encryption/encrypt-stream secret input-stream)
                  decrypted-stream (encryption/maybe-decrypt-stream secret encrypted-stream)]
        (is (= data (codecs/bytes->str (IOUtils/toByteArray decrypted-stream)))))))
  (testing "Unencrypted streams come back as-is"
    (let [input-stream (ByteArrayInputStream. (codecs/to-bytes "test string"))]
      (with-open [decrypted-stream (encryption/maybe-decrypt-stream secret input-stream)]
        (is (= "test string" (codecs/bytes->str (IOUtils/toByteArray decrypted-stream)))))))
  (testing "Empty unencrypted streams come back as-is"
    (let [input-stream (ByteArrayInputStream. (byte-array 0))]
      (with-open [decrypted-stream (encryption/maybe-decrypt-stream secret input-stream)]
        (is (= -1 (.read decrypted-stream))))))
  (testing "Long unencrypted streams come back as-is"
    (let [data (string/random-string 100000)
          input-stream (ByteArrayInputStream. (codecs/to-bytes data))]
      (with-open [decrypted-stream (encryption/maybe-decrypt-stream secret input-stream)]
        (is (= data (codecs/bytes->str (IOUtils/toByteArray decrypted-stream))))))))

(deftest ^:parallel maybe-encrypt-for-stream-test
  (testing "When secret is set, it encrypts the stream"
    (let [encrypted (encryption/maybe-encrypt-for-stream secret (codecs/to-bytes "test string"))]
      (is (not= "test string" (codecs/bytes->str encrypted)))
      (is (= "test string" (slurp (encryption/maybe-decrypt-stream secret (ByteArrayInputStream. encrypted))))))
    (testing "When secret is not set, it does not encrypt the stream"
      (let [encrypted (encryption/maybe-encrypt-for-stream nil (codecs/to-bytes "test string"))]
        (is (= "test string" (codecs/bytes->str encrypted)))))))

;;; ------------------------------------------- v2 envelope format tests -------------------------------------------

(defmacro ^:private with-store
  "Bind a fresh in-memory DEK store so `maybe-encrypt` writes v2. Each store has a unique identity, and the process DEK
  cache is keyed by that identity (plus a KEK fingerprint), so cached material never collides across parallel tests
  and no cache clearing is needed here."
  [& body]
  `(binding [dek/*store* (dek/in-memory-store)]
     ~@body))

(deftest ^:parallel v2-string-round-trip-test
  (testing "with a DEK store initialized, maybe-encrypt writes v2 and maybe-decrypt reads it back"
    (with-store
      (let [ct (encryption/maybe-encrypt secret "Hello, envelope!")]
        (is (encryption/v2-string? ct))
        (is (not (encryption/v2-bytes? (codecs/to-bytes "Hello, envelope!"))))
        (is (= "Hello, envelope!" (encryption/maybe-decrypt secret ct)))))))

(deftest ^:parallel v2-bytes-round-trip-test
  (testing "byte values round-trip through the v2 envelope"
    (with-store
      (let [data (byte-array (range 0 100))
            ct   (encryption/maybe-encrypt-bytes secret data)]
        (is (encryption/v2-bytes? ct))
        (is (= (seq data) (seq (encryption/maybe-decrypt secret ct))))))))

;; not ^:parallel: mints a second generation on the bound store (a destructive store operation)
(deftest v2-uses-active-generation-test
  (testing "writes use the newest generation; older generations stay readable"
    (with-store
      (let [ct-gen1 (encryption/maybe-encrypt secret "under gen 1")]
        (dek/mint-generation! dek/*store* secret)
        (let [ct-gen2 (encryption/maybe-encrypt secret "under gen 2")]
          (is (= "under gen 1" (encryption/maybe-decrypt secret ct-gen1)))
          (is (= "under gen 2" (encryption/maybe-decrypt secret ct-gen2))))))))

(deftest ^:parallel v2-generation-id-header-round-trips-test
  (testing "the 4-byte generation-id header round-trips for ids with high bytes >= 0x80 (unchecked-byte, not byte)"
    ;; `clojure.core/byte` throws for 128-255, so ids whose big-endian bytes include one >= 0x80 (first hit: id 128)
    ;; would make every v2 write throw. Seed the store at each id so `active-generation` reports exactly that id.
    (doseq [gen-id [1 127 128 200 255 256 65535 65536 305419896]] ; 305419896 = 0x12345678
      (testing (format "generation id %d (0x%X)" gen-id gen-id)
        (binding [dek/*store* (dek/in-memory-store {gen-id (dek/wrap-dek secret (dek/random-dek))})]
          (let [ct (encryption/maybe-encrypt secret "payload for a high generation id")]
            (is (encryption/v2-string? ct))
            (is (= gen-id (encryption/v2-generation-id-of-string ct))
                "the encoded generation id must match after the unchecked-byte round-trip")
            (is (= "payload for a high generation id" (encryption/maybe-decrypt secret ct)))))))))

(deftest ^:parallel v2-wrong-kek-is-deterministic-test
  (testing "decrypting v2 under the wrong KEK fails deterministically (GCM auth), returning ciphertext unchanged"
    (let [ct (with-store (encryption/maybe-encrypt secret "secret data"))]
      ;; a fresh store cannot unwrap the DEK that produced ct, and even the right store fails under the wrong KEK
      (with-store
        (is (= ct (encryption/maybe-decrypt secret-2 ct)))))))

(deftest ^:parallel v2-write-falls-back-to-legacy-before-init-test
  (testing "without a DEK store bound, writes use the legacy KEK-direct format"
    (binding [dek/*store* nil]
      (let [ct (encryption/maybe-encrypt secret "legacy please")]
        (is (not (encryption/v2-string? ct)))
        (is (encryption/possibly-encrypted-string? ct))
        (is (= "legacy please" (encryption/maybe-decrypt secret ct)))))))

(deftest ^:parallel legacy-values-stay-readable-with-store-test
  (testing "legacy ciphertext still decrypts even when a v2 DEK store is active"
    (let [legacy-ct (binding [dek/*store* nil] (encryption/encrypt secret "old value"))]
      (with-store
        (is (not (encryption/v2-string? legacy-ct)))
        (is (= "old value" (encryption/maybe-decrypt secret legacy-ct)))))))

;;; ---- Format detection on adversarial inputs ----

(deftest ^:parallel v2-detection-adversarial-test
  (testing "plaintext that looks like base64 is not mistaken for v2"
    (is (not (encryption/v2-string? "aGVsbG8gd29ybGQ="))) ; base64("hello world")
    (is (not (encryption/v2-string? "not base64 at all !!"))))
  (testing "legacy ciphertext is never mistaken for v2"
    (let [legacy-ct (binding [dek/*store* nil] (encryption/encrypt secret "x"))]
      (is (not (encryption/v2-string? legacy-ct)))))
  (testing "a value whose bytes happen to start with 'MB' but wrong version is not v2"
    ;; "MB" + version byte 1 (not 2) + padding
    (let [fake (codec/base64-encode (byte-array (concat [(byte \M) (byte \B) 1] (repeat 8 0))))]
      (is (not (encryption/v2-string? fake)))))
  (testing "raw legacy bytes are not detected as v2 bytes"
    (let [legacy-bytes (binding [dek/*store* nil] (encryption/encrypt-bytes secret (byte-array (range 0 48))))]
      (is (not (encryption/v2-bytes? legacy-bytes)))))
  (testing "nil and empty inputs are safe"
    (is (not (encryption/v2-bytes? nil)))
    (is (not (encryption/v2-bytes? (byte-array 0))))
    (is (not (encryption/v2-string? nil)))
    (is (not (encryption/v2-string? "")))))

;;; ---- Golden-value compatibility tests ----
;;;
;;; The v2 format is a public compatibility contract: these hard-coded ciphertexts must decrypt forever, exactly like
;;; the legacy golden values below. Regenerate ONLY if the format is intentionally revved (which would be a v3).

(def ^:private golden-kek
  "The 64-byte KEK hash of a fixed passphrase, used for all golden-value tests."
  (encryption/secret-key->hash "golden-envelope-test-key-000000000000000000"))

(def ^:private golden-wrapped-dek
  "A fixed DEK, wrapped under `golden-kek` with AES-256-GCM, base64-encoded. Seeds a golden in-memory store as
  generation 1. Pinned: this exact wrapped blob must keep unwrapping under `golden-kek` forever."
  "yt+PKk1LdyTo8NLQn2rh4a/CCk+8lK9BkkKTkoVIry0YAzOQfTFJtHecJj2gkqjJlypF39h+m0AtDsil")

(def ^:private golden-v2-string
  "A hard-coded v2 string ciphertext of \"golden value\" under generation 1 of the golden DEK. Must decrypt forever."
  "TUICAAAAAaV2ePSvgOrK+c1nX3Kq1TCZo1b4/d0u0uoWxXLu+B08VHbyB48W9L0=")

(deftest ^:parallel golden-v2-string-decrypts-forever-test
  (testing "a hard-coded v2 ciphertext decrypts to its plaintext (public compatibility contract)"
    ;; a fresh store with a unique identity: its cached DEK material never collides with any other test's
    (binding [dek/*store* (dek/in-memory-store {1 (codec/base64-decode golden-wrapped-dek)})]
      (is (= "golden value" (encryption/maybe-decrypt golden-kek golden-v2-string))))))

(def ^:private golden-v2-bytes
  "A hard-coded v2 *raw-bytes* ciphertext (the secrets path) of \"golden bytes value\" under generation 1 of the golden
  DEK, base64-encoded here only for a stable literal. Decodes to the raw v2 blob the byte column would store. Must
  decrypt forever — the byte form is a public compatibility contract just like the string form."
  "TUICAAAAAecB0ZrXtMizPhbRrHltoJehUMklcSlnM6OypCFuN7fT7IixO+0GLKnqrNoExG4=")

(deftest ^:parallel golden-v2-bytes-decrypts-forever-test
  (testing "a hard-coded v2 raw-bytes ciphertext decrypts to its plaintext bytes (public compatibility contract)"
    (binding [dek/*store* (dek/in-memory-store {1 (codec/base64-decode golden-wrapped-dek)})]
      (let [raw (codec/base64-decode golden-v2-bytes)]
        (is (encryption/v2-bytes? raw))
        (is (= "golden bytes value"
               (codecs/bytes->str (encryption/maybe-decrypt golden-kek raw))))))))

;;; ---- v2 misdetection fallback (a real legacy value whose bytes start with the v2 magic) ----

(defn- legacy-encrypt-with-iv
  "Build a REAL legacy CBC+HMAC ciphertext of `s` under `secret-key` with a chosen initialization vector `iv`.
  Mirrors `encryption/encrypt-bytes` internals but lets us pick the IV. The legacy decoded layout is `IV(16) ‖ msg`,
  so an IV that begins with the v2 magic (`M B 0x02`) yields a legacy value that base64-decodes to a v2-looking prefix
  — the ~2^-24 collision the legacy-fallback path must survive."
  ^String [secret-key ^bytes iv ^String s]
  (->> (crypto/encrypt (codecs/to-bytes s) secret-key iv {:algorithm :aes256-cbc-hmac-sha512})
       (concat (seq iv))
       byte-array
       codec/base64-encode))

(def ^:private v2-magic-iv
  "A 16-byte IV whose first three bytes are the v2 magic + version (`M`, `B`, 0x02). The remaining bytes are arbitrary
  but fixed so the crafted legacy value is deterministic."
  (byte-array (concat [(byte \M) (byte \B) (unchecked-byte 0x02)]
                      (range 3 16))))

(deftest ^:parallel legacy-value-with-v2-magic-prefix-still-decrypts-test
  (testing "a legacy value whose base64-decoded bytes start with the v2 magic still decrypts via the legacy fallback"
    (let [crafted (legacy-encrypt-with-iv secret v2-magic-iv "legacy pretending to be v2")]
      (testing "precondition: it really is detected as v2-shaped by the prefix check"
        (is (encryption/v2-string? crafted)))
      (testing "with a real store bound, the v2 branch fails (unknown/garbage generation) and legacy fallback wins"
        (with-store
          (is (= "legacy pretending to be v2" (encryption/maybe-decrypt secret crafted))))))))

(deftest ^:parallel legacy-value-with-v2-magic-prefix-is-not-treated-as-already-final-test
  (testing "such a crafted value must NOT be skipped as already-final on rotation: its (bogus) generation id is not in
           the store, so `generation-exists?` returns false"
    (with-store
      (let [crafted (legacy-encrypt-with-iv secret v2-magic-iv "legacy pretending to be v2")
            gen-id  (encryption/v2-generation-id-of-string crafted)]
        (is (encryption/v2-string? crafted))
        ;; the store minted only generation 1; the crafted value's generation id comes from random ciphertext bytes
        (is (not (dek/generation-exists? dek/*store* gen-id))
            "the crafted value names a generation the store does not have, so rotation will not skip it")))))

(deftest ^:parallel v2-value-without-store-throws-test
  (testing "a well-formed v2 value seen with no DEK store initialized THROWS rather than silently returning ciphertext
           (a pre-init custom migration must never persist ciphertext where decryption was expected)"
    (let [v2-ct (with-store (encryption/maybe-encrypt secret "sensitive"))]
      (binding [dek/*store* nil]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"no DEK store is initialized"
             (encryption/maybe-decrypt secret v2-ct))))))
  (testing "a non-v2 (legacy) value with no store keeps the current pass-through/decrypt behavior (no throw)"
    (let [legacy-ct (binding [dek/*store* nil] (encryption/encrypt secret "legacy ok"))]
      (binding [dek/*store* nil]
        (is (= "legacy ok" (encryption/maybe-decrypt secret legacy-ct))))))
  (testing "plaintext with no store is returned as-is (no throw)"
    (binding [dek/*store* nil]
      (is (= "just plaintext" (encryption/maybe-decrypt secret "just plaintext"))))))

;;; ---- Deterministic wrong-key / tampering through maybe-decrypt ----

(deftest ^:parallel v2-maybe-decrypt-wrong-kek-is-deterministic-test
  (testing "same store contents, wrong KEK: the DEK row cannot be unwrapped, so maybe-decrypt fails deterministically
           (GCM auth) and returns the ciphertext unchanged rather than garbage plaintext"
    ;; seed a store whose gen-1 DEK is wrapped under `secret`; reading under `secret-2` must miss the KEK-sensitive
    ;; cache and fail on the GCM unwrap.
    (let [wrapped (dek/wrap-dek secret (dek/random-dek))]
      (binding [dek/*store* (dek/in-memory-store {1 wrapped})]
        (let [ct (encryption/maybe-encrypt secret "top secret")]
          (is (encryption/v2-string? ct))
          (testing "right KEK reads it back"
            (is (= "top secret" (encryption/maybe-decrypt secret ct))))
          (testing "wrong KEK returns the ciphertext unchanged, deterministically"
            (dotimes [_ 3]
              (is (= ct (encryption/maybe-decrypt secret-2 ct))))))))))

(deftest ^:parallel v2-maybe-decrypt-tampered-body-is-deterministic-test
  (testing "right KEK, but a flipped byte in the GCM body: authentication fails deterministically and maybe-decrypt
           returns the (tampered) ciphertext unchanged, never garbage plaintext"
    (with-store
      (let [ct       (encryption/maybe-encrypt secret "authentic message")
            raw      (codec/base64-decode ct)
            ;; flip a byte inside the GCM ciphertext+tag body (past the 7-byte header + 12-byte nonce)
            _        (aset raw (dec (alength raw)) (unchecked-byte (bit-xor (aget raw (dec (alength raw))) 0xFF)))
            tampered (codec/base64-encode raw)]
        (is (encryption/v2-string? tampered))
        (dotimes [_ 3]
          (is (= tampered (encryption/maybe-decrypt secret tampered))))))))

;;; ---- Golden-value compatibility: legacy (pinned literal) ----

(def ^:private legacy-golden-secret
  "A fixed KEK for the pinned legacy golden value."
  (encryption/secret-key->hash "legacy-golden-test-key-0000000000000000000"))

(def ^:private legacy-golden-ciphertext
  "A hard-coded legacy CBC+HMAC ciphertext of \"legacy golden\" under `legacy-golden-secret`, generated once and pasted
  here. This is a pinned compatibility contract: it must decrypt forever, even with a v2 DEK store active."
  "ttCPpQ92by4mOXOJBbhRE28T4c9WN02MBnHrnucZZ69tLceopuoUpgAy/eB2fAyqWZaFHPsuEaXGCdFwQKY9rA==")

(deftest ^:parallel legacy-golden-value-still-decrypts-test
  (testing "a hard-coded legacy ciphertext decrypts forever, even with a v2 store active (forever-readable legacy)"
    (with-store
      (is (= "legacy golden" (encryption/maybe-decrypt legacy-golden-secret legacy-golden-ciphertext))))))
