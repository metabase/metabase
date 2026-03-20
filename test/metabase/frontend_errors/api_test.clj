(ns metabase.frontend-errors.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.test :as mt]))

(deftest post-frontend-errors-test
  (testing "POST /api/frontend-errors increments the counter for render-page and returns 204"
    (mt/with-prometheus-system! [_ system]
      (let [initial (mt/metric-value system :metabase-frontend/errors {:context "render-page"})]
        (is (= {:status 204, :body nil}
               (mt/user-http-request :rasta :post 204 "frontend-errors" {:context "render-page"})))
        (is (< initial (mt/metric-value system :metabase-frontend/errors {:context "render-page"}))))))

  (testing "POST /api/frontend-errors with context=render-chart tracks separately"
    (mt/with-prometheus-system! [_ system]
      (let [initial (mt/metric-value system :metabase-frontend/errors {:context "render-chart"})]
        (mt/user-http-request :rasta :post 204 "frontend-errors" {:context "render-chart"})
        (is (< initial (mt/metric-value system :metabase-frontend/errors {:context "render-chart"}))))))

  (testing "POST /api/frontend-errors rejects unknown context values"
    (is (= "value may be: render-chart, render-page"
           (mt/user-http-request :rasta :post 400 "frontend-errors" {:context "bogus"})))))
