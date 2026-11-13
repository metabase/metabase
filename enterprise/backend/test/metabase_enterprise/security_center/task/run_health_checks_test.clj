(ns metabase-enterprise.security-center.task.run-health-checks-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.db :as security-center.db]
   [metabase-enterprise.security-center.health-checks :as health-checks]
   [metabase-enterprise.security-center.task.run-health-checks :as run-health-checks]
   [metabase.premium-features.core :as premium-features]
   [metabase.startup.core :as startup]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private stored-results
  {:read-only-connections {:result {}, :checked_at "2026-11-06T10:00:00Z"}})

(deftest run-health-checks!-test
  (testing "does nothing when Security Center is off"
    (let [calls (atom 0)]
      (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly false)
                                  health-checks/refresh-and-run-checks      #(do (swap! calls inc) [])]
        (run-health-checks/run-health-checks!)
        (is (zero? @calls)))))
  (testing "refreshes and runs the checks, then sets the status gauge, and the last-run gauge to the stored refresh time"
    (mt/with-premium-features #{:admin-security-center}
      (mt/with-temporary-setting-values [security-center-health-check-results stored-results]
        (with-redefs [health-checks/checks {:read-only-connections {:id       :read-only-connections
                                                                    :severity :high
                                                                    :refresh  (constantly {})}}]
          (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                      health-checks/refresh-and-run-checks      (constantly [{:id       :read-only-connections
                                                                                              :severity :high
                                                                                              :status   :fail}])]
            (mt/with-prometheus-system! [_ system]
              (run-health-checks/run-health-checks!)
              (is (= 1793959200.0 (mt/metric-value system
                                                   :metabase-security-center/health-checks-last-run-timestamp-seconds)))
              (is (= 1.0 (mt/metric-value system :metabase-security-center/health-checks
                                          {:check_id "read-only-connections", :severity "high", :status "fail"}))))))))))

(deftest startup-logic-sets-the-gauges-test
  (let [startup! #(startup/def-startup-logic! ::run-health-checks/HealthCheckGauges)]
    (testing "sets the status gauge and the last-run gauge from the stored result, and refreshes nothing"
      (mt/with-premium-features #{:admin-security-center}
        (mt/with-temporary-setting-values [security-center-health-check-results stored-results]
          (let [refreshes (atom 0)]
            ;; the refresh of read-only-connections starts with this query
            (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                        security-center.db/databases-with-details #(do (swap! refreshes inc) [])]
              (mt/with-prometheus-system! [_ system]
                (startup!)
                (is (= 1.0 (mt/metric-value system :metabase-security-center/health-checks
                                            {:check_id "read-only-connections", :severity "high", :status "pass"})))
                (is (= 1793959200.0 (mt/metric-value system
                                                     :metabase-security-center/health-checks-last-run-timestamp-seconds)))
                (is (zero? @refreshes))))))))
    (testing "does nothing when Security Center is off"
      (let [calls (atom 0)]
        (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly false)
                                    health-checks/run-checks                  #(do (swap! calls inc) [])]
          (startup!)
          (is (zero? @calls)))))))
