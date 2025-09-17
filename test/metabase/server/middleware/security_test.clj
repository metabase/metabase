(ns metabase.server.middleware.security-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.embedding.settings :as embed.settings]
   [metabase.server.middleware.security :as mw.security]
   [metabase.server.settings :as server.settings]
   [metabase.test :as mt]
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
        (mt/with-temporary-setting-values [enable-embedding-interactive true
                                           embedding-app-origins-interactive multiple-ancestors]
          (is (= (str "frame-ancestors " multiple-ancestors)
                 (csp-directive "frame-ancestors"))))))
    (testing "Frame ancestors is 'none' for nil `embedding-app-origin`"
      (mt/with-temporary-setting-values [enable-embedding-interactive true
                                         embedding-app-origins-interactive nil
                                         embedding-app-origin nil]
        (is (= "frame-ancestors 'none'"
               (csp-directive "frame-ancestors")))))
    (testing "Frame ancestors is 'none' if embedding is disabled"
      (mt/with-temporary-setting-values [enable-embedding-interactive false
                                         embedding-app-origin "https: http:"]
        (is (= "frame-ancestors 'none'"
               (csp-directive "frame-ancestors")))))))

(deftest csp-header-iframe-hosts-tests
  (testing "Allowed iframe hosts setting is used in the CSP frame-src directive."
    (mt/with-temporary-setting-values [allowed-iframe-hosts "https://www.wikipedia.org, https://www.metabase.com   https://clojure.org"]
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
      (mt/with-temporary-setting-values [enable-embedding-interactive false
                                         embedding-app-origin "https://somesite.metabase.com"]
        (is (= "DENY" (x-frame-options-header)))))
    (testing "Only the first of multiple embedding origins are used in `X-Frame-Options`"
      (let [embedding-app-origins ["https://site1.metabase.com" "https://our_metabase.internal"]]
        (mt/with-temporary-setting-values [enable-embedding-interactive true
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

(deftest ^:parallel test-parse-url
  (testing "Should parse valid urls"
    (are [url expected] (= expected
                           (mw.security/parse-url url))
      "http://example.com"      {:protocol "http" :domain "example.com" :port nil}
      "https://example.com"     {:protocol "https" :domain "example.com" :port nil}
      "http://example.com:8080" {:protocol "http" :domain "example.com" :port "8080"}
      "example.com:80"          {:protocol nil :domain "example.com" :port "80"}
      "example.com:*"           {:protocol nil :domain "example.com" :port "*"}))
  (testing "Should return nil for invalid urls"
    (are [url] (nil? (mw.security/parse-url url))
      "ftp://example.com"
      "://example.com"
      "example:com")))

(deftest ^:parallel test-parse-approved-origins
  (testing "Should not break on multiple spaces in a row"
    (is (= 2 (count (mw.security/parse-approved-origins "example.com      example.org"))))
    (is (= 2 (count (mw.security/parse-approved-origins "   example.com      example.org   ")))))
  (testing "Should filter out invalid origins without throwing"
    (is (= 1 (count (mw.security/parse-approved-origins "example.org ://example.com"))))
    (is (= 1 (count (mw.security/parse-approved-origins "example.org http:/example.com"))))))

(deftest ^:parallel test-approved-domain?
  (testing "Exact match"
    (is (mw.security/approved-domain? "example.com" "example.com"))
    (is (not (mw.security/approved-domain? "example.com" "example.org"))))
  (testing "Should support wildcards for subdomains"
    (is (mw.security/approved-domain? "sub.example.com" "*.example.com"))
    (is (not (mw.security/approved-domain? "example.com" "*.example.com")))
    (is (not (mw.security/approved-domain? "sub.example.org" "*.example.com"))))
  (testing "Should not allow subdomains if no wildcard is present"
    (is (not (mw.security/approved-domain? "sub.example.com" "example.com")))))

(deftest ^:parallel test-approved-protocol?
  (testing "Exact protocol match"
    (is (mw.security/approved-protocol? "http" "http"))
    (is (mw.security/approved-protocol? "https" "https"))
    (is (not (mw.security/approved-protocol? "http" "https"))))
  (testing "Nil reference should allow any protocol"
    (is (mw.security/approved-protocol? "http" nil))
    (is (mw.security/approved-protocol? "https" nil))))

(deftest ^:parallel test-approved-port?
  (testing "Exact port match"
    (is (mw.security/approved-port? "80" "80"))
    (is (not (mw.security/approved-port? "80" "8080"))))
  (testing "Wildcard port match"
    (is (mw.security/approved-port? "80" "*"))
    (is (mw.security/approved-port? "8080" "*"))))

(deftest ^:parallel test-localhost-origin?
  (testing "Should identify localhost origins correctly"
    (is (#'mw.security/localhost-origin? "http://localhost"))
    (is (#'mw.security/localhost-origin? "https://localhost"))
    (is (#'mw.security/localhost-origin? "http://localhost:3000"))
    (is (#'mw.security/localhost-origin? "https://localhost:8080"))
    (is (#'mw.security/localhost-origin? "localhost:3000"))
    (is (#'mw.security/localhost-origin? "localhost")))
  (testing "Should not identify non-localhost origins as localhost"
    (is (not (#'mw.security/localhost-origin? "http://example.com")))
    (is (not (#'mw.security/localhost-origin? "https://127.0.0.1")))
    (is (not (#'mw.security/localhost-origin? "http://sub.localhost.com")))
    (is (not (#'mw.security/localhost-origin? nil)))
    (is (not (#'mw.security/localhost-origin? "")))))

(deftest ^:parallel test-approved-origin?
  (testing "Should return false if parameters are nil"
    (is (not (mw.security/approved-origin? nil "example.com")))
    (is (not (mw.security/approved-origin? "example.com" nil))))
  (testing "Should always approve localhost origins regardless of approved list"
    (is (mw.security/approved-origin? "http://localhost" ""))
    (is (mw.security/approved-origin? "http://localhost:3000" ""))
    (is (mw.security/approved-origin? "https://localhost:8080" nil))
    (is (mw.security/approved-origin? "localhost:3000" "example.com")))
  (testing "Approved origins with exact protocol and port match"
    (let [approved "http://example1.com http://example2.com:3000 https://example3.com"]
      (is (mw.security/approved-origin? "http://example1.com" approved))
      (is (mw.security/approved-origin? "http://example2.com:3000" approved))
      (is (mw.security/approved-origin? "https://example3.com" approved))))
  (testing "Different protocol should fail"
    (is (not (mw.security/approved-origin? "https://example1.com" "http://example1.com"))))
  (testing "Origins without protocol should accept both http and https"
    (let [approved "example.com"]
      (is (mw.security/approved-origin? "http://example.com" approved))
      (is (mw.security/approved-origin? "https://example.com" approved))))
  (testing "Different ports should fail"
    (is (not (mw.security/approved-origin? "http://example.com:3000" "http://example.com:3003"))))
  (testing "Should allow anything with *"
    (is (mw.security/approved-origin? "http://example.com" "*"))
    (is (mw.security/approved-origin? "http://example.com" "http://somethingelse.com *")))
  (testing "Should allow subdomains when *.example.com"
    (is (mw.security/approved-origin? "http://subdomain.example.com" "*.example.com"))
    (is (not (mw.security/approved-origin? "http://subdomain.example.com" "*.somethingelse.com"))))
  (testing "Should allow any port with example.com:*"
    (is (mw.security/approved-origin? "http://example.com" "example.com:*"))
    (is (mw.security/approved-origin? "http://example.com:8080" "example.com:*")))
  (testing "Should handle invalid origins"
    (is (mw.security/approved-origin? "http://example.com" "  fpt://something ://123 4 http://example.com"))))

(deftest test-disable-cors-on-localhost-approved-origin
  (testing "Should approve localhost origins when disable-cors-on-localhost is false"
    (mt/with-temporary-setting-values [disable-cors-on-localhost false]
      (is (mw.security/approved-origin? "http://localhost" ""))
      (is (mw.security/approved-origin? "http://localhost:3000" ""))))
  (testing "Should reject localhost origins when disable-cors-on-localhost is true"
    (mt/with-temporary-setting-values [disable-cors-on-localhost true]
      (is (not (mw.security/approved-origin? "http://localhost" "")))
      (is (not (mw.security/approved-origin? "http://localhost:3000" "")))))
  (testing "Should allow localhost origins when explicitly added to approved origins even with disable-cors-on-localhost true"
    (mt/with-temporary-setting-values [disable-cors-on-localhost true]
      (is (mw.security/approved-origin? "http://localhost" "localhost"))
      (is (mw.security/approved-origin? "http://localhost:3000" "localhost:*")))))

(deftest test-disable-cors-on-localhost-access-control-headers
  (testing "Should allow CORS headers for localhost when disable-cors-on-localhost is false"
    (mt/with-temporary-setting-values [disable-cors-on-localhost false
                                       enable-embedding-sdk false]
      (is (= "http://localhost:8080" (get (mw.security/access-control-headers
                                           "http://localhost:8080"
                                           false
                                           "")
                                          "Access-Control-Allow-Origin")))))
  (testing "Should block CORS headers for localhost when disable-cors-on-localhost is true and embedding disabled"
    (mt/with-temporary-setting-values [disable-cors-on-localhost true
                                       enable-embedding-sdk false]
      (is (= nil (get (mw.security/access-control-headers
                       "http://localhost:8080"
                       false
                       "")
                      "Access-Control-Allow-Origin"))))))

(deftest test-access-control-headers
  (mt/with-premium-features #{:embedding-sdk}
    (testing "Should allow localhost even when enable-embedding-sdk is disabled"
      (mt/with-temporary-setting-values [enable-embedding-sdk false
                                         enable-embedding-simple false]
        (is (= "http://localhost:8080" (get (mw.security/access-control-headers
                                             "http://localhost:8080"
                                             (embed.settings/enable-embedding-sdk)
                                             (embed.settings/embedding-app-origins-sdk))
                                            "Access-Control-Allow-Origin"))
            "Localhost should always be permitted even when `enable-embedding-sdk` is `false`."))
      (testing "Non-localhost origins should still be blocked when embedding is disabled"
        (is (= nil (get (mw.security/access-control-headers
                         "http://1.2.3.4:5555"
                         false
                         "localhost:*")
                        "Access-Control-Allow-Origin")))))
    (testing "Should work with embedding-app-origin"
      (mt/with-premium-features #{:embedding-sdk}
        (mt/with-temporary-setting-values [enable-embedding-sdk      true
                                           embedding-app-origins-sdk "https://example.com"]
          (is (= "https://example.com"
                 (get (mw.security/access-control-headers "https://example.com"
                                                          (embed.settings/enable-embedding-sdk)
                                                          (embed.settings/embedding-app-origins-sdk))
                      "Access-Control-Allow-Origin"))))))
    (testing "Should set Access-Control-Max-Age to 60"
      (mt/with-temporary-setting-values [enable-embedding-sdk true
                                         embedding-app-origins-sdk "https://example.com"]
        (let [headers (mw.security/access-control-headers
                       "https://example.com"
                       (embed.settings/enable-embedding-sdk)
                       (embed.settings/embedding-app-origins-sdk))]
          (is (= "60" (get headers "Access-Control-Max-Age"))
              "Expected Access-Control-Max-Age header to be set to 60")))))
  (testing "CORS should be enabled when enable-embedding-simple is true"
    (mt/with-temporary-setting-values [enable-embedding-simple true
                                       enable-embedding-sdk false]
      (let [headers (mw.security/access-control-headers "https://example.com"
                                                        (or (embed.settings/enable-embedding-sdk)
                                                            (embed.settings/enable-embedding-simple))
                                                        "https://example.com")]
        (is (= "https://example.com"
               (get headers "Access-Control-Allow-Origin"))
            "CORS should work when enable-embedding-simple is true even if enable-embedding-sdk is false"))))
  (testing "CORS should be enabled when both enable-embedding-simple and enable-embedding-sdk are true"
    (mt/with-premium-features #{:embedding-sdk}
      (mt/with-temporary-setting-values [enable-embedding-simple true
                                         enable-embedding-sdk true
                                         embedding-app-origins-sdk "https://example.com"]
        (let [headers (mw.security/access-control-headers "https://example.com"
                                                          (or (embed.settings/enable-embedding-sdk)
                                                              (embed.settings/enable-embedding-simple))
                                                          (embed.settings/embedding-app-origins-sdk))]
          (is (= "https://example.com"
                 (get headers "Access-Control-Allow-Origin"))
              "CORS should work when both embedding options are enabled")))))
  (testing "CORS should be disabled when both enable-embedding-simple and enable-embedding-sdk are false"
    (mt/with-temporary-setting-values [enable-embedding-simple false
                                       enable-embedding-sdk false
                                       embedding-app-origins-sdk "https://example.com"]
      (let [headers (mw.security/access-control-headers "https://example.com"
                                                        (or (embed.settings/enable-embedding-sdk)
                                                            (embed.settings/enable-embedding-simple))
                                                        (embed.settings/embedding-app-origins-sdk))]
        (is (= nil
               (get headers "Access-Control-Allow-Origin"))
            "CORS should be disabled when both embedding options are disabled")))))

(deftest ^:parallel allowed-iframe-hosts-test
  (testing "The allowed iframe hosts parse in the expected way."
    (let [default-hosts @#'server.settings/default-allowed-iframe-hosts]
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

(defn- run-add-security-headers-mw-test! [enable-embedding-sdk-value
                                          embedding-app-origins-sdk-value
                                          request-origin-header
                                          request-uri
                                          access-control-allow-origin-header-value]
  (mt/with-temporary-setting-values [embedding-app-origins-sdk embedding-app-origins-sdk-value
                                     enable-embedding-sdk enable-embedding-sdk-value]
    (let [wrapped-handler (mw.security/add-security-headers
                           (fn [_request respond _raise]
                             (respond {:status 200 :headers {"response" "ok"} :body "ok"})))
          response (wrapped-handler {:headers {"origin" request-origin-header} :uri request-uri}
                                    identity
                                    identity)]
      (is (= access-control-allow-origin-header-value
             (-> response :headers (get "Access-Control-Allow-Origin")))))))

(deftest add-security-headers-mw-test
  (doseq [[idx [enable-embedding-sdk embedding-app-origins-sdk request-origin request-uri access-control-allow-origin-header-value]]
          [[1 [true "" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [2 [true "" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [3 [true "" "http://my-site.com" "http://public.metabase.com" nil]]
           [4 [true "" "http://my-site.com" "http://www.a-site.com" nil]]
           [5 [true "localhost:1234" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [6 [true "localhost:1234" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [7 [true "localhost:1234" "http://my-site.com" "http://public.metabase.com" nil]]
           [8 [true "localhost:1234" "http://my-site.com" "http://www.a-site.com" nil]]
           [9 [true "http://my-site.com" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [10 [true "http://my-site.com" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [11 [true "http://my-site.com" "http://my-site.com" "http://public.metabase.com" nil]]
           [12 [true "http://my-site.com" "http://my-site.com" "http://www.a-site.com" nil]]
           [13 [true "http://my-site.com:80" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [14 [true "http://my-site.com:80" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [15 [true "http://my-site.com:80" "http://my-site.com" "http://public.metabase.com" nil]]
           [16 [true "http://my-site.com:80" "http://my-site.com" "http://www.a-site.com" nil]]
           [17 [true "https://my-site-1:1234 http://my-other-site:8080" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [18 [true "https://my-site-1:1234 http://my-other-site:8080" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [19 [true "https://my-site-1:1234 http://my-other-site:8080" "http://my-site.com" "http://public.metabase.com" nil]]
           [20 [true "https://my-site-1:1234 http://my-other-site:8080" "http://my-site.com" "http://www.a-site.com" nil]]
           [21 [false "" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [22 [false "" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [23 [false "" "http://my-site.com" "http://public.metabase.com" nil]]
           [24 [false "" "http://my-site.com" "http://www.a-site.com" nil]]
           [25 [false "localhost:1234" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [26 [false "localhost:1234" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [27 [false "localhost:1234" "http://my-site.com" "http://public.metabase.com" nil]]
           [28 [false "localhost:1234" "http://my-site.com" "http://www.a-site.com" nil]]
           [29 [false "http://my-site.com" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [30 [false "http://my-site.com" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [31 [false "http://my-site.com" "http://my-site.com" "http://public.metabase.com" nil]]
           [32 [false "http://my-site.com" "http://my-site.com" "http://www.a-site.com" nil]]
           [33 [false "http://my-site.com:80" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [34 [false "http://my-site.com:80" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [35 [false "http://my-site.com:80" "http://my-site.com" "http://public.metabase.com" nil]]
           [36 [false "http://my-site.com:80" "http://my-site.com" "http://www.a-site.com" nil]]
           [37 [false "https://my-site-1:1234 http://my-other-site:8080" "http://localhost:1234" "http://public.metabase.com" "http://localhost:1234"]]
           [38 [false "https://my-site-1:1234 http://my-other-site:8080" "http://localhost:1234" "http://www.a-site.com" "http://localhost:1234"]]
           [39 [false "https://my-site-1:1234 http://my-other-site:8080" "http://my-site.com" "http://public.metabase.com" nil]]
           [40 [false "https://my-site-1:1234 http://my-other-site:8080" "http://my-site.com" "http://www.a-site.com" nil]]]]
    (testing (str "add security headers mw test, index: " idx)
      (run-add-security-headers-mw-test!
       enable-embedding-sdk
       embedding-app-origins-sdk
       request-origin
       request-uri
       access-control-allow-origin-header-value))))

(comment

  ;; Generate security headers mw cases

  (mapv (fn [idx values] [(inc idx) [values]])
        (range)
        (for [enable-embedding-sdk [true false]
              embedding-app-origins-sdk [""
                                         "localhost:1234"
                                         "http://my-site.com"
                                         "http://my-site.com:80"
                                         "https://my-site-1:1234 http://my-other-site:8080"]
              request-origin ["http://localhost:1234"
                              "http://my-site.com"]
              request-uri ["http://public.metabase.com"
                           "http://www.a-site.com"]]
          (mt/with-temporary-setting-values [embedding-app-origins-sdk embedding-app-origins-sdk
                                             enable-embedding-sdk enable-embedding-sdk]
            (let [wrapped-handler (mw.security/add-security-headers
                                   (fn [_request respond _raise]
                                     (respond {:status 200 :headers {"Response-Header" "ok"} :body "ok"})))
                  response (wrapped-handler {:headers {"origin" request-origin} :uri request-uri} identity identity)]
              [enable-embedding-sdk embedding-app-origins-sdk request-origin request-uri (-> response :headers (get "Access-Control-Allow-Origin"))])))))

(deftest add-cors-headers-for-auth-sso-test
  (testing "Should add CORS headers for /auth/sso endpoint with 402 status (embedding disabled errors)"
    (let [wrapped-handler (mw.security/add-security-headers
                           (fn [_request respond _raise]
                             (respond {:status 402
                                       :headers {"Content-Type" "application/json"}
                                       :body "{\"status\": \"error-embedding-sdk-disabled\"}"})))
          response (wrapped-handler {:uri "/auth/sso" :headers {"origin" "https://example.com"}}
                                    identity
                                    identity)]
      (is (= "*" (get-in response [:headers "Access-Control-Allow-Origin"]))
          "Should set Access-Control-Allow-Origin to * for /auth/sso with 402 status")
      (is (= "*" (get-in response [:headers "Access-Control-Allow-Headers"]))
          "Should set Access-Control-Allow-Headers to * for /auth/sso with 402 status")
      (is (= "*" (get-in response [:headers "Access-Control-Allow-Methods"]))
          "Should set Access-Control-Allow-Methods to * for /auth/sso with 402 status")))

  (testing "Should add CORS headers for /auth/sso endpoint with 400 status (client errors)"
    (let [wrapped-handler (mw.security/add-security-headers
                           (fn [_request respond _raise]
                             (respond {:status 400
                                       :headers {"Content-Type" "application/json"}
                                       :body "{\"status\": \"error-sso-disabled\"}"})))
          response (wrapped-handler {:uri "/auth/sso" :headers {"origin" "https://example.com"}}
                                    identity
                                    identity)]
      (is (= "*" (get-in response [:headers "Access-Control-Allow-Origin"]))
          "Should set Access-Control-Allow-Origin to * for /auth/sso with 400 status")
      (is (= "*" (get-in response [:headers "Access-Control-Allow-Headers"]))
          "Should set Access-Control-Allow-Headers to * for /auth/sso with 400 status")
      (is (= "*" (get-in response [:headers "Access-Control-Allow-Methods"]))
          "Should set Access-Control-Allow-Methods to * for /auth/sso with 400 status")))

  (testing "Should add CORS headers for /auth/sso OPTIONS requests (preflight)"
    (let [wrapped-handler (mw.security/add-security-headers
                           (fn [_request respond _raise]
                             (respond {:status 200
                                       :headers {}
                                       :body ""})))
          response (wrapped-handler {:request-method :options
                                     :uri "/auth/sso"
                                     :headers {"origin" "https://example.com"}}
                                    identity
                                    identity)]
      (is (= "*" (get-in response [:headers "Access-Control-Allow-Origin"]))
          "Should set Access-Control-Allow-Origin to * for OPTIONS /auth/sso")
      (is (= "*" (get-in response [:headers "Access-Control-Allow-Headers"]))
          "Should set Access-Control-Allow-Headers to * for OPTIONS /auth/sso")
      (is (= "*" (get-in response [:headers "Access-Control-Allow-Methods"]))
          "Should set Access-Control-Allow-Methods to * for OPTIONS /auth/sso")))

  (testing "Should not add CORS headers for /auth/sso endpoint with other status codes"
    (doseq [status [200 201 500 503]]
      (let [wrapped-handler (mw.security/add-security-headers
                             (fn [_request respond _raise]
                               (respond {:status status
                                         :headers {"Content-Type" "application/json"}
                                         :body "{\"status\": \"ok\"}"})))
            response (wrapped-handler {:uri "/auth/sso" :headers {"origin" "https://example.com"}}
                                      identity
                                      identity)]
        (is (nil? (get-in response [:headers "Access-Control-Allow-Origin"]))
            (format "Should not set CORS headers for /auth/sso with %d status" status))))))
