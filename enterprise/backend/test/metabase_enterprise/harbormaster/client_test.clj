(ns metabase-enterprise.harbormaster.client-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [martian.clj-http :as martian-http]
   [martian.core :as martian]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.settings.core :as setting]
   [metabase.settings.models.setting]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [metabase.util.secret :as u.secret]))

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
      (mt/with-dynamic-fn-redefs [hm.client/client (constantly client)]
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
      (mt/with-dynamic-fn-redefs [hm.client/client (constantly client)]
        (mt/with-current-user (mt/user->id :rasta)
          (let [req (hm.client/request :test-op)]
            (is (= "rasta@metabase.com"
                   (get-in req [:headers "X-Metabase-User-Email"])))))
        (mt/with-current-user (mt/user->id :crowberto)
          (let [req (hm.client/request :test-op)]
            (is (= "crowberto@metabase.com"
                   (get-in req [:headers "X-Metabase-User-Email"])))))))))

(deftest secret-values-reach-the-wire-but-never-the-log-test
  (testing "a Secret in the request body is exposed for the HTTP payload but redacted in logs"
    (mt/with-temporary-setting-values [api-key "mb_api_key_123" store-api-url "http://hm.test"]
      (let [captured (atom nil)]
        (mt/with-dynamic-fn-redefs [http/post (fn [_url request]
                                                (reset! captured request)
                                                {:status 200 :body "{}"})]
          (log.capture/with-log-messages-for-level [messages [metabase-enterprise.harbormaster.client :info]]
            (hm.client/make-request :post "/things"
                                    {:name       "ws"
                                     :config-yml (u.secret/secret "SUPER_SECRET_YAML")})
            (testing "the real secret value is in the outbound HTTP body"
              (is (str/includes? (:body @captured) "SUPER_SECRET_YAML"))
              (is (not (str/includes? (:body @captured) "REDACTED"))))
            (testing "the secret never appears in any log message"
              (let [logged (pr-str (messages))]
                (is (not (str/includes? logged "SUPER_SECRET_YAML")))
                (is (str/includes? logged "REDACTED SECRET")))))))))
  (testing "on an HTTP error the scrubbed request (no bearer, no raw secret) rides the error map"
    (mt/with-temporary-setting-values [api-key "mb_api_key_123" store-api-url "http://hm.test"]
      (mt/with-dynamic-fn-redefs [http/post (fn [_ _] (throw (ex-info "boom" {})))]
        (log.capture/with-log-messages-for-level [messages [metabase-enterprise.harbormaster.client :info]]
          (hm.client/make-request :post "/things" {:config-yml (u.secret/secret "SUPER_SECRET_YAML")})
          (let [logged (pr-str (messages))]
            (is (not (str/includes? logged "SUPER_SECRET_YAML")))
            (is (not (str/includes? logged "mb_api_key_123")))))))))
