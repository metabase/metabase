(ns metabase-enterprise.harbormaster.client-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [martian.clj-http :as martian-http]
   [martian.core :as martian]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.settings.core :as setting]
   [metabase.settings.models.setting]
   [metabase.test :as mt]))

(deftest ->config-good-test
  (testing "Both needed values are present and pulled from settings"
    (mt/with-temporary-setting-values
      [api-key "mb_api_key_123"
       store-api-url "http://store-api-url.com"]
      (is (= {:store-api-url "http://store-api-url.com", :api-key "mb_api_key_123"}
             (#'hm.client/->config))))))

(defn- +value-for-setting [grv setting-kw value]
  (fn
    ([k] (grv k))
    ([k pred parse-fn]
     (if (= k setting-kw) value (grv k pred parse-fn)))))

(deftest ->config-blank-api-key-test
  (let [grv setting/get-raw-value]
    ;; mt/with-temporary-setting-values is not used here because we want to test the behavior of the function when the
    ;; api-key is blank or nil, and mt/with-temporary-setting-values will not allow us to set the api-key to blank
    ;; or nil.
    (with-redefs [metabase.settings.models.setting/get-raw-value (+value-for-setting grv :api-key "")]
      (is (thrown-with-msg? Exception
                            #"Missing api-key."
                            (#'hm.client/->config))))
    (with-redefs [metabase.settings.models.setting/get-raw-value (+value-for-setting grv :api-key nil)]
      (is (thrown-with-msg? Exception
                            #"Missing api-key."
                            (#'hm.client/->config))))))

(defn- mock-client
  "Creates a martian client with the same interceptors as the real client but without fetching an openapi.json."
  [api-key]
  (martian/bootstrap "http://test.example.com"
                     [{:route-name :test-op
                       :path-parts ["/test"]
                       :method     :get}]
                     {:interceptors (into [(#'hm.client/bearer-auth api-key)
                                           (#'hm.client/user-email-header)]
                                          martian-http/default-interceptors)}))

(deftest request-bearer-auth-test
  (testing "bearer-auth interceptor adds Authorization header with the api-key"
    (let [api-key "test-api-key-123"
          client  (mock-client api-key)]
      (with-redefs [hm.client/client (constantly client)]
        (mt/with-current-user (mt/user->id :rasta)
          (let [req (hm.client/request :test-op)]
            (is (= (str "Bearer " api-key)
                   (get-in req [:headers "Authorization"])))))))))

(deftest request-user-email-header-test
  (testing "user-email-header uses the current user at request time, not client creation time"
    ;; The mock client is created once, outside any user binding.
    ;; Both requests use the same client, so any difference in the email header
    ;; proves it's read at request time.
    (let [client (mock-client "test-key")]
      (with-redefs [hm.client/client (constantly client)]
        (mt/with-current-user (mt/user->id :rasta)
          (let [req (hm.client/request :test-op)]
            (is (= "rasta@metabase.com"
                   (get-in req [:headers "X-Metabase-User-Email"])))))
        (mt/with-current-user (mt/user->id :crowberto)
          (let [req (hm.client/request :test-op)]
            (is (= "crowberto@metabase.com"
                   (get-in req [:headers "X-Metabase-User-Email"])))))))))
