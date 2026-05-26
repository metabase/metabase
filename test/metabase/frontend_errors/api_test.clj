(ns metabase.frontend-errors.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.frontend-errors.api :as frontend-errors.api]
   [metabase.request.settings :as request.settings]
   [metabase.server.middleware.browser-cookie :as mw.browser-cookie]
   [metabase.test :as mt]
   [throttle.core :as throttle]))

(def ^:private throttled-response
  {:status  429
   :headers {"Retry-After" string?}
   :body    {:error #(str/starts-with? % "Too many attempts!")}})

(defn- request-options
  ([]
   {:request-options {:headers {"x-forwarded-for" "10.1.2.3"}}})
  ([device-id]
   (let [browser-id-cookie-name @#'mw.browser-cookie/browser-id-cookie-name]
     {:request-options {:headers {"x-forwarded-for" "10.1.2.3"
                                  "cookie"          (str browser-id-cookie-name "=" device-id)}}})))

(defmacro ^:private with-throttled-frontend-errors [& body]
  `(with-redefs [frontend-errors.api/frontend-errors-throttler
                 (throttle/make-throttler :frontend-errors :attempts-threshold 1)
                 request.settings/source-address-header
                 (constantly "x-forwarded-for")]
     ~@body))

(deftest post-frontend-errors-test
  (testing "POST /api/frontend-errors increments the counter for component-crash and returns 204"
    (mt/with-prometheus-system! [_ system]
      (let [initial (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
        (is (nil? (mt/user-http-request :rasta :post 204 "frontend-errors" {:type "component-crash"})))
        (is (< initial (mt/metric-value system :metabase-frontend/errors {:type "component-crash"}))))))

  (testing "POST /api/frontend-errors with type=chart-render-error tracks separately"
    (mt/with-prometheus-system! [_ system]
      (let [initial (mt/metric-value system :metabase-frontend/errors {:type "chart-render-error"})]
        (mt/user-http-request :rasta :post 204 "frontend-errors" {:type "chart-render-error"})
        (is (< initial (mt/metric-value system :metabase-frontend/errors {:type "chart-render-error"}))))))

  (testing "POST /api/frontend-errors rejects unknown type values"
    (is (= {:errors {:type "enum of component-crash, chart-render-error"}}
           (select-keys (mt/user-http-request :rasta :post 400 "frontend-errors" {:type "bogus"})
                        [:errors]))))

  (testing "POST /api/frontend-errors is throttled for the same IP once the threshold is exceeded"
    (mt/with-prometheus-system! [_ system]
      (with-throttled-frontend-errors
        (let [request-options (request-options "device-a")
              initial-count   (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
          (is (nil? (mt/user-http-request :rasta :post 204 "frontend-errors" request-options
                                          {:type "component-crash"})))
          (let [count-after-first-request (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})
                resp                      (mt/user-http-request-full-response :crowberto :post 429 "frontend-errors"
                                                                              request-options
                                                                              {:type "component-crash"})
                count-after-throttling    (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
            (is (< initial-count count-after-first-request))
            (is (= count-after-first-request count-after-throttling))
            (is (=? throttled-response resp))))))

    (testing "POST /api/frontend-errors throttles requests from the same IP even if the browser ID changes"
      (mt/with-prometheus-system! [_ system]
        (with-throttled-frontend-errors
          (let [device-a-opts          (request-options "device-a")
                device-b-opts          (request-options "device-b")
                initial-count          (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
            (is (nil? (mt/user-http-request :rasta :post 204 "frontend-errors" device-a-opts
                                            {:type "component-crash"})))
            (let [resp                   (mt/user-http-request-full-response :crowberto :post 429 "frontend-errors"
                                                                             device-b-opts
                                                                             {:type "component-crash"})
                  count-after-throttling   (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
              (is (= (inc initial-count) count-after-throttling))
              (is (=? throttled-response resp)))))))

    (testing "POST /api/frontend-errors throttles repeated requests from the same IP even without a browser cookie"
      (mt/with-prometheus-system! [_ system]
        (with-throttled-frontend-errors
          (let [request-options (request-options)
                initial-count   (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
            (is (nil? (mt/user-http-request :rasta :post 204 "frontend-errors" request-options
                                            {:type "component-crash"})))
            (let [resp                  (mt/user-http-request-full-response :crowberto :post 429 "frontend-errors"
                                                                            request-options
                                                                            {:type "component-crash"})
                  count-after-throttling (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
              (is (= (inc initial-count) count-after-throttling))
              (is (=? throttled-response resp)))))))

    (testing "POST /api/frontend-errors throttles repeated invalid payloads before validation"
      (with-throttled-frontend-errors
        (let [request-options (request-options "device-a")]
          (is (= {:errors {:type "enum of component-crash, chart-render-error"}}
                 (select-keys (mt/user-http-request :rasta :post 400 "frontend-errors" request-options
                                                    {:type "bogus"})
                              [:errors])))
          (let [resp (mt/user-http-request-full-response :crowberto :post 429 "frontend-errors"
                                                         request-options
                                                         {:type "still-bogus"})]
            (is (=? throttled-response resp))))))))
