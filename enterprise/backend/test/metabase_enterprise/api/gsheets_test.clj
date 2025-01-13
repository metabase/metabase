(ns metabase-enterprise.api.gsheets-test
  (:require [clojure.test :refer [deftest is testing]]
            [metabase-enterprise.gsheets :as gsheets.api]
            [metabase.test.util :as tu]))

(deftest validate-link-format-test)

(deftest ->config-good-test
  (testing "Both are there"
    (tu/with-temporary-setting-values
      [api-key "mb_api_key_123"
       store-api-url "http://store-api-url.com"]
      (is (= {:store-api-url "http://store-api-url.com", :api-key "mb_api_key_123"}
             (#'gsheets.api/->config))))))

(deftest ->config-missing-api-key-test
  (tu/with-temporary-setting-values
    [api-key nil
     store-api-url "http://store-api-url.com"]
    (is (thrown-with-msg?
         Exception
         #"Missing api-key."
         (#'gsheets.api/->config)))))

(deftest ->config-missing-both-test
  (tu/with-temporary-setting-values
    [api-key ""
     store-api-url nil]
    (is (thrown-with-msg?
         Exception
         #"Missing api-key."
         (#'gsheets.api/->config)))))

(deftest service-account-not-setup?-test
  (let [*hm-call-count (atom 0)]
    (with-redefs [gsheets.api/hm-service-account-setup? (fn [] (swap! *hm-call-count inc) false)]
      (tu/with-temporary-setting-values
        [store-api-url "http://store-api-url"
         api-key "mb_api_key_123"]
        (is (false? (#'gsheets.api/hm-service-account-setup?)))
        (is (= 1 @*hm-call-count))))))

(deftest service-account-is-setup?-test
  (let [*hm-call-count (atom 0)]
    (with-redefs [gsheets.api/hm-service-account-setup? (fn [] (swap! *hm-call-count inc) true)]
      (tu/with-temporary-setting-values
        [store-api-url "http://store-api-url"
         api-key "mb_api_key_123"]
        (is (true? (#'gsheets.api/hm-service-account-setup?)))
        (is (= 1 @*hm-call-count))
        (is (true? (#'gsheets.api/hm-service-account-setup?)))
        (is (= 2 @*hm-call-count))))))
