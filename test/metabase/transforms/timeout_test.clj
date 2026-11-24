(ns metabase.transforms.timeout-test
  "Tests for observability of the transform-run timeout sweeper and the job-run reaper."
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.audit-app.models.audit-log :as audit-log]
   [metabase.events.test-util :as events.tu]
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

(deftest timeout-old-runs-statement-count-test
  (testing "timing out 10 stale runs runs as many statements as timing out 40, with one audit row for each run"
    (mt/with-premium-features #{:transforms-basic :audit-app}
      (let [reap! (fn [n]
                    (let [transform-ids (t2/insert-returning-pks! :model/Transform
                                                                  (for [_ (range n)]
                                                                    (mt/with-temp-defaults :model/Transform)))
                          run-ids       (t2/insert-returning-pks!
                                         :model/TransformRun
                                         (for [transform-id transform-ids]
                                           {:transform_id   transform-id
                                            :status         :started
                                            :is_active      true
                                            :run_method     :manual
                                            :start_time     (minutes-ago 30)
                                            :last_heartbeat (minutes-ago 30)}))]
                      (try
                        {:count  (events.tu/real-statement-count! #(transform-run/timeout-old-runs! 5 :minute))
                         :audits (t2/count :model/AuditLog :topic "transform-run-timeout" :model "TransformRun"
                                           :model_id [:in run-ids])}
                        (finally
                          (t2/delete! :model/AuditLog :topic "transform-run-timeout" :model_id [:in run-ids])
                          (t2/delete! :model/TransformRun :id [:in run-ids])
                          (t2/delete! :model/Transform :id [:in transform-ids])))))]
        (reap! 2)
        (let [small (reap! 10)
              large (reap! 40)]
          (is (= (:count small) (:count large)))
          (is (= [10 40] [(:audits small) (:audits large)])))))))

(defn- timeout-audit-model-ids!
  "Reap three stale runs while `wrap` wraps the audit log functions, and return the run ids, the second one apart, with
  the ids of the runs that got an audit row and the statuses of the runs."
  [wrap]
  (let [transform-ids (t2/insert-returning-pks! :model/Transform
                                                (for [_ (range 3)] (mt/with-temp-defaults :model/Transform)))
        run-ids       (t2/insert-returning-pks!
                       :model/TransformRun
                       (for [transform-id transform-ids]
                         {:transform_id   transform-id
                          :status         :started
                          :is_active      true
                          :run_method     :manual
                          :start_time     (minutes-ago 30)
                          :last_heartbeat (minutes-ago 30)}))]
    (try
      (wrap (second run-ids) #(transform-run/timeout-old-runs! 5 :minute))
      {:run-ids   run-ids
       :audited   (t2/select-fn-set :model_id :model/AuditLog :topic "transform-run-timeout" :model "TransformRun"
                                    :model_id [:in run-ids])
       :statuses  (t2/select-fn-set :status :model/TransformRun :id [:in run-ids])}
      (finally
        (t2/delete! :model/AuditLog :topic "transform-run-timeout" :model_id [:in run-ids])
        (t2/delete! :model/TransformRun :id [:in run-ids])
        (t2/delete! :model/Transform :id [:in transform-ids])))))

(deftest timeout-old-runs-audit-row-failure-test
  (testing "when the audit row of one of 3 timed-out runs cannot be built, the other 2 still get theirs"
    (mt/with-premium-features #{:transforms-basic :audit-app}
      (let [audit-row (mt/original-fn #'audit-log/audit-row)
            {:keys [run-ids audited statuses]}
            (timeout-audit-model-ids!
             (fn [failing-run-id thunk]
               (mt/with-dynamic-fn-redefs [audit-log/audit-row (fn [topic params]
                                                                 (when (= failing-run-id (get-in params [:object :id]))
                                                                   (throw (ex-info "cannot build row" {})))
                                                                 (audit-row topic params))]
                 (thunk))))]
        (is (= #{:timeout} statuses))
        (is (= (disj (set run-ids) (second run-ids)) audited))))))

(deftest timeout-old-runs-audit-insert-failure-test
  (testing "when the one insert of the audit rows of 3 timed-out runs fails, each row is inserted on its own"
    (mt/with-premium-features #{:transforms-basic :audit-app}
      (let [create! (mt/original-fn #'audit-log/create-audit-logs!)
            {:keys [run-ids audited]}
            (timeout-audit-model-ids!
             (fn [_ thunk]
               (mt/with-dynamic-fn-redefs [audit-log/create-audit-logs! (fn [rows]
                                                                          (when (< 1 (count rows))
                                                                            (throw (ex-info "cannot insert rows" {})))
                                                                          (create! rows))]
                 (thunk))))]
        (is (= (set run-ids) audited))))))
