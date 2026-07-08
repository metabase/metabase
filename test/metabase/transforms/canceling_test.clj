(ns metabase.transforms.canceling-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.models.transform-run-cancelation :as trc]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(def ^:private run-defaults
  {:transform_name "test"
   :transform_entity_id "eid"
   :status "started"
   :is_active true
   :run_method "manual"})

(deftest cancelation-observability-test
  ;; Consolidated into a single `with-prometheus-system!` boot — registry boot is expensive. Each block calls
  ;; `prometheus/clear!` on the metric(s) it will touch, so every assertion runs against a known zero baseline
  ;; and blocks are independent of ordering.
  (mt/with-premium-features #{:transforms-basic :audit-app}
    (mt/with-prometheus-system! [_ system]
      (testing "mark-cancel-started-run! bumps {status=error} when DB writes throw"
        (prometheus/clear! :metabase-transforms/cancelation-requests)
        (mt/with-temp [:model/Transform    _t           {}
                       :model/TransformRun {run-id :id} (assoc run-defaults :transform_id nil)]
          (with-redefs [t2/update! (fn [& _] (throw (ex-info "boom" {})))]
            (is (thrown? Exception (trc/mark-cancel-started-run! run-id))))
          (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/cancelation-requests {:status "error"})))
          (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-requests {:status "ok"})))))
      (testing "mark-cancel-started-run! bumps {status=ok} on success and writes a row"
        (prometheus/clear! :metabase-transforms/cancelation-requests)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {run-id :id}       (assoc run-defaults :transform_id transform-id)]
          (trc/mark-cancel-started-run! run-id)
          (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/cancelation-requests {:status "ok"})))
          (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-requests {:status "error"})))
          (is (some? (t2/select-one :model/TransformRunCancelation :run_id run-id)))))
      (testing "no cancel-chan registered: cancel-run! is a no-op with no completion metric"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun run                (assoc run-defaults :transform_id transform-id)]
          (canceling/cancel-run! run (OffsetDateTime/now))
          (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "success"})))
          (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))))
      (testing "cancel-run! with a registered channel: a throw inside the cancel path bumps {outcome=error}"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {:as run :keys [id]} (assoc run-defaults :transform_id transform-id)]
          (let [cancel-chan (a/promise-chan)]
            (canceling/chan-start-run! id cancel-chan)
            (with-redefs [t2/update! (fn [& _] (throw (ex-info "boom" {})))]
              (is (thrown? Exception (canceling/cancel-run! run (OffsetDateTime/now)))))
            (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))
            (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "success"}))))))
      (testing "cancel-run! success path bumps {outcome=success} and records latency"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (prometheus/clear! :metabase-transforms/cancelation-latency-ms)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {:as run :keys [id]} (assoc run-defaults :transform_id transform-id)]
          (let [cancel-chan (a/promise-chan)]
            (canceling/chan-start-run! id cancel-chan)
            (canceling/cancel-run! run (OffsetDateTime/now))
            (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "success"})))
            (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))
            (is (pos? (:count (mt/metric-value system :metabase-transforms/cancelation-latency-ms {:outcome "success"}))))
            (is (zero? (:count (mt/metric-value system :metabase-transforms/cancelation-latency-ms {:outcome "error"}))))
            (is (= :canceled (t2/select-one-fn :status :model/TransformRun :id id))))))
      (testing "cancel-old-transform-runs! sweep bumps {outcome=timeout} for stale canceling runs"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (prometheus/clear! :metabase-transforms/cancelation-latency-ms)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {run-id :id}       (assoc run-defaults
                                                                     :transform_id transform-id
                                                                     :status "canceling")]
          (t2/insert! :model/TransformRunCancelation
                      {:run_id run-id
                       :time   (.minusMinutes (OffsetDateTime/now) 5)})
          (@#'canceling/cancel-old-transform-runs! nil)
          (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "timeout"})))
          (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "success"})))
          (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))
          (is (pos? (:count (mt/metric-value system :metabase-transforms/cancelation-latency-ms {:outcome "timeout"}))))
          (is (= :canceled (t2/select-one-fn :status :model/TransformRun :id run-id)))
          (let [audit (t2/select-one :model/AuditLog
                                     :topic "transform-run-canceled"
                                     :model_id run-id
                                     {:order-by [[:id :desc]]})]
            (is (some? audit))
            (is (= "canceled" (get-in audit [:details :status])))
            (is (= "timeout"  (get-in audit [:details :outcome]))))))
      (testing "cancel-old-transform-runs! does not count rows already transitioned by another path"
        ;; Race guard: SELECT FOR UPDATE inside `cancel-old-canceling-runs!` returns only still-active rows,
        ;; so the sweep emits `outcome=timeout` only for rows it actually transitioned — never for runs that
        ;; another path (cancel-run!, timeout-run!) had already finished.
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        ;; Two separate transforms because there's a unique partial index forbidding two active runs
        ;; for the same transform_id (IDX_UNIQUE_ACTIVE_TRANSFORM_RUN_INDEX_C).
        (mt/with-temp [:model/Transform    {t1 :id} {}
                       :model/Transform    {t2 :id} {}
                       :model/TransformRun {r1 :id} (assoc run-defaults :transform_id t1 :status "canceling")
                       :model/TransformRun {r2 :id} (assoc run-defaults :transform_id t2 :status "canceling")]
          (let [old (.minusMinutes (OffsetDateTime/now) 5)]
            (t2/insert! :model/TransformRunCancelation {:run_id r1 :time old})
            (t2/insert! :model/TransformRunCancelation {:run_id r2 :time old}))
          ;; Simulate r2 already finished by a concurrent path before the sweep fires.
          (t2/update! :model/TransformRun :id r2 {:is_active nil :status :canceled})
          (@#'canceling/cancel-old-transform-runs! nil)
          (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "timeout"})))
          (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))
          (is (= :canceled (t2/select-one-fn :status :model/TransformRun :id r1)))))
      (testing "cancel-old-transform-runs! bumps a single {outcome=error} when the transactional update throws"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {run-id :id}       (assoc run-defaults
                                                                     :transform_id transform-id
                                                                     :status "canceling")]
          (t2/insert! :model/TransformRunCancelation
                      {:run_id run-id :time (.minusMinutes (OffsetDateTime/now) 5)})
          (with-redefs [t2/update! (fn [& _] (throw (ex-info "boom" {})))]
            (@#'canceling/cancel-old-transform-runs! nil))
          ;; Aggregate error: we don't know per-row magnitude after a rollback, just that the sweep failed.
          (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))
          (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "timeout"})))))
      (testing "telemetry failure in record-completion! does not double-count"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {:as run :keys [id]} (assoc run-defaults :transform_id transform-id)]
          (let [cancel-chan (a/promise-chan)]
            (canceling/chan-start-run! id cancel-chan)
            (with-redefs [events/publish-event! (fn [& _] (throw (ex-info "event boom" {})))]
              (canceling/cancel-run! run (OffsetDateTime/now)))
            ;; Healthy: success=1, error=0. Buggy (double-count): success=1, error=1.
            (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "success"})))
            (is (== 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))))))))
