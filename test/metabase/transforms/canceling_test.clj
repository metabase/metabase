(ns metabase.transforms.canceling-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.models.transform-run-cancelation :as trc]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(defn- approx= [expected actual]
  (< (abs (- actual expected)) 0.001))

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
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-prometheus-system! [_ system]

      (testing "mark-cancel-started-run! bumps {status=error} when DB writes throw"
        (prometheus/clear! :metabase-transforms/cancelation-requests)
        (mt/with-temp [:model/Transform    _t           {}
                       :model/TransformRun {run-id :id} (assoc run-defaults :transform_id nil)]
          (with-redefs [t2/update! (fn [& _] (throw (ex-info "boom" {})))]
            (is (thrown? Exception (trc/mark-cancel-started-run! run-id))))
          (is (approx= 1 (mt/metric-value system :metabase-transforms/cancelation-requests {:status "error"})))
          (is (approx= 0 (mt/metric-value system :metabase-transforms/cancelation-requests {:status "ok"})))))

      (testing "mark-cancel-started-run! bumps {status=ok} on success and writes a row"
        (prometheus/clear! :metabase-transforms/cancelation-requests)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {run-id :id}       (assoc run-defaults :transform_id transform-id)]
          (trc/mark-cancel-started-run! run-id)
          (is (approx= 1 (mt/metric-value system :metabase-transforms/cancelation-requests {:status "ok"})))
          (is (approx= 0 (mt/metric-value system :metabase-transforms/cancelation-requests {:status "error"})))
          (is (some? (t2/select-one :model/TransformRunCancelation :run_id run-id)))))

      (testing "no cancel-chan registered: cancel-run! is a no-op with no completion metric"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun run                (assoc run-defaults :transform_id transform-id)]
          (canceling/cancel-run! run (OffsetDateTime/now))
          (is (approx= 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "success"})))
          (is (approx= 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))))

      (testing "cancel-run! with a registered channel: a throw inside the cancel path bumps {outcome=error}"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {:as run :keys [id]} (assoc run-defaults :transform_id transform-id)]
          (let [cancel-chan (a/promise-chan)]
            (canceling/chan-start-run! id cancel-chan)
            (with-redefs [t2/update! (fn [& _] (throw (ex-info "boom" {})))]
              (is (thrown? Exception (canceling/cancel-run! run (OffsetDateTime/now)))))
            (is (approx= 1 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))
            (is (approx= 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "success"}))))))

      (testing "cancel-run! success path bumps {outcome=success} and records latency"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (prometheus/clear! :metabase-transforms/cancelation-latency-ms)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {:as run :keys [id]} (assoc run-defaults :transform_id transform-id)]
          (let [cancel-chan (a/promise-chan)]
            (canceling/chan-start-run! id cancel-chan)
            (canceling/cancel-run! run (OffsetDateTime/now))
            (is (approx= 1 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "success"})))
            (is (approx= 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))
            (is (pos? (:count (mt/metric-value system :metabase-transforms/cancelation-latency-ms {:outcome "success"}))))
            (is (zero? (:count (mt/metric-value system :metabase-transforms/cancelation-latency-ms {:outcome "error"}))))
            (is (= :canceled (t2/select-one-fn :status :model/TransformRun :id id))))))

      (testing "telemetry failure in record-completion! does not double-count"
        (prometheus/clear! :metabase-transforms/cancelation-completed)
        (mt/with-temp [:model/Transform    {transform-id :id} {}
                       :model/TransformRun {:as run :keys [id]} (assoc run-defaults :transform_id transform-id)]
          (let [cancel-chan (a/promise-chan)]
            (canceling/chan-start-run! id cancel-chan)
            (with-redefs [events/publish-event! (fn [& _] (throw (ex-info "event boom" {})))]
              (canceling/cancel-run! run (OffsetDateTime/now)))
            ;; Healthy: success=1, error=0. Buggy (double-count): success=1, error=1.
            (is (approx= 1 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "success"})))
            (is (approx= 0 (mt/metric-value system :metabase-transforms/cancelation-completed {:outcome "error"})))))))))
