(ns metabase.server.middleware.security-test
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.server.middleware.security :as mw.security]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [stencil.core :as stencil]))

(defn- csp-directive
  [directive]
  (-> (mw.security/security-headers)
      (get "Content-Security-Policy")
      (str/split #"; *")
      (as-> xs (filter #(str/starts-with? % (str directive " ")) xs))
      first))

(defn- x-frame-options-header
  []
  (get (mw.security/security-headers) "X-Frame-Options"))

(deftest csp-header-script-src-tests
  (testing "Inline scripts use hash-based allowlist in prod environment"
    (with-redefs [config/is-dev? false]
      (is (str/includes? (csp-directive "script-src") "sha256"))
      (is (not (str/includes? (csp-directive "script-src") "'unsafe-inline'")))))

  (testing "Any inline scripts are allowed in dev environment (#16375)"
    (with-redefs [config/is-dev? true]
      (is (not (str/includes? (csp-directive "script-src") "sha256")))
      (is (str/includes? (csp-directive "script-src") "'unsafe-inline'")))))

(deftest csp-header-frame-ancestor-tests
  (mt/with-premium-features #{:embedding}
    (testing "Frame ancestors from `embedding-app-origin` setting"
      (let [multiple-ancestors "https://*.metabase.com http://metabase.internal"]
        (tu/with-temporary-setting-values [enable-embedding     true
                                           embedding-app-origin multiple-ancestors]
          (is (= (str "frame-ancestors " multiple-ancestors)
                 (csp-directive "frame-ancestors"))))))

    (testing "Frame ancestors is 'none' for nil `embedding-app-origin`"
      (tu/with-temporary-setting-values [enable-embedding     true
                                         embedding-app-origin nil]
        (is (= "frame-ancestors 'none'"
               (csp-directive "frame-ancestors")))))

    (testing "Frame ancestors is 'none' if embedding is disabled"
      (tu/with-temporary-setting-values [enable-embedding     false
                                         embedding-app-origin "https: http:"]
        (is (= "frame-ancestors 'none'"
               (csp-directive "frame-ancestors")))))))

(deftest xframeoptions-header-tests
  (mt/with-premium-features #{:embedding}
    (testing "`DENY` when embedding is disabled"
      (tu/with-temporary-setting-values [enable-embedding     false
                                         embedding-app-origin "https://somesite.metabase.com"]
        (is (= "DENY" (x-frame-options-header)))))

    (testing "Only the first of multiple embedding origins are used in `X-Frame-Options`"
      (let [embedding-app-origins ["https://site1.metabase.com" "https://our_metabase.internal"]]
        (tu/with-temporary-setting-values [enable-embedding     true
                                           embedding-app-origin (str/join " " embedding-app-origins)]
          (is (= (str "ALLOW-FROM " (first embedding-app-origins))
                 (x-frame-options-header))))))))

(deftest nonce-test
  (testing "The nonce in the CSP header should match the nonce in the HTML from a index.html request"
    (let [nonceJSON (atom nil)
          render-file stencil/render-file]
      (with-redefs [stencil/render-file (fn [path variables]
                                          (reset! nonceJSON (:nonceJSON variables))
                                          ;; Use index_template.html instead of index.html so the frontend doesn't
                                          ;; have to be built to run the test. The only difference between them
                                          ;; should be the script tags for the webpack bundles
                                          (assert (= path "frontend_client/index.html"))
                                          (render-file "frontend_client/index_template.html" variables))]
        (let [response  (http/get (str "http://localhost:" (config/config-str :mb-jetty-port)))
              nonce     (json/parse-string @nonceJSON)
              csp       (get-in response [:headers "Content-Security-Policy"])
              style-src (->> (str/split csp #"; *")
                             (filter #(str/starts-with? % "style-src "))
                             first)]
          (testing "The nonce is 10 characters long and alphanumeric"
            (is (re-matches #"^[a-zA-Z0-9]{10}$" nonce)))
          (testing "The same nonce is in the CSP header"
           (is (str/includes? style-src (str "nonce-" nonce))))
          (testing "The same nonce is in the body of the rendered page"
            (is (str/includes? (:body response) nonce))))))))
