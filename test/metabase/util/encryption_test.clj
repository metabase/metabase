(ns ^:mb/once metabase.util.encryption-test
  "Tests for encryption of Metabase DB details."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.test :as mt]
   [metabase.test.initialize :as initialize]
   [metabase.test.util :as tu]
   [metabase.util.encryption :as encryption])
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
    (let [data (tu/random-string 100000)
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
    (let [data (tu/random-string 100000)
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
