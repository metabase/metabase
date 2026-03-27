(ns metabase.oauth-server.consent-page-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.oauth-server.consent-page :as consent-page]
   [metabase.test :as mt]))

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
