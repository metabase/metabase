(ns metabase.frontend-errors.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.frontend-errors.api :as frontend-errors.api]
   [metabase.request.settings :as request.settings]
   [metabase.test :as mt]
   [throttle.core :as throttle]))

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

  (testing "POST /api/frontend-errors is throttled by IP once the threshold is exceeded"
    (mt/with-prometheus-system! [_ system]
      (with-redefs [frontend-errors.api/frontend-errors-throttler
                    (throttle/make-throttler :frontend-errors :attempts-threshold 1)
                    request.settings/source-address-header
                    (constantly "x-forwarded-for")]
        (let [request-options {:request-options {:headers {"x-forwarded-for" "10.1.2.3"}}}
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
            (is (str/starts-with? (get-in resp [:body :error]) "Too many attempts!"))
            (is (string? (get-in resp [:headers "Retry-After"])))))))))
