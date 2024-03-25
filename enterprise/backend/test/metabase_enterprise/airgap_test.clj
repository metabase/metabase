(ns metabase-enterprise.airgap-test
  (:require    [clojure.java.io :as io]
               [clojure.string :as str]
               [clojure.test :refer :all]
               [metabase-enterprise.airgap :as airgap]
               [metabase.public-settings.premium-features :as premium-features]))

(defn- test-fake-features [& {:keys [token-fn pubk-fn]}]
  (with-redefs
    ;; due to the way premium embedding token is implemented, we need to provide a token and a public key,
    ;; so we cannot set this with `mt/with-temporary-setting-values`.
    [premium-features/premium-embedding-token (constantly (-> (io/resource "fake_ag_token.txt")
                                                              slurp
                                                              str/trim
                                                              ((or token-fn identity))))
     airgap/pubkey-reader (fn [] (-> (io/reader (io/resource "fake_pubkey.pem"))
                                     ((or pubk-fn identity))))]
    (#'airgap/decode-token (premium-features/premium-embedding-token))))

(deftest ag-token-decryption-test
  ;; Checks for a specific feature encoded into the fake token:
  (is (contains? (set (map hash (:features (test-fake-features)))) 2117420126)))

(deftest ag-token-valid-now-test
  (testing "Token time is valid"
    ;; the test token is valid until 2054
    (is (true? (#'airgap/valid-now? (test-fake-features))))))

(deftest ag-invalid-token-test
  (testing "Invalid token format"
    (is (thrown-with-msg? Exception
         #"Message seems corrupt or manipulated."
         (test-fake-features :token-fn (fn [token] (str token "x"))))))
  (testing "Invalid public key format"
    (is (thrown-with-msg? Exception
         #"unable to convert key pair: encoded key spec not recognized: invalid info structure in RSA public key"
         (test-fake-features
          :pubk-fn (fn [_] (io/reader (io/resource "broken_pubkey.pem"))))))))

(deftest ag-missing-pubkey-test
  (testing "Missing public key"
    (is (thrown-with-msg? Exception
         #"No public key available for airgap token"
         (test-fake-features :pubk-fn (fn [_] nil))))))
