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

(deftest consent-page-subpath-form-action-test
  (testing "form action is absolute so it survives hosting under a subpath (GIT-10551)"
    (let [html (mt/with-temporary-setting-values [site-url "https://example.com/metabase"]
                 (consent-page/render-consent-page
                  {:client-name  "Test App"
                   :oauth-params {:response_type "code" :client_id "abc123"}
                   :nonce        "test-nonce"
                   :csrf-token   "test-csrf"}))]
      (is (re-find #"action=\"https://example\.com/metabase/oauth/authorize/decision\"" html))
      (testing "bundled fonts are also loaded from under the subpath"
        (is (re-find #"url\('https://example\.com/metabase/app/fonts/" html)))))
  (testing "at the domain root the action still targets /oauth/authorize/decision"
    (let [html (render!)]
      (is (re-find #"action=\"http://localhost:3000/oauth/authorize/decision\"" html)))))

(defn- render-with-scopes! [scopes]
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (consent-page/render-consent-page
     {:client-name  "Test App"
      :oauth-params {:response_type "code" :client_id "abc123" :scope "mb:full"}
      :nonce        "test-nonce"
      :csrf-token   "test-csrf"
      :scopes       scopes})))

(deftest consent-page-shows-requested-scopes-test
  (testing "each requested scope's human description is shown so a broad grant is not approved blindly"
    (let [html (render-with-scopes! [{:scope "mb:full" :description "Full access to Metabase as your user account"}
                                     {:scope "agent:query" :description "Construct and execute queries"}])]
      (is (re-find #"Full access to Metabase as your user account" html))
      (is (re-find #"Construct and execute queries" html))
      (testing "the raw scope string is shown alongside the description"
        (is (re-find #"mb:full" html)))))
  (testing "a scope with no human description falls back to the raw string and is not duplicated"
    (let [html (render-with-scopes! [{:scope "weird:unlabeled" :description "weird:unlabeled"}])]
      (is (re-find #"weird:unlabeled" html))
      (is (not (re-find #"raw\">weird:unlabeled" html))
          "should not also render the raw span when description equals the scope")))
  (testing "no scope list is rendered when none were requested"
    (is (not (re-find #"class=\"scopes\"" (render-with-scopes! nil))))))

(defn- render-with-redirect-uri! [redirect-uri]
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (consent-page/render-consent-page
     {:client-name  "Test App"
      :oauth-params (cond-> {:response_type "code" :client_id "abc123"}
                      redirect-uri (assoc :redirect_uri redirect-uri))
      :nonce        "test-nonce"
      :csrf-token   "test-csrf"})))

(deftest consent-page-redirect-destination-test
  (testing "the destination host the code will be sent to is shown"
    (let [html (render-with-redirect-uri! "https://claude.ai/api/mcp/callback")]
      (is (re-find #"Redirects to" html))
      (is (re-find #"<strong>claude\.ai</strong>" html))))
  (testing "only the parsed host is shown as the destination — userinfo can't spoof the bold host"
    (let [html (render-with-redirect-uri! "https://evil.example@good.example/cb")]
      (is (re-find #"<strong>good\.example</strong>" html))
      (is (not (re-find #"<strong>evil\.example" html)))))
  (testing "no destination row when there is no meaningful host (custom-scheme native redirect)"
    (let [html (render-with-redirect-uri! "com.example.app:/oauth2redirect")]
      (is (not (re-find #"Redirects to" html)))))
  (testing "no destination row when redirect_uri is absent"
    (is (not (re-find #"Redirects to" (render-with-redirect-uri! nil))))))

(deftest consent-page-full-access-warning-test
  (testing "a full-access scope shows an explicit warning that it grants complete account access"
    (let [html (render-with-scopes! [{:scope        "mb:full"
                                      :description  "Full access to Metabase as your user account"
                                      :full-access? true}])]
      (is (re-find #"complete access to your account" html))
      (is (re-find #"class=\"warning\"" html))))
  (testing "a narrow scope shows no full-access warning"
    (let [html (render-with-scopes! [{:scope        "agent:query"
                                      :description  "Construct and execute queries"
                                      :full-access? false}])]
      (is (not (re-find #"class=\"warning\"" html)))
      (is (not (re-find #"complete access to your account" html))))))
