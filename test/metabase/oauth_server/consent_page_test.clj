(ns metabase.oauth-server.consent-page-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.oauth-server.consent-page :as consent-page]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- render!
  "Render the consent page with default params."
  []
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (consent-page/render-consent-page
     {:client-name  "Test App"
      :oauth-params {:response_type "code" :client_id "abc123"}
      :nonce        "test-nonce"
      :csrf-token   "test-csrf"})))

(deftest consent-page-heading-test
  (testing "heading includes client name with question mark"
    (let [html (render!)]
      (is (re-find #"Authorize Test App\?" html)))))

(deftest consent-page-buttons-test
  (testing "buttons say Cancel and Authorize"
    (let [html (render!)]
      (is (re-find #">Cancel<" html))
      (is (re-find #">Authorize<" html)))))

(deftest default-logo-inlined-with-brand-color-test
  (testing "default logo is inlined as SVG with brand color replacing currentColor"
    (let [html (render!)]
      (is (re-find #"<svg" html) "should contain inline SVG")
      (is (not (re-find #"currentColor" html)) "should not contain currentColor")
      (is (re-find #"#509ee3" html) "should contain the default brand color"))))

(deftest custom-logo-data-uri-test
  (testing "data URI logo is preserved verbatim in img src"
    (mt/with-premium-features #{:whitelabel}
      (let [data-uri "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=="
            html     (mt/with-temporary-setting-values [site-url               "http://localhost:3000"
                                                        application-logo-url   data-uri]
                       (consent-page/render-consent-page
                        {:client-name  "Test App"
                         :oauth-params {:response_type "code" :client_id "abc123"}
                         :nonce        "test-nonce"
                         :csrf-token   "test-csrf"}))]
        (is (re-find (re-pattern (java.util.regex.Pattern/quote data-uri)) html)
            "data URI should appear verbatim in img src")
        (is (not (re-find #"localhost:3000/data:" html))
            "data URI should not be prefixed with site URL")))))

(deftest custom-logo-external-url-test
  (testing "external URL logo is passed through unchanged"
    (mt/with-premium-features #{:whitelabel}
      (let [logo-url "https://example.com/logo.png"
            html     (mt/with-temporary-setting-values [site-url               "http://localhost:3000"
                                                        application-logo-url   logo-url]
                       (consent-page/render-consent-page
                        {:client-name  "Test App"
                         :oauth-params {:response_type "code" :client_id "abc123"}
                         :nonce        "test-nonce"
                         :csrf-token   "test-csrf"}))]
        (is (re-find #"https://example\.com/logo\.png" html)
            "external URL should appear unchanged in img src")))))

(deftest custom-logo-relative-path-test
  (testing "relative path logo gets site URL prepended"
    (mt/with-premium-features #{:whitelabel}
      (let [html (mt/with-temporary-setting-values [site-url               "http://localhost:3000"
                                                    application-logo-url   "app/assets/img/custom.png"]
                   (consent-page/render-consent-page
                    {:client-name  "Test App"
                     :oauth-params {:response_type "code" :client_id "abc123"}
                     :nonce        "test-nonce"
                     :csrf-token   "test-csrf"}))]
        (is (re-find #"http://localhost:3000/app/assets/img/custom\.png" html)
            "relative path should be resolved to absolute URL")))))
