(ns metabase.util.json-binary-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.json :as json])
  (:import
   (java.util Base64)))

(deftest bytes->base64-test
  (testing "Converting byte arrays to base64"
    (testing "with normal byte array"
      (let [bytes (.getBytes "Hello World" "UTF-8")]
        (is (= "SGVsbG8gV29ybGQ=" (json/bytes->base64 bytes)))))
    
    (testing "with empty byte array"
      (is (= "" (json/bytes->base64 (byte-array 0)))))
    
    (testing "with nil"
      (is (nil? (json/bytes->base64 nil))))))

(deftest base64->bytes-test
  (testing "Converting base64 strings back to bytes"
    (testing "with valid base64"
      (let [result (json/base64->bytes "SGVsbG8gV29ybGQ=")]
        (is (= "Hello World" (String. result "UTF-8")))))
    
    (testing "with empty string"
      (let [result (json/base64->bytes "")]
        (is (= 0 (count result)))))
    
    (testing "with nil"
      (is (nil? (json/base64->bytes nil))))))

(deftest bytes->hex-test
  (testing "Converting byte arrays to hex"
    (testing "with normal byte array"
      (let [bytes (.getBytes "Hello" "UTF-8")]
        (is (= "0x48656c6c6f" (json/bytes->hex bytes)))))
    
    (testing "with empty byte array"
      (is (= "0x" (json/bytes->hex (byte-array 0)))))
    
    (testing "with nil"
      (is (nil? (json/bytes->hex nil))))))

(deftest json-encoding-test
  (testing "JSON encoding of byte arrays"
    (testing "byte arrays are encoded as base64 strings"
      (let [bytes (.getBytes "test data" "UTF-8")
            encoded (json/encode bytes)]
        (is (string? encoded))
        ;; Should be a quoted base64 string
        (is (re-matches #"^\"[A-Za-z0-9+/]+=*\"$" encoded))))))