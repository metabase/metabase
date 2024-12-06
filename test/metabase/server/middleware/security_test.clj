(ns metabase.server.middleware.security-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.embed.settings :as embed.settings]
   [metabase.public-settings :as public-settings]
   [metabase.server.middleware.security :as mw.security]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util.json :as json]
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
        (tu/with-temporary-setting-values [enable-embedding-interactive true
                                           embedding-app-origins-interactive multiple-ancestors]
          (is (= (str "frame-ancestors " multiple-ancestors)
                 (csp-directive "frame-ancestors"))))))

    (testing "Frame ancestors is 'none' for nil `embedding-app-origin`"
      (tu/with-temporary-setting-values [enable-embedding-interactive true
                                         embedding-app-origins-interactive nil
                                         embedding-app-origin nil]
        (is (= "frame-ancestors 'none'"
               (csp-directive "frame-ancestors")))))

    (testing "Frame ancestors is 'none' if embedding is disabled"
      (tu/with-temporary-setting-values [enable-embedding-interactive false
                                         embedding-app-origin "https: http:"]
        (is (= "frame-ancestors 'none'"
               (csp-directive "frame-ancestors")))))))

(deftest csp-header-iframe-hosts-tests
  (testing "Allowed iframe hosts setting is used in the CSP frame-src directive."
    (tu/with-temporary-setting-values [public-settings/allowed-iframe-hosts "https://www.wikipedia.org, https://www.metabase.com   https://clojure.org"]
      (is (= (str "frame-src 'self' https://wikipedia.org https://*.wikipedia.org https://www.wikipedia.org "
                  "https://metabase.com https://*.metabase.com https://www.metabase.com "
                  "https://clojure.org https://*.clojure.org")
             (csp-directive "frame-src")))))
  (testing "Includes 'self' so embed previews work (#49142)"
    (let [hosts (-> (csp-directive "frame-src") (str/split #"\s+") set)]
      (is (contains? hosts "'self'") "frame-src hosts does not include 'self'"))))

(deftest xframeoptions-header-tests
  (mt/with-premium-features #{:embedding}
    (testing "`DENY` when embedding is disabled"
      (tu/with-temporary-setting-values [enable-embedding-interactive false
                                         embedding-app-origin "https://somesite.metabase.com"]
        (is (= "DENY" (x-frame-options-header)))))

    (testing "Only the first of multiple embedding origins are used in `X-Frame-Options`"
      (let [embedding-app-origins ["https://site1.metabase.com" "https://our_metabase.internal"]]
        (tu/with-temporary-setting-values [enable-embedding-interactive true
                                           embedding-app-origins-interactive (str/join " " embedding-app-origins)]
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
              nonce     (json/decode @nonceJSON)
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

(deftest test-parse-url
  (testing "Should parse valid urls"
    (is (= (mw.security/parse-url "http://example.com") {:protocol "http" :domain "example.com" :port nil}))
    (is (= (mw.security/parse-url "https://example.com") {:protocol "https" :domain "example.com" :port nil}))
    (is (= (mw.security/parse-url "http://example.com:8080") {:protocol "http" :domain "example.com" :port "8080"}))
    (is (= (mw.security/parse-url "example.com:80") {:protocol nil :domain "example.com" :port "80"}))
    (is (= (mw.security/parse-url "example.com:*") {:protocol nil :domain "example.com" :port "*"})))

  (testing "Should return nil for invalid urls"
    (is (nil? (mw.security/parse-url "ftp://example.com")))
    (is (nil? (mw.security/parse-url "://example.com")))
    (is (nil? (mw.security/parse-url "example:com")))))

(deftest test-parse-approved-origins
  (testing "Should not break on multiple spaces in a row"
    (is (= 2 (count (mw.security/parse-approved-origins "example.com      example.org"))))
    (is (= 2 (count (mw.security/parse-approved-origins "   example.com      example.org   ")))))
  (testing "Should filter out invalid origins without throwing"
    (is (= 1 (count (mw.security/parse-approved-origins "example.org ://example.com"))))
    (is (= 1 (count (mw.security/parse-approved-origins "example.org http:/example.com"))))))

(deftest test-approved-domain?
  (testing "Exact match"
    (is (true? (mw.security/approved-domain? "example.com" "example.com")))
    (is (false? (mw.security/approved-domain? "example.com" "example.org"))))

  (testing "Should support wildcards for subdomains"
    (is (true? (mw.security/approved-domain? "sub.example.com" "*.example.com")))
    (is (false? (mw.security/approved-domain? "example.com" "*.example.com")))
    (is (false? (mw.security/approved-domain? "sub.example.org" "*.example.com"))))

  (testing "Should not allow subdomains if no wildcard is present"
    (is (false? (mw.security/approved-domain? "sub.example.com" "example.com")))))

(deftest test-approved-protocol?
  (testing "Exact protocol match"
    (is (true? (mw.security/approved-protocol? "http" "http")))
    (is (true? (mw.security/approved-protocol? "https" "https")))
    (is (false? (mw.security/approved-protocol? "http" "https"))))

  (testing "Nil reference should allow any protocol"
    (is (true? (mw.security/approved-protocol? "http" nil)))
    (is (true? (mw.security/approved-protocol? "https" nil)))))

(deftest test-approved-port?
  (testing "Exact port match"
    (is (true? (mw.security/approved-port? "80" "80")))
    (is (false? (mw.security/approved-port? "80" "8080"))))

  (testing "Wildcard port match"
    (is (true? (mw.security/approved-port? "80" "*")))
    (is (true? (mw.security/approved-port? "8080" "*")))))

(deftest test-approved-origin?
  (testing "Should return false if parameters are nil"
    (is (false? (mw.security/approved-origin? nil "example.com")))
    (is (false? (mw.security/approved-origin? "example.com" nil))))

  (testing "Approved origins with exact protocol and port match"
    (let [approved "http://example1.com http://example2.com:3000 https://example3.com"]
      (is (true? (mw.security/approved-origin? "http://example1.com" approved)))
      (is (true? (mw.security/approved-origin? "http://example2.com:3000" approved)))
      (is (true? (mw.security/approved-origin? "https://example3.com" approved)))))

  (testing "Different protocol should fail"
    (is (false? (mw.security/approved-origin? "https://example1.com" "http://example1.com"))))

  (testing "Origins without protocol should accept both http and https"
    (let [approved "example.com"]
      (is (true? (mw.security/approved-origin? "http://example.com" approved)))
      (is (true? (mw.security/approved-origin? "https://example.com" approved)))))

  (testing "Different ports should fail"
    (is (false? (mw.security/approved-origin? "http://example.com:3000" "http://example.com:3003"))))

  (testing "Should allow anything with *"
    (is (true? (mw.security/approved-origin? "http://example.com" "*")))
    (is (true? (mw.security/approved-origin? "http://example.com" "http://somethingelse.com *"))))

  (testing "Should allow subdomains when *.example.com"
    (is (true? (mw.security/approved-origin? "http://subdomain.example.com" "*.example.com")))
    (is (false? (mw.security/approved-origin? "http://subdomain.example.com" "*.somethingelse.com"))))

  (testing "Should allow any port with example.com:*"
    (is (true? (mw.security/approved-origin? "http://example.com" "example.com:*")))
    (is (true? (mw.security/approved-origin? "http://example.com:8080" "example.com:*"))))

  (testing "Should handle invalid origins"
    (is (true? (mw.security/approved-origin? "http://example.com" "  fpt://something ://123 4 http://example.com")))))

(deftest test-access-control-headers
  (mt/with-premium-features #{:embedding-sdk}
    (testing "Should always allow localhost:*"
      (tu/with-temporary-setting-values [enable-embedding-sdk true
                                         embedding-app-origins-sdk "localhost:*"]
        (is (= "http://localhost:8080" (-> "http://localhost:8080"
                                           (mw.security/access-control-headers
                                            (embed.settings/enable-embedding-sdk)
                                            (embed.settings/embedding-app-origins-sdk))
                                           (get "Access-Control-Allow-Origin"))))))

    (testing "Should disable CORS when enable-embedding-sdk is disabled"
      (tu/with-temporary-setting-values [enable-embedding-sdk false]
        (is (= nil (get (mw.security/access-control-headers
                         "http://localhost:8080"
                         (embed.settings/enable-embedding-sdk)
                         (embed.settings/embedding-app-origins-sdk))
                        "Access-Control-Allow-Origin"))
            "Localhost is only permitted when `enable-embedding-sdk` is `true`."))
      (is (= nil (get (mw.security/access-control-headers
                       "http://1.2.3.4:5555"
                       false
                       "localhost:*")
                      "Access-Control-Allow-Origin"))))

    (testing "Should work with embedding-app-origin"
      (mt/with-premium-features #{:embedding-sdk}
        (tu/with-temporary-setting-values [enable-embedding-sdk      true
                                           embedding-app-origins-sdk "https://example.com"]
          (is (= "https://example.com"
                 (get (mw.security/access-control-headers "https://example.com"
                                                          (embed.settings/enable-embedding-sdk)
                                                          (embed.settings/embedding-app-origins-sdk))
                      "Access-Control-Allow-Origin"))))))))

(deftest allowed-iframe-hosts-test
  (testing "The allowed iframe hosts parse in the expected way."
    (let [default-hosts @#'public-settings/default-allowed-iframe-hosts]
      (testing "The defaults hosts parse correctly"
        (is (= ["'self'"
                "youtube.com"
                "*.youtube.com"
                "youtu.be"
                "*.youtu.be"
                "loom.com"
                "*.loom.com"
                "vimeo.com"
                "*.vimeo.com"
                "docs.google.com"
                "calendar.google.com"
                "airtable.com"
                "*.airtable.com"
                "typeform.com"
                "*.typeform.com"
                "canva.com"
                "*.canva.com"
                "codepen.io"
                "*.codepen.io"
                "figma.com"
                "*.figma.com"
                "grafana.com"
                "*.grafana.com"
                "miro.com"
                "*.miro.com"
                "excalidraw.com"
                "*.excalidraw.com"
                "notion.com"
                "*.notion.com"
                "atlassian.com"
                "*.atlassian.com"
                "trello.com"
                "*.trello.com"
                "asana.com"
                "*.asana.com"
                "gist.github.com"
                "linkedin.com"
                "*.linkedin.com"
                "twitter.com"
                "*.twitter.com"
                "x.com"
                "*.x.com"]
               (mw.security/parse-allowed-iframe-hosts default-hosts))))
      (testing "Additional hosts a user may configure will parse correctly as well"
        (is (= ["'self'" "localhost"
                "http://localhost:8000"
                "my.domain.local:9876"
                "*"
                "mysite.com"
                "*.mysite.com"
                "www.mysite.com"
                "mysite.cool.com"
                "www.mysite.cool.com"]
               (mw.security/parse-allowed-iframe-hosts "localhost, http://localhost:8000,    my.domain.local:9876, *, www.mysite.com/, www.mysite.cool.com"))))
      (testing "invalid hosts are not included"
        (is (= ["'self'"]
               (mw.security/parse-allowed-iframe-hosts "asdf/wasd/:8000 */localhost:*")))))))
