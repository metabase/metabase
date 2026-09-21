(ns metabase-enterprise.security-center.metrics-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.security-center.metrics :as metrics]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- advisory
  [overrides]
  (merge {:title             "x"
          :description       "x"
          :remediation       "x"
          :affected_versions []
          :published_at      #t "2026-04-01T00:00:00Z"
          :updated_at        #t "2026-04-01T00:00:00Z"}
         overrides))

(deftest refresh-metrics!-vulnerable-advisories-test
  (testing "vulnerable-advisories gauge counts active+error advisories grouped by severity and acknowledgement"
    (mt/with-premium-features #{:admin-security-center}
      (mt/with-prometheus-system! [_ system]
        (mt/with-temp [:model/SecurityAdvisory _ (advisory {:advisory_id  "SC-METRIC-CRIT-UNACK"
                                                            :severity     "critical"
                                                            :match_status "active"})
                       :model/SecurityAdvisory _ (advisory {:advisory_id     "SC-METRIC-CRIT-ACK"
                                                            :severity        "critical"
                                                            :match_status    "active"
                                                            :acknowledged_at #t "2026-04-02T00:00:00Z"
                                                            :acknowledged_by (mt/user->id :crowberto)})
                       ;; :error is treated as a vulnerability (matching query couldn't verify)
                       :model/SecurityAdvisory _ (advisory {:advisory_id  "SC-METRIC-HIGH-ERR"
                                                            :severity     "high"
                                                            :match_status "error"})
                       :model/SecurityAdvisory _ (advisory {:advisory_id  "SC-METRIC-MED-RESOLVED"
                                                            :severity     "medium"
                                                            :match_status "resolved"})
                       :model/SecurityAdvisory _ (advisory {:advisory_id  "SC-METRIC-LOW-NOT-AFFECTED"
                                                            :severity     "low"
                                                            :match_status "not_affected"})]
          (metrics/refresh-metrics!)
          (testing "critical: 1 unacked active"
            (is (= 1.0 (mt/metric-value system :metabase-security-center/vulnerable-advisories
                                        {:severity "critical" :acknowledged "false"}))))
          (testing "critical: 1 acked active"
            (is (= 1.0 (mt/metric-value system :metabase-security-center/vulnerable-advisories
                                        {:severity "critical" :acknowledged "true"}))))
          (testing "high: 1 unacked error"
            (is (= 1.0 (mt/metric-value system :metabase-security-center/vulnerable-advisories
                                        {:severity "high" :acknowledged "false"}))))
          (testing "high: 0 acked"
            (is (= 0.0 (mt/metric-value system :metabase-security-center/vulnerable-advisories
                                        {:severity "high" :acknowledged "true"}))))
          (testing "resolved/not_affected do not count as vulnerable"
            (is (= 0.0 (mt/metric-value system :metabase-security-center/vulnerable-advisories
                                        {:severity "medium" :acknowledged "false"})))
            (is (= 0.0 (mt/metric-value system :metabase-security-center/vulnerable-advisories
                                        {:severity "low" :acknowledged "false"})))))))))

(deftest refresh-metrics!-clears-stale-counts-test
  (testing "set-gauge! is called for every (severity, acknowledged) pair so counts that drop to 0 are observable"
    (mt/with-premium-features #{:admin-security-center}
      (mt/with-prometheus-system! [_ system]
        (mt/with-temp [:model/SecurityAdvisory _ (advisory {:advisory_id  "SC-METRIC-STALE"
                                                            :severity     "critical"
                                                            :match_status "active"})]
          (metrics/refresh-metrics!)
          (is (= 1.0 (mt/metric-value system :metabase-security-center/vulnerable-advisories
                                      {:severity "critical" :acknowledged "false"}))))
        ;; advisory is gone now (with-temp cleaned up) — refresh should set the gauge back to 0
        (metrics/refresh-metrics!)
        (is (= 0.0 (mt/metric-value system :metabase-security-center/vulnerable-advisories
                                    {:severity "critical" :acknowledged "false"})))))))

(deftest refresh-metrics!-last-sync-timestamp-test
  (testing "last-sync-timestamp-seconds gauge reflects the security-center-last-synced-at setting"
    (mt/with-premium-features #{:admin-security-center}
      (mt/with-prometheus-system! [_ system]
        (testing "no sync yet → gauge stays at 0 (initial value)"
          (mt/with-temporary-setting-values [security-center-last-synced-at nil]
            (metrics/refresh-metrics!)
            (is (= 0.0 (mt/metric-value system :metabase-security-center/last-sync-timestamp-seconds)))))
        (testing "after a sync → gauge is the unix epoch seconds of the setting"
          (let [ts (t/offset-date-time 2026 5 6 12 0 0 0 (t/zone-offset 0))]
            (mt/with-temporary-setting-values [security-center-last-synced-at ts]
              (metrics/refresh-metrics!)
              (is (= (double (.toEpochSecond ts))
                     (mt/metric-value system :metabase-security-center/last-sync-timestamp-seconds))))))))))

(deftest known-labels-test
  (testing "all 4×2 severity × acknowledged combinations are enumerated for initial-value seeding"
    (let [labels (set @#'metrics/vulnerable-advisory-labels)]
      (is (= 8 (count labels)))
      (doseq [severity ["critical" "high" "medium" "low"]
              ack      ["true" "false"]]
        (is (contains? labels {:severity severity :acknowledged ack}))))))
