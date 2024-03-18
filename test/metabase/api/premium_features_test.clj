(ns metabase.api.premium-features-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.airgap :as airgap]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.test :as mt]))

(deftest get-token-status-test
  (testing "GET /api/premium-features/token/status"
    (with-redefs [premium-features/fetch-token-status (fn [_x]
                                                        {:valid    true
                                                         :status   "fake"
                                                         :features ["test" "fixture"]
                                                         :trial    false})]
      (mt/with-temporary-setting-values [:premium-embedding-token premium-features-test/random-fake-token]
        (testing "returns correctly"
          (is (= {:valid    true
                  :status   "fake"
                  :features ["test" "fixture"]
                  :trial    false}
                 (mt/user-http-request :crowberto :get 200 "premium-features/token/status"))))

        (testing "requires superusers"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "premium-features/token/status"))))))))

(deftest ag-token-status-test
  (testing "Invalid token format"
    (with-redefs [premium-features/premium-embedding-token (constantly "airgap_qwerty")]
      (testing "returns an error"
        (is (= {:valid         false
                :status        "invalid"
                :error-details "Token should be 64 hexadecimal characters."}
               (mt/user-http-request :crowberto :get 200 "premium-features/token/status"))))))  )

(defn- test-fake-features []
  (with-redefs
    [premium-features/premium-embedding-token (constantly (str/trim (slurp "test_resources/fake_ag_token.txt")))
     airgap/pubkey-reader (fn [] (io/reader (io/resource "fake_pubkey.pem")))]
    (#'airgap/decode-token (premium-features/premium-embedding-token))))

(deftest ag-token-decryption-test
  ;; (is (contains? (set (:features (test-fake-features))) "dan"))
  (is (contains? (set (map hash (:features (test-fake-features)))) 2117420126)))

(deftest ag-token-valid-now-test
  (testing "Token time is valid"
    ;; the test token is valid until 2054
    (is (true? (#'airgap/valid-now? (test-fake-features))))))
