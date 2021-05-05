(ns metabase.util.encryption-test
  "Tests for encryption of Metabase DB details."
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.models.setting.cache :as setting.cache]
            [metabase.test.initialize :as initialize]
            [metabase.test.util :as tu]
            [metabase.util.encryption :as encryption]))

(defn do-with-secret-key [^String secret-key thunk]
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
  with and without encryption disabled."
  {:style/indent 1}
  [^String secret-key, & body]
  `(do-with-secret-key ~secret-key (fn [] ~@body)))

(def ^:private secret   (encryption/secret-key->hash "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ="))
(def ^:private secret-2 (encryption/secret-key->hash "0B9cD6++AME+A7/oR7Y2xvPRHX3cHA2z7w+LbObd/9Y="))

(deftest repeatable-hashing-test
  (testing "test that hashing a secret key twice gives you the same results"
    (is (= (vec (encryption/secret-key->hash "Toucans"))
           (vec (encryption/secret-key->hash "Toucans"))))))

(deftest unique-hashes-test
  (testing (is (not= (vec secret)
                     (vec secret-2)))))

(deftest hash-pattern-test
  (is (re= #"^[0-9A-Za-z/+]+=*$"
           (encryption/encrypt secret "Hello!"))))

(deftest hashing-isnt-idempotent-test
  (testing "test that encrypting something twice gives you two different ciphertexts"
    (is (not= (encryption/encrypt secret "Hello!")
              (encryption/encrypt secret "Hello!")))))

(deftest decrypt-test
  (testing "test that we can decrypt something"
    (is (= "Hello!"
           (encryption/decrypt secret (encryption/encrypt secret "Hello!"))))))

(deftest exception-with-wrong-decryption-key-test
  (testing "trying to decrypt something with the wrong key with `decrypt` should throw an Exception"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Message seems corrupt or manipulated"
         (encryption/decrypt secret-2 (encryption/encrypt secret "WOW"))))))

(deftest maybe-decrypt-not-encrypted-test
  (testing "trying to `maybe-decrypt` something that's not encrypted should return it as-is"
    (is (= "{\"a\":100}"
           (encryption/maybe-decrypt secret "{\"a\":100}")))
    (is (= "abc"
           (encryption/maybe-decrypt secret "abc")))))

(deftest maybe-decrypt-with-wrong-key-test
  (testing (str "trying to decrypt something that is encrypted with the wrong key with `maybe-decrypt` should return "
                "the ciphertext...")
    (let [original-ciphertext (encryption/encrypt secret "WOW")]
      (is (= original-ciphertext
             (encryption/maybe-decrypt secret-2 original-ciphertext))))))

(defn- includes-encryption-warning? [log-messages]
  (some (fn [[level _ message]]
          (and (= level :warn)
               (str/includes? message (str "Cannot decrypt encrypted string. Have you changed or forgot to set "
                                           "MB_ENCRYPTION_SECRET_KEY? Message seems corrupt or manipulated."))))
        log-messages))

(deftest no-errors-for-unencrypted-test
  (testing "Something obviously not encrypted should avoiding trying to decrypt it (and thus not log an error)"
    (is (= []
           (tu/with-log-messages-for-level :warn
             (encryption/maybe-decrypt secret "abc"))))))

(def ^:private fake-ciphertext
  "AES+CBC's block size is 16 bytes and the tag length is 32 bytes. This is a string of characters that is the same
  length as would be expected for something that has been encrypted, but it is not encrypted, just unlucky enough to
  have the same size"
  (apply str (repeat 64 "a")))

(deftest log-warning-on-failure-test
  (testing (str "Something that is not encrypted, but might be (is the correct shape etc) should attempt to be "
                "decrypted. If unable to decrypt it, log a warning.")
    (is (includes-encryption-warning?
         (tu/with-log-messages-for-level :warn
           (encryption/maybe-decrypt secret fake-ciphertext))))
    (is (includes-encryption-warning?
         (tu/with-log-messages-for-level :warn
           (encryption/maybe-decrypt secret-2 (encryption/encrypt secret "WOW")))))))

(deftest possibly-encrypted-test
  (testing "Something that is not encrypted, but might be should return the original text"
    (is (= fake-ciphertext
           (encryption/maybe-decrypt secret fake-ciphertext)))))
