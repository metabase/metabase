(ns metabase.util.encryption-test
  "Tests for encryption of Metabase DB details."
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase.test.util :as tu]
            [metabase.util.encryption :as encryption]))

(defn do-with-secret-key [^String secret-key, f]
  (with-redefs [encryption/default-secret-key (when (seq secret-key)
                                                (encryption/secret-key->hash secret-key))]
    (f)))

(defmacro with-secret-key
  "Run `body` with the encryption secret key temporarily bound to `secret-key`. Useful for testing how functions behave
  with and without encryption disabled."
  {:style/indent 1}
  [^String secret-key, & body]
  `(do-with-secret-key ~secret-key (fn [] ~@body)))

(def ^:private secret   (encryption/secret-key->hash "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ="))
(def ^:private secret-2 (encryption/secret-key->hash "0B9cD6++AME+A7/oR7Y2xvPRHX3cHA2z7w+LbObd/9Y="))

;; test that hashing a secret key twice gives you the same results
(expect
  (= (vec (encryption/secret-key->hash "Toucans"))
     (vec (encryption/secret-key->hash "Toucans"))))

;; two different secret keys should have different results
(expect (not= (vec secret)
              (vec secret-2)))

;; test that we can encrypt a message. Should be base-64
(expect
  #"^[0-9A-Za-z/+]+=*$"
  (encryption/encrypt secret "Hello!"))

;; test that encrypting something twice gives you two different ciphertexts
(expect
  (not= (encryption/encrypt secret "Hello!")
        (encryption/encrypt secret "Hello!")))

;; test that we can decrypt something
(expect
  "Hello!"
  (encryption/decrypt secret (encryption/encrypt secret "Hello!")))

;; trying to decrypt something with the wrong key with `decrypt` should throw an Exception
(expect
  Exception
  (encryption/decrypt secret-2 (encryption/encrypt secret "WOW")))

;; trying to `maybe-decrypt` something that's not encrypted should return it as-is
(expect
  "{\"a\":100}"
  (encryption/maybe-decrypt secret "{\"a\":100}"))

;; trying to decrypt something that is encrypted with the wrong key with `maybe-decrypt` should return `nil`...
(expect
  nil
  (encryption/maybe-decrypt secret-2 (encryption/encrypt secret "WOW")))

(expect
  (some (fn [[_ _ message]]
          (str/includes? message (str "Cannot decrypt encrypted credentials. Have you changed or forgot to set "
                                      "MB_ENCRYPTION_SECRET_KEY? Message seems corrupt or manipulated.")))
        (tu/with-log-messages
          (encryption/maybe-decrypt secret-2 (encryption/encrypt secret "WOW")))))
