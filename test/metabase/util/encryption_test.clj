(ns metabase.util.encryption-test
  "Tests for encryption of Metabase DB details."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.test :as mt]
   [metabase.test.initialize :as initialize]
   [metabase.util.encryption :as encryption]
   [metabase.util.string :as string])
  (:import (java.io ByteArrayInputStream)
           (org.apache.commons.io IOUtils)))

(set! *warn-on-reflection* true)

(defn- clear-setting-cache!
  "Empty the Setting cache so values have to be fetched from the DB again. Emptied rather than restored: restoring
  reads and decrypts every setting row there and then, which fails on rows written under a key other than the one in
  effect at the boundary -- exactly what changing keys leaves behind. The once-a-minute throttle on the check that
  repopulates an empty cache is zeroed too, so the next read restores it whole instead of going to the DB row by row."
  []
  (reset! (#'setting.cache/cache*) nil)
  (.set ^java.util.concurrent.atomic.AtomicLong @#'setting.cache/last-update-check 0))

(defn do-with-secret-key! [^String secret-key thunk]
  (initialize/initialize-if-needed! :db)
  (clear-setting-cache!)
  (try
    (with-redefs [encryption/default-secret-key (when (seq secret-key)
                                                  (encryption/secret-key->hash secret-key))]
      (thunk))
    (finally
      ;; clear the cache again so nothing that happened during the test is persisted.
      (clear-setting-cache!))))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
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
  (testing (is (not= (vec secret)
                     (vec secret-2)))))

(deftest ^:parallel hash-pattern-test
  (is (re= #"^[0-9A-Za-z/+]+=*$"
           (encryption/encrypt "Hello!" {:secret-key secret}))))

(deftest ^:parallel hashing-isnt-idempotent-test
  (testing "test that encrypting something twice gives you two different ciphertexts"
    (is (not= (encryption/encrypt "Hello!" {:secret-key secret})
              (encryption/encrypt "Hello!" {:secret-key secret})))))

(deftest ^:parallel decrypt-test
  (testing "test that we can decrypt something"
    (is (= "Hello!"
           (encryption/decrypt (encryption/encrypt "Hello!" {:secret-key secret}) {:secret-key secret})))))

(deftest ^:parallel decrypt-bytes-test
  (testing "test that we can decrypt binary data"
    (let [data (byte-array (range 0 100))]
      (is (= (seq data)
             (seq (encryption/decrypt-bytes (encryption/encrypt-bytes data {:secret-key secret}) {:secret-key secret})))))))

(deftest ^:parallel exception-with-wrong-decryption-key-test
  (testing "trying to decrypt something with the wrong key with `decrypt` should throw an Exception"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Message seems corrupt or manipulated"
         (encryption/decrypt (encryption/encrypt "WOW" {:secret-key secret}) {:secret-key secret-2})))))

(deftest ^:parallel maybe-decrypt-not-encrypted-test
  (testing "trying to `maybe-decrypt-accepting-plaintext` something that's not encrypted should return it as-is"
    (is (= "{\"a\":100}"
           (encryption/maybe-decrypt-accepting-plaintext "{\"a\":100}" {:secret-key secret})))
    (is (= "abc"
           (encryption/maybe-decrypt-accepting-plaintext "abc" {:secret-key secret})))))

(deftest ^:parallel maybe-decrypt-with-wrong-key-test
  (testing (str "decrypting something encrypted with a different key using `maybe-decrypt-accepting-plaintext` throws "
                "rather than returning the ciphertext — returning it would let a re-encrypting caller double-encrypt it")
    (let [original-ciphertext (encryption/encrypt "WOW" {:secret-key secret})]
      (is (thrown? Throwable
                   (encryption/maybe-decrypt-accepting-plaintext original-ciphertext {:secret-key secret-2}))))))

(deftest ^:parallel no-errors-for-unencrypted-test
  (testing "Something obviously not encrypted should avoiding trying to decrypt it (and thus not log an error)"
    (mt/with-log-messages-for-level [messages :warn]
      (encryption/maybe-decrypt-accepting-plaintext "abc" {:secret-key secret})
      (is (empty? (messages))))))

(def ^:private fake-ciphertext
  "AES+CBC's block size is 16 bytes and the tag length is 32 bytes, so the shortest possible ciphertext is 64 bytes
  (IV + one block + tag). This base64 string decodes to 64 bytes: the size of something that has been encrypted, but
  it is not encrypted, just unlucky enough to have the same size"
  (str (apply str (repeat 86 "a")) "=="))

(deftest ^:parallel possibly-encrypted-test
  (testing "a value shaped like ciphertext but that cannot be decrypted with the current key throws rather than being returned as-is"
    (is (thrown? Throwable
                 (encryption/maybe-decrypt-accepting-plaintext fake-ciphertext {:secret-key secret})))))

(deftest ^:parallel decryptable-string-test
  (testing "true only for ciphertext that decrypts with the given key"
    (let [ciphertext (encryption/encrypt "WOW" {:secret-key secret})]
      (is (true? (encryption/decryptable-string? ciphertext {:secret-key secret})))
      (testing "false for ciphertext under another key"
        (is (false? (encryption/decryptable-string? ciphertext {:secret-key secret-2}))))
      (testing "false with no key, even for genuine ciphertext"
        (is (false? (encryption/decryptable-string? ciphertext {:secret-key nil}))))))
  (testing "false for anything that is not ciphertext"
    (is (false? (encryption/decryptable-string? "WOW" {:secret-key secret})))
    (is (false? (encryption/decryptable-string? "" {:secret-key secret})))
    (is (false? (encryption/decryptable-string? nil {:secret-key secret})))
    (testing "including plaintext shaped like ciphertext, which `possibly-encrypted-string?` cannot tell apart"
      (is (true? (encryption/possibly-encrypted-string? fake-ciphertext)))
      (is (false? (encryption/decryptable-string? fake-ciphertext {:secret-key secret}))))))

(deftest ^:parallel decryptable-bytes-test
  (let [plaintext  (codecs/to-bytes "WOW")
        ciphertext (encryption/encrypt-bytes plaintext {:secret-key secret})
        fake-bytes (byte-array 64)]
    (testing "true only for ciphertext that decrypts with the given key"
      (is (true? (encryption/decryptable-bytes? ciphertext {:secret-key secret})))
      (is (false? (encryption/decryptable-bytes? ciphertext {:secret-key secret-2})))
      (is (false? (encryption/decryptable-bytes? ciphertext {:secret-key nil}))))
    (testing "false for anything that is not ciphertext"
      (is (false? (encryption/decryptable-bytes? plaintext {:secret-key secret})))
      (is (false? (encryption/decryptable-bytes? (byte-array 0) {:secret-key secret})))
      (is (false? (encryption/decryptable-bytes? nil {:secret-key secret})))
      (testing "including bytes shaped like ciphertext"
        (is (true? (encryption/possibly-encrypted-bytes? fake-bytes)))
        (is (false? (encryption/decryptable-bytes? fake-bytes {:secret-key secret})))))))

(deftest ^:parallel possibly-encrypted-returns-booleans-test
  (testing "the shape checks never return nil"
    (is (false? (encryption/possibly-encrypted-string? nil)))
    (is (false? (encryption/possibly-encrypted-string? "")))
    (is (false? (encryption/possibly-encrypted-string? "not base64!")))
    (is (false? (encryption/possibly-encrypted-bytes? nil)))
    (is (false? (encryption/possibly-encrypted-bytes? (byte-array 3))))
    (is (true? (encryption/possibly-encrypted-string? (encryption/encrypt "WOW" {:secret-key secret}))))))

(deftest ^:parallel maybe-decrypt-strict-test
  (testing "strict `maybe-decrypt`"
    (testing "decrypts a genuinely encrypted value"
      (is (= "WOW" (encryption/maybe-decrypt (encryption/encrypt "WOW" {:secret-key secret}) {:secret-key secret}))))
    (testing "throws on a value that is not encrypted"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not encrypted"
                            (encryption/maybe-decrypt "{\"a\":100}" {:secret-key secret})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not encrypted"
                            (encryption/maybe-decrypt "abc" {:secret-key secret}))))
    (testing "throws on a value that looks encrypted but fails to decrypt (wrong key or corrupt)"
      (is (thrown? Throwable (encryption/maybe-decrypt fake-ciphertext {:secret-key secret})))
      (is (thrown? Throwable (encryption/maybe-decrypt (encryption/encrypt "WOW" {:secret-key secret}) {:secret-key secret-2}))))
    (testing "decrypts an encrypted byte array"
      (is (= "WOW" (String. ^bytes (encryption/maybe-decrypt-bytes (encryption/encrypt-bytes (.getBytes "WOW") {:secret-key secret}) {:secret-key secret})))))
    (testing "passes nil through but rejects a blank (non-encrypted) string"
      (is (nil? (encryption/maybe-decrypt nil)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not encrypted"
                            (encryption/maybe-decrypt "" {:secret-key secret}))))))

(deftest ^:parallel stream-encryption-test
  (testing "Can encrypt stream"
    (let [input-stream (ByteArrayInputStream. (.getBytes "test string"))
          encrypted-stream (encryption/encrypt-stream input-stream {:secret-key secret})
          output-string (slurp encrypted-stream)]
      (is (not= "test string" output-string))))
  (testing "Can encrypt and decrypt streams"
    (let [input-stream (ByteArrayInputStream. (.getBytes "test string"))]
      (with-open [encrypted-stream (encryption/encrypt-stream input-stream {:secret-key secret})
                  decrypted-stream (encryption/maybe-decrypt-stream encrypted-stream {:secret-key secret})]
        (is (= "test string" (slurp decrypted-stream))))))
  (testing "Can encrypt and decrypt a large stream"
    (let [data (string/random-string 100000)
          input-stream (ByteArrayInputStream. (codecs/to-bytes data))]
      (with-open [encrypted-stream (encryption/encrypt-stream input-stream {:secret-key secret})
                  decrypted-stream (encryption/maybe-decrypt-stream encrypted-stream {:secret-key secret})]
        (is (= data (codecs/bytes->str (IOUtils/toByteArray decrypted-stream)))))))
  (testing "Unencrypted streams come back as-is"
    (let [input-stream (ByteArrayInputStream. (codecs/to-bytes "test string"))]
      (with-open [decrypted-stream (encryption/maybe-decrypt-stream input-stream {:secret-key secret})]
        (is (= "test string" (codecs/bytes->str (IOUtils/toByteArray decrypted-stream)))))))
  (testing "Empty unencrypted streams come back as-is"
    (let [input-stream (ByteArrayInputStream. (byte-array 0))]
      (with-open [decrypted-stream (encryption/maybe-decrypt-stream input-stream {:secret-key secret})]
        (is (= -1 (.read decrypted-stream))))))
  (testing "Long unencrypted streams come back as-is"
    (let [data (string/random-string 100000)
          input-stream (ByteArrayInputStream. (codecs/to-bytes data))]
      (with-open [decrypted-stream (encryption/maybe-decrypt-stream input-stream {:secret-key secret})]
        (is (= data (codecs/bytes->str (IOUtils/toByteArray decrypted-stream))))))))

(deftest ^:parallel maybe-encrypt-for-stream-test
  (testing "When secret is set, it encrypts the stream"
    (let [encrypted (encryption/maybe-encrypt-for-stream (codecs/to-bytes "test string") {:secret-key secret})]
      (is (not= "test string" (codecs/bytes->str encrypted)))
      (is (= "test string" (slurp (encryption/maybe-decrypt-stream (ByteArrayInputStream. encrypted) {:secret-key secret})))))
    (testing "When secret is not set, it does not encrypt the stream"
      (let [encrypted (encryption/maybe-encrypt-for-stream (codecs/to-bytes "test string") {:secret-key nil})]
        (is (= "test string" (codecs/bytes->str encrypted)))))))
