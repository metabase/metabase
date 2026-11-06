(ns metabase-enterprise.security-center.task.run-health-checks-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.health-checks :as health-checks]
   [metabase-enterprise.security-center.task.run-health-checks :as run-health-checks]
   [metabase.premium-features.core :as premium-features]
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
  (testing "refreshes and runs the checks, then sets the last-run gauge to the stored refresh time"
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
              (is (= 0.0 (mt/metric-value system :metabase-security-center/health-checks
                                          {:check_id "read-only-connections", :severity "high", :status "fail"}))
                  "the job does not set the status gauge"))))))))
