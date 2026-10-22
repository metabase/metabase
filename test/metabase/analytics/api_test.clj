(ns metabase.analytics.api-test
  "See also [[metabase-enterprise.advanced-permissions.api.monitoring-test/anonymous-stats-permission-test]]"
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.api :as analytics.api]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.test :as mt]))

(deftest ^:parallel permissions-test
  (testing "GET /api/analytics/anonymous-stats"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "analytics/anonymous-stats"))))
    (testing "Call successful for superusers"
      (is (map? (mt/user-http-request :crowberto :get 200 "analytics/anonymous-stats"))))))

(def ^:private test-frontend-metrics
  {:experiment/runs-total                  {:experiment #{"my-exp" "e"}}
   :experiment/control-duration-ms         {:experiment #{"my-exp" "e"}}
   :metabase-frontend/analytics-events-dropped {}})

(defn- post-events! [events]
  (with-redefs [analytics.api/frontend-metrics test-frontend-metrics]
    (mt/user-http-request :rasta :post 204 "analytics/internal" {:events events})))

(deftest internal-analytics-records-frontend-metrics-test
  (testing "POST /api/analytics/internal records the counters the frontend reports"
    (mt/with-prometheus-system! [_ system]
      (is (nil? (post-events! [{:op :inc :metric :experiment/runs-total :labels {:experiment "my-exp"} :amount 1}
                               {:op :inc :metric :experiment/runs-total :labels {:experiment "my-exp"}}
                               {:op :inc :metric :experiment/control-duration-ms :labels {:experiment "my-exp"} :amount 2.5}
                               {:op :inc :metric :metabase-frontend/analytics-events-dropped :labels nil :amount 3}])))
      (is (= 2.0 (mt/metric-value system :experiment/runs-total {:experiment "my-exp"})))
      (is (= 2.5 (mt/metric-value system :experiment/control-duration-ms {:experiment "my-exp"})))
      (is (= 3.0 (mt/metric-value system :metabase-frontend/analytics-events-dropped))))))

(deftest internal-analytics-cannot-touch-server-metrics-test
  (testing "POST /api/analytics/internal ignores metrics the frontend does not own"
    (mt/with-prometheus-system! [_ system]
      (prometheus/inc! :metabase-email/messages nil 5)
      (post-events! [{:op :inc :metric :metabase-email/messages :amount 100}])
      (is (= 5.0 (mt/metric-value system :metabase-email/messages))))))

(deftest internal-analytics-only-increments-frontend-metrics-test
  (testing "POST /api/analytics/internal only allows positive increments on frontend metrics"
    (mt/with-prometheus-system! [_ system]
      (post-events! [{:op :inc :metric :experiment/runs-total :labels {:experiment "e"} :amount 4}])
      (post-events! [{:op :inc :metric :experiment/runs-total :labels {:experiment "e"} :amount -1}])
      (is (= 4.0 (mt/metric-value system :experiment/runs-total {:experiment "e"}))))))

(deftest internal-analytics-rejects-non-inc-ops-test
  (testing "POST /api/analytics/internal rejects any op other than :inc"
    (doseq [op [:dec :set :observe :clear]]
      (mt/user-http-request :rasta :post 400 "analytics/internal"
                            {:events [{:op op :metric :experiment/runs-total :labels {:experiment "e"} :amount 1}]}))))

(deftest internal-analytics-blocks-everything-by-default-test
  (testing "No frontend code reports metrics yet, so the real allowlist is empty"
    (is (= {} @#'analytics.api/frontend-metrics))
    (mt/with-prometheus-system! [_ system]
      (mt/user-http-request :rasta :post 204 "analytics/internal"
                            {:events [{:op :inc :metric :experiment/runs-total :labels {:experiment "e"}}
                                      {:op :inc :metric :metabase-frontend/analytics-events-dropped :amount 3}]})
      (is (= 0.0 (mt/metric-value system :experiment/runs-total {:experiment "e"})))
      (is (= 0.0 (mt/metric-value system :metabase-frontend/analytics-events-dropped))))))

(deftest internal-analytics-rejects-undeclared-labels-test
  (testing "POST /api/analytics/internal ignores events whose label keys don't match the metric's labels"
    (mt/with-prometheus-system! [_ system]
      (post-events! [{:op :inc :metric :experiment/runs-total :labels {:experiment "e" :bogus "x"}}
                     {:op :inc :metric :experiment/runs-total :labels {:bogus "x"}}
                     {:op :inc :metric :experiment/runs-total}
                     {:op :inc :metric :metabase-frontend/analytics-events-dropped :labels {:bogus "x"}}])
      (is (= 0.0 (mt/metric-value system :experiment/runs-total {:experiment "e"})))
      (is (= 0.0 (mt/metric-value system :experiment/runs-total {:experiment ""})))
      (is (= 0.0 (mt/metric-value system :metabase-frontend/analytics-events-dropped))))))

(deftest internal-analytics-ignores-unknown-label-values-test
  (testing "POST /api/analytics/internal does not record label values missing from the allowlist"
    (mt/with-prometheus-system! [_ system]
      (post-events! [{:op :inc :metric :experiment/runs-total :labels {:experiment "attacker-chosen"}}])
      (is (= 0.0 (mt/metric-value system :experiment/runs-total {:experiment "attacker-chosen"}))))))

(deftest internal-analytics-ignores-oversized-label-values-test
  (testing "POST /api/analytics/internal does not record events with oversized label values"
    (mt/with-prometheus-system! [_ system]
      (let [long-name (str/join (repeat 1000 "x"))]
        (post-events! [{:op :inc :metric :experiment/runs-total :labels {:experiment long-name}}])
        (is (= 0.0 (mt/metric-value system :experiment/runs-total {:experiment long-name})))
        (is (= 0.0 (mt/metric-value system :experiment/runs-total {:experiment ""})))))))

(deftest ^:parallel internal-analytics-payload-bounds-test
  (testing "POST /api/analytics/internal"
    (testing "rejects invalid payload"
      (mt/user-http-request :rasta :post 400 "analytics/internal"
                            {:events [{:op :bad :metric :test/counter}]}))
    (testing "rejects missing events key"
      (mt/user-http-request :rasta :post 400 "analytics/internal"
                            {:not-events []}))
    (testing "rejects oversized batches"
      (mt/user-http-request :rasta :post 400 "analytics/internal"
                            {:events (repeat 5000 {:op :inc :metric :experiment/runs-total
                                                   :labels {:experiment "e"}})}))))
