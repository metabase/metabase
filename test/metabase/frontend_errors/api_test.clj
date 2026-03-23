(ns metabase.frontend-errors.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

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
                        [:errors])))))
