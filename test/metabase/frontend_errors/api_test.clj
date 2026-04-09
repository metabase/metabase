(ns metabase.frontend-errors.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.frontend-errors.api :as frontend-errors.api]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.http-client :as client]
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
    (with-redefs [frontend-errors.api/frontend-errors-throttler
                  (throttle/make-throttler :frontend-errors :attempts-threshold 1)]
      (mt/user-http-request :rasta :post 204 "frontend-errors" {:type "component-crash"})
      (let [resp (client/client-full-response (test.users/username->token :rasta)
                                              :post 429 "frontend-errors"
                                              {:type "component-crash"})]
        (is (str/starts-with? (get-in resp [:body :error]) "Too many attempts!"))
        (is (string? (get-in resp [:headers "Retry-After"])))))))
