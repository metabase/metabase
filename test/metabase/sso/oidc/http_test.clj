(ns metabase.sso.oidc.http-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.sso.oidc.http :as oidc.http]
   [metabase.test :as mt]
   [metabase.util.http :as u.http]))

;; OIDC requests are external-only always (the `oidc-allowed-networks` setting is dormant). Internal
;; hosts are rejected; `external-host?` is stubbed on success paths to avoid a real DNS lookup.

(deftest oidc-get-ssrf-protection-test
  (testing "oidc-get blocks internal hosts (external-only, always)"
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
                            (oidc.http/oidc-get "http://192.168.1.1/path")))))
  (testing "oidc-get allows a public host and hardens the request"
    (with-redefs [u.http/external-host? (constantly true)]
      (mt/with-dynamic-fn-redefs [http/get (fn [_url opts]
                                             (is (= :none (:redirect-strategy opts)))
                                             (is (some? (:dns-resolver opts)))
                                             {:status 200 :body {:ok true}})]
        (let [response (oidc.http/oidc-get "https://provider.example.com/discovery")]
          (is (= 200 (:status response))))))))

(deftest oidc-post-ssrf-protection-test
  (testing "oidc-post blocks internal hosts (external-only, always)"
    (testing "Rejects cloud metadata endpoint"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"address not allowed by network restrictions"
                            (oidc.http/oidc-post "http://169.254.169.254/latest/meta-data/"
                                                 {:form-params {:grant_type "client_credentials"}}))))
    (testing "Rejects loopback"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"address not allowed by network restrictions"
                            (oidc.http/oidc-post "http://127.0.0.1/token"
                                                 {:form-params {:grant_type "client_credentials"}})))))
  (testing "oidc-post allows a public host and hardens the request"
    (with-redefs [u.http/external-host? (constantly true)]
      (mt/with-dynamic-fn-redefs [http/post (fn [_url opts]
                                              (is (= :none (:redirect-strategy opts)))
                                              (is (some? (:dns-resolver opts)))
                                              {:status 200 :body {:access_token "tok"}})]
        (let [response (oidc.http/oidc-post "https://provider.example.com/token"
                                            {:form-params {:grant_type "client_credentials"}})]
          (is (= 200 (:status response))))))))

(deftest oidc-private-host-always-blocked-test
  (testing "a private host is rejected regardless of any stored strategy setting (external-only ceiling)"
    (mt/with-temporary-setting-values [oidc-allowed-networks :allow-all]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"address not allowed by network restrictions"
                            (oidc.http/oidc-get "http://192.168.1.1/path"))))))

(deftest oidc-get-merges-custom-opts-test
  (testing "Custom options are merged with defaults and the SSRF opts"
    (with-redefs [u.http/external-host? (constantly true)]
      (mt/with-dynamic-fn-redefs [http/get (fn [_url opts]
                                             ;; Verify custom opts are present alongside defaults + SSRF opts
                                             (is (= :json (:as opts)))
                                             (is (= :json (:accept opts)))
                                             (is (= 5000 (:conn-timeout opts)))
                                             (is (false? (:throw-exceptions opts)))
                                             (is (= :none (:redirect-strategy opts)))
                                             {:status 200 :body {}})]
        (oidc.http/oidc-get "https://example.com/path" {:accept :json})))))
