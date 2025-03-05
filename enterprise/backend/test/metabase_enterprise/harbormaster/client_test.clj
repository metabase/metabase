(ns metabase-enterprise.harbormaster.client-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.models.setting :as setting]
   [metabase.test.util :as mt]))

(deftest ->config-good-test
  (testing "Both needed values are present and pulled from settings"
    (mt/with-temporary-setting-values
      [api-key "mb_api_key_123"
       store-api-url "http://store-api-url.com"]
      (is (= {:store-api-url "http://store-api-url.com", :api-key "mb_api_key_123"}
             (#'hm.client/->config))))))

(deftest ->config-blank-api-key-test
  (let [grv setting/get-raw-value]
    ;; mt/with-temporary-setting-values is not used here because we want to test the behavior of the function when the
    ;; api-key is blank or nil, and mt/with-temporary-setting-values will not allow us to set the api-key to blank
    ;; or nil.
    (with-redefs [setting/get-raw-value (fn ([k] (grv k)) ([k pred parse-fn] (if (= k :api-key) "" (grv k pred parse-fn))))]
      (is (thrown-with-msg? Exception
                            #"Missing api-key."
                            (#'hm.client/->config))))
    (with-redefs [setting/get-raw-value (fn ([k] (grv k)) ([k pred parse-fn] (if (= k :api-key) nil (grv k pred parse-fn))))]
      (is (thrown-with-msg? Exception
                            #"Missing api-key."
                            (#'hm.client/->config))))))
