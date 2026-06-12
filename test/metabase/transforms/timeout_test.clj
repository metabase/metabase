(ns metabase.transforms.timeout-test
  "Tests for observability of the transform-run timeout sweeper and the job-run reaper."
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.models.job-run :as transforms.job-run]
   [metabase.transforms.models.transform-run :as transform-run]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- minutes-ago ^OffsetDateTime [^long n]
  (.minusMinutes (OffsetDateTime/now ZoneOffset/UTC) n))

(deftest timeout-observability-test
  (mt/with-premium-features #{:transforms-basic :audit-app}
    (mt/with-prometheus-system! [_ system]
      (testing "transform-run sweeper bumps counter, observes histogram, and publishes audit event per timed-out run"
        (prometheus/clear! :metabase-transforms/timeouts-total)
        (prometheus/clear! :metabase-transforms/timeout-detection-latency-ms)
        (mt/with-temp [:model/Transform    {old-transform-id :id}   {}
                       :model/Transform    {fresh-transform-id :id} {}
                       :model/TransformRun {old-run-id :id}         {:transform_id   old-transform-id
                                                                     :status         :started
                                                                     :is_active      true
                                                                     :run_method     :manual
                                                                     :start_time     (minutes-ago 30)
                                                                     :last_heartbeat (minutes-ago 30)}
                       :model/TransformRun {fresh-run-id :id}       {:transform_id   fresh-transform-id
                                                                     :status         :started
                                                                     :is_active      true
                                                                     :run_method     :manual
                                                                     :start_time     (minutes-ago 1)
                                                                     :last_heartbeat (minutes-ago 1)}]
          (let [timed-out (transform-run/timeout-old-runs! 5 :minute)]
            (testing "only the stale run is timed out"
              (is (= 1 (count timed-out)))
              (is (= :timeout (t2/select-one-fn :status :model/TransformRun :id old-run-id)))
              (is (= :started (t2/select-one-fn :status :model/TransformRun :id fresh-run-id)))))
          (testing "counter bumps {type=transform} once for the stale run"
            (is (== 1 (mt/metric-value system
                                       :metabase-transforms/timeouts-total
                                       {:type "transform"}))))
          (testing "histogram observes one positive sample for the stale run"
            (let [hist (mt/metric-value system
                                        :metabase-transforms/timeout-detection-latency-ms
                                        {:type "transform"})]
              (is (= 1 (long (:count hist))))
              (is (pos? (:sum hist)))))
          (testing "audit event is published with topic transform-run-timeout"
            (let [entry (mt/latest-audit-log-entry :transform-run-timeout old-run-id)]
              (is (some? entry))
              (is (= :transform-run-timeout (some-> entry :topic keyword)))
              (is (= "TransformRun" (:model entry)))
              (is (= old-run-id (:model_id entry)))
              (testing "payload reflects the post-update :timeout status (parity with single-run path)"
                (is (= "timeout" (some-> entry :details :status))))))))
      (testing "no metric activity when there are no stale runs"
        (let [inc-calls     (atom [])
              observe-calls (atom [])]
          (mt/with-dynamic-fn-redefs [analytics/inc!     (fn [metric & _] (swap! inc-calls conj metric))
                                      analytics/observe! (fn [metric & _] (swap! observe-calls conj metric))]
            (mt/with-temp [:model/Transform    {transform-id :id} {}
                           :model/TransformRun _ {:transform_id   transform-id
                                                  :status         :started
                                                  :is_active      true
                                                  :run_method     :manual
                                                  :start_time     (minutes-ago 1)
                                                  :last_heartbeat (minutes-ago 1)}]
              (is (empty? (transform-run/timeout-old-runs! 5 :minute)))
              (is (not-any? #{:metabase-transforms/timeouts-total} @inc-calls)
                  "sweeper did not increment :metabase-transforms/timeouts-total")
              (is (not-any? #{:metabase-transforms/timeout-detection-latency-ms} @observe-calls)
                  "sweeper did not observe :metabase-transforms/timeout-detection-latency-ms")))))
      (testing "single-run timeout-run! bumps counter and publishes audit event"
        (prometheus/clear! :metabase-transforms/timeouts-total)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {run-id :id}       {:transform_id   transform-id
                                                               :status         :started
                                                               :is_active      true
                                                               :run_method     :manual
                                                               :start_time     (minutes-ago 1)
                                                               :last_heartbeat (minutes-ago 1)}]
          (transform-run/timeout-run! run-id)
          (is (= :timeout (t2/select-one-fn :status :model/TransformRun :id run-id)))
          (is (== 1 (mt/metric-value system
                                     :metabase-transforms/timeouts-total
                                     {:type "transform"})))
          (let [entry (mt/latest-audit-log-entry :transform-run-timeout run-id)]
            (is (some? entry))
            (is (= run-id (:model_id entry)))
            (is (= "timeout" (some-> entry :details :status))))))
      (testing "job-run reaper bumps {type=job} counter and observes histogram per reaped job run"
        (prometheus/clear! :metabase-transforms/timeouts-total)
        (prometheus/clear! :metabase-transforms/timeout-detection-latency-ms)
        (mt/with-temp [:model/TransformJob    {job-id :id}        {:name     "timeout-test-job"
                                                                   :schedule "0 0 * * * ? *"}
                       :model/TransformJobRun {old-run-id :id}    {:job_id         job-id
                                                                   :status         :started
                                                                   :is_active      true
                                                                   :run_method     :manual
                                                                   :updated_at     (minutes-ago 30)
                                                                   :last_heartbeat (minutes-ago 30)}
                       :model/TransformJobRun {fresh-run-id :id}  {:job_id         job-id
                                                                   :status         :started
                                                                   :is_active      true
                                                                   :run_method     :manual
                                                                   :last_heartbeat (minutes-ago 1)}]
          (let [timed-out (transforms.job-run/reap-orphaned-runs! 5)]
            (is (= 1 (count timed-out)))
            (is (= :timeout (t2/select-one-fn :status :model/TransformJobRun :id old-run-id)))
            (is (= :started (t2/select-one-fn :status :model/TransformJobRun :id fresh-run-id))))
          (is (== 1 (mt/metric-value system
                                     :metabase-transforms/timeouts-total
                                     {:type "job"})))
          (let [hist (mt/metric-value system
                                      :metabase-transforms/timeout-detection-latency-ms
                                      {:type "job"})]
            (is (= 1 (long (:count hist))))
            (is (pos? (:sum hist)))))))))
