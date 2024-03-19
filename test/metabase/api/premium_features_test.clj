(ns metabase.api.premium-features-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.airgap :as airgap]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

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

(defn- test-fake-features [& {:keys [token-fn pubk-fn]}]
  (with-redefs
    [premium-features/premium-embedding-token (constantly
                                               (-> (str/trim (slurp (io/resource "fake_ag_token.txt")))
                                                   ((or token-fn identity))))
     airgap/pubkey-reader (fn [] (-> (io/reader (io/resource "fake_pubkey.pem"))
                                     ((or pubk-fn identity))))]
    (#'airgap/decode-token (premium-features/premium-embedding-token))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Airgap

(deftest ag-token-decryption-test
  (is (contains? (set (map hash (:features (test-fake-features)))) 2117420126)))

(deftest ag-token-valid-now-test
  (testing "Token time is valid"
    ;; the test token is valid until 2054
    (is (true? (#'airgap/valid-now? (test-fake-features))))))

(deftest ag-invalid-token-test
  (testing "Invalid token format"
    (is (thrown-with-msg? Exception
         "Message seems corrupt or manipulated."
         (test-fake-features :token-fn (fn [token] (str token "x"))))))
  (testing "Invalid public key format"
    (is (thrown-with-msg? Exception
         #"unable to convert key pair: encoded key spec not recognized: invalid info structure in RSA public key"
         (test-fake-features
          :pubk-fn (fn [_] (io/reader (io/resource "broken_pubkey.pem"))))))))
