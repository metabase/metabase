(ns metabase.sso.oidc.http-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.sso.oidc.http :as oidc.http]
   [metabase.test :as mt]))

(deftest oidc-get-ssrf-protection-test
  (testing "oidc-get blocks internal hosts when oidc-allowed-networks is :external-only"
    (mt/with-temporary-setting-values [oidc-allowed-networks :external-only]
      (testing "Rejects localhost"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"address not allowed by network restrictions"
                              (oidc.http/oidc-get "http://localhost/path"))))

      (testing "Rejects cloud metadata endpoint"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"address not allowed by network restrictions"
                              (oidc.http/oidc-get "http://169.254.169.254/latest/meta-data/"))))

      (testing "Rejects private network addresses"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"address not allowed by network restrictions"
                              (oidc.http/oidc-get "http://192.168.1.1/path"))))))

  (testing "oidc-get allows requests when oidc-allowed-networks is :allow-all"
    (mt/with-temporary-setting-values [oidc-allowed-networks :allow-all]
      (mt/with-dynamic-fn-redefs [http/get (fn [_url _opts] {:status 200 :body {:ok true}})]
        (let [response (oidc.http/oidc-get "https://provider.example.com/discovery")]
          (is (= 200 (:status response))))))))

(deftest oidc-post-ssrf-protection-test
  (testing "oidc-post blocks internal hosts when oidc-allowed-networks is :external-only"
    (mt/with-temporary-setting-values [oidc-allowed-networks :external-only]
      (testing "Rejects cloud metadata endpoint"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"address not allowed by network restrictions"
                              (oidc.http/oidc-post "http://169.254.169.254/latest/meta-data/"
                                                   {:form-params {:grant_type "client_credentials"}}))))

      (testing "Rejects loopback"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"address not allowed by network restrictions"
                              (oidc.http/oidc-post "http://127.0.0.1/token"
                                                   {:form-params {:grant_type "client_credentials"}}))))))

  (testing "oidc-post allows requests when oidc-allowed-networks is :allow-all"
    (mt/with-temporary-setting-values [oidc-allowed-networks :allow-all]
      (mt/with-dynamic-fn-redefs [http/post (fn [_url _opts] {:status 200 :body {:access_token "tok"}})]
        (let [response (oidc.http/oidc-post "https://provider.example.com/token"
                                            {:form-params {:grant_type "client_credentials"}})]
          (is (= 200 (:status response))))))))

(deftest oidc-get-allow-all-test
  (testing "oidc-get allows all hosts when oidc-allowed-networks is :allow-all"
    (mt/with-temporary-setting-values [oidc-allowed-networks :allow-all]
      (mt/with-dynamic-fn-redefs [http/get (fn [_url _opts] {:status 200 :body {}})]
        (is (= 200 (:status (oidc.http/oidc-get "http://192.168.1.1/path"))))))))

(deftest oidc-get-merges-custom-opts-test
  (testing "Custom options are merged with defaults"
    (mt/with-temporary-setting-values [oidc-allowed-networks :allow-all]
      (mt/with-dynamic-fn-redefs [http/get (fn [_url opts]
                               ;; Verify custom opts are present alongside defaults
                                             (is (= :json (:as opts)))
                                             (is (= :json (:accept opts)))
                                             (is (= 5000 (:conn-timeout opts)))
                                             (is (false? (:throw-exceptions opts)))
                                             {:status 200 :body {}})]
        (oidc.http/oidc-get "https://example.com/path" {:accept :json})))))
