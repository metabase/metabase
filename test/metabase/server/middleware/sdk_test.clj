(ns metabase.server.middleware.sdk-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.sdk :as sdk]
   [metabase.config.core :as config]
   [metabase.request.current :as request.current]
   [metabase.test :as mt]
   [metabase.util :as u]
   [ring.mock.request :as ring.mock]))

(defn- wonk-case [s]
  (str/join (for [char s]
              (let [f (if (rand-nth [true false]) u/upper-case-en u/lower-case-en)]
                (f char)))))

(defn- mock-request
  [{:keys [client version]}]
  (cond-> (ring.mock/request :get "api/health")
    client  (ring.mock/header (keyword (wonk-case "x-metabase-client")) client)
    version (ring.mock/header (keyword (wonk-case "x-metabase-client-version")) version)))

(deftest bind-client-test
  (are [client]
       (let [request (mock-request {:client client})
             handler (analytics/embedding-mw
                      (fn [_ respond _] (respond {:status 200 :body client})))
             response (handler request identity identity)]
         (is (= client
                (:body response "no-body"))))
    nil
    "embedding-iframe"))

(deftest bind-client-version-test
  (are [version]
       (let [request (mock-request {:version version})
             handler (analytics/embedding-mw
                      (fn [_ respond _] (respond {:status 200 :body version})))
             response (handler request identity identity)]
         (is (= version
                (:body response "no-body"))))
    nil
    "1.1.1"))

(deftest embeding-mw-bumps-metrics-with-react-sdk-client-header
  (mt/with-prometheus-system! [_ system]
    (let [request (mock-request {:client "embedding-sdk-react"})
          good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
          bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
          exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
      (good request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "200"})))
      (bad request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "400"})))
      (exception request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "400"})))
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "500"}))))))

(deftest embeding-mw-bumps-metrics-with-iframe-client-header
  (mt/with-prometheus-system! [_ system]
    (let [request (mock-request {:client "embedding-iframe"})
          good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
          bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
          exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
      (good request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "200"})))
      (bad request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "400"})))
      (exception request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "400"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "500"}))))))

(deftest embedding-mw-bumps-metrics-with-iframe-full-app-client-header
  (mt/with-prometheus-system! [_ system]
    (let [request (mock-request {:client "embedding-iframe-full-app"})
          good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
          bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
          exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
      (good request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-full-app/response {:status "200"})))
      (bad request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-full-app/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-full-app/response {:status "400"})))
      (exception request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-full-app/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-full-app/response {:status "400"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-full-app/response {:status "500"}))))))

(deftest embedding-mw-bumps-metrics-with-iframe-static-client-header
  (mt/with-prometheus-system! [_ system]
    (let [request (mock-request {:client "embedding-iframe-static"})
          good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
          bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
          exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
      (good request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-static/response {:status "200"})))
      (bad request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-static/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-static/response {:status "400"})))
      (exception request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-static/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-static/response {:status "400"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe-static/response {:status "500"}))))))

(deftest embedding-mw-bumps-metrics-with-public-client-header
  (mt/with-prometheus-system! [_ system]
    (let [request (mock-request {:client "embedding-public"})
          good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
          bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
          exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
      (good request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-public/response {:status "200"})))
      (bad request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-public/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-public/response {:status "400"})))
      (exception request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-public/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-public/response {:status "400"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-public/response {:status "500"}))))))

(deftest embedding-mw-bumps-metrics-with-simple-client-header
  (mt/with-prometheus-system! [_ system]
    (let [request (mock-request {:client "embedding-simple"})
          good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
          bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
          exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
      (good request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-simple/response {:status "200"})))
      (bad request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-simple/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-simple/response {:status "400"})))
      (exception request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-simple/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-simple/response {:status "400"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-simple/response {:status "500"}))))))

(deftest embeding-mw-does-not-bump-metrics-with-random-sdk-header
  (let [prometheus-standin (atom {})]
    (with-redefs [analytics/inc! (fn [k _] (swap! prometheus-standin update k (fnil inc 0)))]
       ;; has X-Metabase-Client header, but it's not the SDK, so we don't track it
      (let [request (mock-request {:client "my-client"})
            good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
            bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
            exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
        (good request identity identity)
        (is (= {} @prometheus-standin))
        (bad request identity identity)
        (is (= {} @prometheus-standin))
        (exception request identity identity)
        (is (= {} @prometheus-standin))))))

(deftest embeding-mw-does-not-bump-sdk-metrics-without-sdk-header
  (let [prometheus-standin (atom {})]
    (with-redefs [analytics/inc! (fn [k _] (swap! prometheus-standin update k (fnil inc 0)))]
      (let [request (mock-request {}) ;; <= no X-Metabase-Client header => no SDK context
            good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
            bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
            exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
        (good request identity identity)
        (is (= {} @prometheus-standin))
        (bad request identity identity)
        (is (= {} @prometheus-standin))
        (exception request identity identity)
        (is (= {} @prometheus-standin))))))

(deftest extract-hostname-test
  (testing "extracts hostname from various URL formats"
    (are [url expected]
         (= expected (sdk/extract-hostname url))
      "https://app.example.com"          "app.example.com"
      "https://app.example.com:8443"     "app.example.com"
      "https://app.example.com/path?q=1" "app.example.com"
      "http://localhost:3000"            "localhost"
      "http://192.168.1.1:8080"          "192.168.1.1"))
  (testing "returns nil for nil, blank, or unparseable input"
    (are [url]
         (nil? (sdk/extract-hostname url))
      nil
      ""
      "not a url")))

(deftest extract-path-test
  (testing "extracts path, stripping query params and fragment"
    (are [url expected]
         (= expected (sdk/extract-path url))
      "https://example.com/dashboard/1"        "/dashboard/1"
      "https://example.com/dash/1?foo=bar"     "/dash/1"
      "https://example.com/dash/1#section"     "/dash/1"
      "https://example.com/dash/1?a=b#section" "/dash/1"))
  (testing "returns nil for nil, blank, or root-only URLs"
    (are [url]
         (nil? (sdk/extract-path url))
      nil
      ""
      "not a url")))

(deftest pii-request-info-test
  (testing "returns all fields from request values"
    (is (= {:embedding_hostname      "app.example.com"
            :embedding_path          "/dashboard/1"
            :user_agent              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            :sanitized_user_agent    "Browser (Chrome/OS X)"
            :ip_address              "10.0.0.1"}
           (sdk/pii-request-info {:origin     "https://app.example.com"
                                  :referer    "https://app.example.com/dashboard/1?x=y"
                                  :user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                                  :ip-address "10.0.0.1"}))))
  (testing "handles nil values gracefully"
    (is (= {:embedding_hostname nil, :embedding_path nil, :user_agent nil, :sanitized_user_agent nil, :ip_address nil}
           (sdk/pii-request-info {})))))

(defn- client-from-mw
  "Runs a request through embedding-mw and returns the *client* value bound inside the handler."
  [request]
  (let [handler (analytics/embedding-mw
                 (fn [_ respond _] (respond {:status 200 :body (sdk/get-client)})))]
    (:body (handler request identity identity))))

(defn- route-from-mw
  "Runs a request through embedding-mw and returns the *route* value bound inside the handler."
  [request]
  (let [handler (analytics/embedding-mw
                 (fn [_ respond _] (respond {:status 200 :body (sdk/get-route)})))]
    (:body (handler request identity identity))))

(deftest route-based-client-derivation-test
  (testing "route prefix populates *route*, not *client*"
    (are [uri expected]
         (= expected (route-from-mw (assoc (ring.mock/request :get uri)
                                           :uri uri)))
      "/api/public/card/1"         "public"
      "/api/embed/dashboard/42"    "guest-embed"
      "/api/preview_embed/card/1"  "guest-embed"
      "/api/metabot/query"         "metabot"
      "/api/agent/chat"            "agent-api"))
  (testing "route requests without header give nil *client*"
    (let [request (assoc (ring.mock/request :get "/api/public/card/1")
                         :uri "/api/public/card/1")]
      (is (nil? (client-from-mw request)))))
  (testing "header populates *client* independently of route"
    (let [request (-> (ring.mock/request :get "/api/public/card/1")
                      (assoc :uri "/api/public/card/1")
                      (ring.mock/header "x-metabase-client" "embedding-sdk-react"))]
      (is (= "embedding-sdk-react" (client-from-mw request)))
      (is (= "public" (route-from-mw request)))))
  (testing "falls back to header when no route matches"
    (let [request (-> (ring.mock/request :get "/api/card/1")
                      (ring.mock/header "x-metabase-client" "embedding-sdk-react"))]
      (is (= "embedding-sdk-react" (client-from-mw request)))))
  (testing "nil when no route match and no header"
    (is (nil? (client-from-mw (ring.mock/request :get "/api/card/1"))))
    (is (nil? (route-from-mw (ring.mock/request :get "/api/card/1"))))))

(deftest preview-suffix-test
  (testing "-preview only applies to *client*, not *route*"
    (let [request (-> (ring.mock/request :get "/api/embed/dashboard/42")
                      (assoc :uri "/api/embed/dashboard/42")
                      (ring.mock/header "x-metabase-client" "embedding-sdk-react")
                      (ring.mock/header "x-metabase-embedded-preview" "true"))]
      (is (= "embedding-sdk-react-preview" (client-from-mw request)))
      (is (= "guest-embed" (route-from-mw request)))))
  (testing "preview with route but no header -> nil client"
    (let [request (-> (ring.mock/request :get "/api/embed/dashboard/42")
                      (assoc :uri "/api/embed/dashboard/42")
                      (ring.mock/header "x-metabase-embedded-preview" "true"))]
      (is (nil? (client-from-mw request)))
      (is (= "guest-embed" (route-from-mw request)))))
  (testing "preview header appends -preview to header-derived client"
    (let [request (-> (ring.mock/request :get "/api/card/1")
                      (ring.mock/header "x-metabase-client" "embedding-sdk-react")
                      (ring.mock/header "x-metabase-embedded-preview" "true"))]
      (is (= "embedding-sdk-react-preview" (client-from-mw request)))))
  (testing "no -preview without the header"
    (let [request (-> (ring.mock/request :get "/api/embed/dashboard/42")
                      (assoc :uri "/api/embed/dashboard/42")
                      (ring.mock/header "x-metabase-client" "embedding-sdk-react"))]
      (is (= "embedding-sdk-react" (client-from-mw request))))))

(deftest include-analytics-is-idempotent
  (let [m        (atom {})
        expected {:embedding_client      "client-C"
                  :embedding_route       "public"
                  :embedding_sdk_version "1.33.7"
                  :auth_method           nil
                  :metabase_version      (:tag config/mb-version-info)}]
    (binding [sdk/*client* "client-C"
              sdk/*route*  "public"
              sdk/*version* "1.33.7"]
      (is (= expected
             (analytics/include-sdk-info @m)))
      (swap! m analytics/include-sdk-info))
    ;; unset the vars:
    (binding [sdk/*client* nil
              sdk/*route*  nil
              sdk/*version* nil]
      (is (= expected @m))
      (testing "the values in m are used when the vars are not set"
        (is (= expected
               (analytics/include-sdk-info @m)))))))

(deftest include-sdk-info-pii-fields-test
  (let [request (-> (ring.mock/request :get "/api/public/card/1")
                    (ring.mock/header "x-metabase-embed-referrer" "https://app.example.com/dashboard/1?x=y")
                    (ring.mock/header "user-agent" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    (assoc :remote-addr "10.0.0.1"))]
    (testing "PII fields populated when setting enabled and request bound"
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
        (request.current/with-current-request request
          (let [result (sdk/include-sdk-info {})]
            (is (= "app.example.com"  (:embedding_hostname result)))
            (is (= "/dashboard/1"     (:embedding_path result)))
            (is (= "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                   (:user_agent result)))
            (is (= "Browser (Chrome/OS X)" (:sanitized_user_agent result)))
            (is (= "10.0.0.1"         (:ip_address result)))))))
    (testing "PII fields nil when setting disabled, but hostname still populated"
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
        (request.current/with-current-request request
          (let [result (sdk/include-sdk-info {})]
            (is (= "app.example.com" (:embedding_hostname result)))
            (is (nil? (:embedding_path result)))
            (is (nil? (:user_agent result)))
            (is (nil? (:sanitized_user_agent result)))
            (is (nil? (:ip_address result)))))))
    (testing "PII fields nil when no request bound"
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
        (let [result (sdk/include-sdk-info {})]
          (is (nil? (:embedding_hostname result)))
          (is (nil? (:embedding_path result)))
          (is (nil? (:user_agent result)))
          (is (nil? (:sanitized_user_agent result)))
          (is (nil? (:ip_address result))))))))

(deftest embed-referrer-header-precedence-test
  (let [request (-> (ring.mock/request :get "/api/embed/card/1")
                    (ring.mock/header "x-metabase-embed-referrer" "https://embed.example.com/analytics/dash")
                    (ring.mock/header "origin" "https://fallback.example.com")
                    (ring.mock/header "referer" "https://fallback.example.com/other/path")
                    (assoc :remote-addr "10.0.0.1"))]
    (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
      (request.current/with-current-request request
        (let [result (sdk/include-sdk-info {})]
          (testing "hostname comes from embed-referrer header, not origin"
            (is (= "embed.example.com" (:embedding_hostname result))))
          (testing "path comes from embed-referrer header, not referer"
            (is (= "/analytics/dash" (:embedding_path result)))))))))
