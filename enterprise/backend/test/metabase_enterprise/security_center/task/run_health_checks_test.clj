(ns metabase-enterprise.security-center.task.run-health-checks-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.health-checks :as health-checks]
   [metabase-enterprise.security-center.task.run-health-checks :as run-health-checks]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest run-health-checks!-test
  (testing "does nothing when Security Center is off"
    (let [calls (atom 0)]
      (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly false)
                                  health-checks/refresh-and-run-checks      #(do (swap! calls inc) [])]
        (run-health-checks/run-health-checks!)
        (is (zero? @calls)))))
  (testing "refreshes and runs the checks, then sets the gauges and the last-run time"
    (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                health-checks/refresh-and-run-checks      (constantly [{:id       :https-redirect
                                                                                        :severity :medium
                                                                                        :status   :fail}])]
      (mt/with-prometheus-system! [_ system]
        (run-health-checks/run-health-checks!)
        (is (= 1.0 (mt/metric-value system :metabase-security-center/health-checks
                                    {:check_id "https-redirect", :severity "medium", :status "fail"})))
        (is (pos? (mt/metric-value system :metabase-security-center/health-checks-last-run-timestamp-seconds)))))))
