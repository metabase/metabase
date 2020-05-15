(ns metabase.middleware.ssl-test
  (:require [clojure.test :refer :all]
            [metabase.middleware.ssl :as mw.ssl]
            [metabase.test.util :as tu]
            [ring.mock.request :as mock]
            [ring.util.response :as response]))

(defn- handler [request]
  ((mw.ssl/redirect-to-https-middleware
    (fn [request respond _] (respond (response/response ""))))
   request
   identity
   (fn [e] (throw e))))

(deftest test-redirect-index
  (testing "does not redirect when disabled"
    (tu/with-temporary-setting-values [site-url "https://localhost"
                                       redirect-all-requests-to-https false]
      (let [response (handler (mock/request :get "/"))]
        (is (= 200 (:status response))))))
  (testing "redirects when enabled"
    (tu/with-temporary-setting-values [site-url "https://localhost"
                                       redirect-all-requests-to-https true]
      (let [response (handler (mock/request :get "/"))]
        (is (= 301 (:status response)))
        (is (= "https://localhost/" (get-in response [:headers "Location"]))))))
  (testing "redirects with custom SSL port"
    (tu/with-temporary-setting-values [site-url "https://localhost:4444"
                                       redirect-all-requests-to-https true]
      (let [response (handler (mock/request :get "/"))]
        (is (= 301 (:status response)))
        (is (= "https://localhost:4444/" (get-in response [:headers "Location"])))))))

(deftest test-do-not-redirect-healthcheck
  (testing "does not redirect when disabled"
    (tu/with-temporary-setting-values [redirect-all-requests-to-https false]
     (let [response (handler (mock/request :get "/api/health"))]
       (is (= 200 (:status response))))))
  (testing "does not redirect when enabled"
    (tu/with-temporary-setting-values [site-url "https://localhost"
                                       redirect-all-requests-to-https true]
     (let [response (handler (mock/request :get "/api/health"))]
       (is (= 200 (:status response)))))))

(deftest test-do-not-redirect-loadbalancer-sessions
  (testing "does not redirect"
    (tu/with-temporary-setting-values [site-url "https://localhost"
                                       redirect-all-requests-to-https true]
      (let [response (handler (-> (mock/request :get "/foo")
                                  (mock/header :X-Forwarded-Proto "https")))]
        (is (= 200 (:status response))))
      (let [response (handler (-> (mock/request :get "/foo")
                                  (mock/header :X-URL-Scheme "https")))]
        (is (= 200 (:status response))))

      (let [response (handler (-> (mock/request :get "/foo")
                                  (mock/header :X-Forwarded-SSL "on")))]
        (is (= 200 (:status response))))
      (let [response (handler (-> (mock/request :get "/foo")
                                  (mock/header :Front-End-HTTPS "on")))]
        (is (= 200 (:status response))))

      (let [response (handler (-> (mock/request :get "/foo")
                                  (mock/header :Origin "https://foo")))]
        (is (= 200 (:status response)))))))

(deftest test-does-not-redirect-https-sessions
  (testing "does not redirect when disabled"
    (tu/with-temporary-setting-values [site-url "https://localhost"
                                       redirect-all-requests-to-https false]
     (let [response (handler (mock/request :get "https://localhost/foo"))]
       (is (= 200 (:status response))))))
  (testing "does not redirect when enabled"
    (tu/with-temporary-setting-values [site-url "https://localhost"
                                       redirect-all-requests-to-https true]
      (let [response (handler (mock/request :get "https://localhost/foo"))]
        (is (= 200 (:status response)))))))
