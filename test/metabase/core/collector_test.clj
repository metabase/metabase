(ns metabase.core.collector-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.core.collector :as collector]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [ring.mock.request :as ring.mock]))

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------ Smoke Test -------------------------------------------------------

(deftest smoke-test
  (testing "collector namespace loads without error"
    (is (fn? collector/start!))
    (is (fn? collector/collector-routes))
    (is (fn? collector/apply-collector-middleware))))

;;; ------------------------------------------------ Routes Test -------------------------------------------------------

(defn- call-handler
  "Call a 3-arity async Ring handler synchronously. Returns the response map."
  [handler request]
  (let [p (promise)]
    (handler request (fn [response] (deliver p response)) (fn [e] (deliver p e)))
    (let [result (deref p 5000 ::timeout)]
      (when (= result ::timeout)
        (throw (ex-info "Handler timed out" {})))
      (when (instance? Throwable result)
        (throw result))
      result)))

(deftest routes-test
  (let [routes (collector/collector-routes)]
    (testing "GET /livez returns 200"
      (let [response (call-handler routes (ring.mock/request :get "/livez"))]
        (is (= 200 (:status response)))
        (is (= {:status "ok"} (:body response)))))

    (testing "GET /api/health returns a response (200 or 503 depending on init status)"
      (let [response (call-handler routes (ring.mock/request :get "/api/health"))]
        (is (contains? #{200 503} (:status response)))))

    (testing "GET /readyz returns a response"
      (let [response (call-handler routes (ring.mock/request :get "/readyz"))]
        (is (contains? #{200 503} (:status response)))))

    (testing "OPTIONS /api/anything returns 200"
      (let [response (call-handler routes (ring.mock/request :options "/api/anything"))]
        (is (= 200 (:status response)))))

    (testing "GET /api/anything-else returns 404"
      (let [response (call-handler routes (ring.mock/request :get "/api/anything-else"))]
        (is (= 404 (:status response)))))

    (testing "GET / returns 404 (no frontend routes in collector)"
      (let [response (call-handler routes (ring.mock/request :get "/"))]
        (is (= 404 (:status response)))))))

;;; ---------------------------------------------- Middleware Test ----------------------------------------------------

(deftest middleware-test
  (let [routes  (collector/collector-routes)
        handler (collector/apply-collector-middleware routes)]

    (testing "collector handler adds x-metabase-version header on API routes"
      ;; add-version only applies to API calls (uri starts with /api)
      (let [response (call-handler handler (ring.mock/request :get "/api/health"))]
        (is (contains? (:headers response) "x-metabase-version"))))

    (testing "collector handler adds Content-Type header"
      (let [response (call-handler handler (ring.mock/request :get "/livez"))]
        (is (contains? (:headers response) "Content-Type"))))

    (testing "collector handler does NOT bind session/auth (no :metabase-session-key on request)"
      ;; Verify the handler works without any session/cookie middleware.
      ;; A request without cookies should succeed on public endpoints.
      (let [response (call-handler handler (ring.mock/request :get "/livez"))]
        (is (= 200 (:status response)))))))

;;; ------------------------------------------ POST /send Through Collector ------------------------------------------

(deftest collector-send-endpoint-test
  (let [routes  (collector/collector-routes)
        handler (collector/apply-collector-middleware routes)]

    (testing "POST /api/ee/product-analytics/api/send without premium feature returns error"
      (mt/with-premium-features #{}
        (let [request  (-> (ring.mock/request :post "/api/ee/product-analytics/api/send")
                           (ring.mock/content-type "application/json")
                           (ring.mock/body "{\"type\":\"event\",\"payload\":{\"website\":\"abc\",\"url\":\"https://example.com\"}}")
                           (assoc-in [:headers "user-agent"] "Mozilla/5.0"))
              response (call-handler handler request)]
          ;; Should be 400 (public-exceptions masks the 402) or 402
          (is (contains? #{400 402} (:status response))))))

    (testing "POST /api/ee/product-analytics/api/send with premium feature reaches the handler (not 404)"
      (mt/with-premium-features #{:product-analytics}
        ;; Send a request with a nonexistent site UUID. The handler should process it
        ;; and return 400 (validation error), NOT 404 (route not found).
        (let [request  (-> (ring.mock/request :post "/api/ee/product-analytics/api/send")
                           (ring.mock/content-type "application/json")
                           (ring.mock/body "{\"type\":\"event\",\"payload\":{\"website\":\"00000000-0000-0000-0000-000000000000\",\"url\":\"https://example.com\"}}")
                           (assoc-in [:headers "user-agent"] "Mozilla/5.0 Chrome/120"))
              response (call-handler handler request)]
          ;; 400 = handler processed it (validation error for unknown site), not 404
          (is (contains? #{200 400} (:status response))))))))))
