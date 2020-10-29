(ns metabase.middleware.security-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase.middleware.security :as mw.security]
            [metabase.test.util :as tu]))

(defn- csp-frame-ancestors-directive
  []
  (-> (mw.security/security-headers)
      (get "Content-Security-Policy")
      (str/split #"; *")
      (as-> xs (filter #(str/starts-with? % "frame-ancestors ") xs))
      first))

(defn- x-frame-options-header
  []
  (get (mw.security/security-headers) "X-Frame-Options"))

(deftest csp-header-frame-ancestor-tests
  (testing "Frame ancestors from `embedding-app-origin` setting"
    (let [multiple-ancestors "https://*.metabase.com http://metabase.internal"]
      (tu/with-temporary-setting-values [enable-embedding     true
                                         embedding-app-origin multiple-ancestors]
        (is (= (str "frame-ancestors " multiple-ancestors)
               (csp-frame-ancestors-directive))))))

  (testing "Frame ancestors is 'none' for nil `embedding-app-origin`"
    (tu/with-temporary-setting-values [enable-embedding     true
                                       embedding-app-origin nil]
      (is (= "frame-ancestors 'none'"
             (csp-frame-ancestors-directive)))))

  (testing "Frame ancestors is 'none' if embedding is disabled"
    (tu/with-temporary-setting-values [enable-embedding     false
                                       embedding-app-origin "https: http:"]
      (is (= "frame-ancestors 'none'"
          (csp-frame-ancestors-directive))))))

(deftest xframeoptions-header-tests
  (testing "`DENY` when embedding is disabled"
    (tu/with-temporary-setting-values [enable-embedding     false
                                       embedding-app-origin "https://somesite.metabase.com"]
      (is (= "DENY" (x-frame-options-header)))))

  (testing "Only the first of multiple embedding origins are used in `X-Frame-Options`"
    (let [embedding-app-origins ["https://site1.metabase.com" "https://our_metabase.internal"]]
      (tu/with-temporary-setting-values [enable-embedding     true
                                         embedding-app-origin (str/join " " embedding-app-origins)]
        (is (= (str "ALLOW-FROM " (first embedding-app-origins))
               (x-frame-options-header)))))))
