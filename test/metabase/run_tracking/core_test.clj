(ns metabase.run-tracking.core-test
  "Tests for the shared heartbeat + orphan-reaping primitives in [[metabase.run-tracking.core]]."
  (:require
   [clojure.test :refer :all]
   [metabase.run-tracking.core :as rt]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- minutes-ago ^OffsetDateTime [^long n]
  (.minusMinutes (OffsetDateTime/now ZoneOffset/UTC) n))

;;; --------------------------------------------- pure helpers ---------------------------------------------

(deftest ^:parallel unit->ms-test
  (testing "converts each supported unit to milliseconds"
    (is (= 30000   (rt/unit->ms 30 :second)))
    (is (= 300000  (rt/unit->ms 5  :minute)))
    (is (= 7200000 (rt/unit->ms 2  :hour))))
  (testing "unknown unit throws"
    (is (thrown? IllegalArgumentException (rt/unit->ms 1 :day)))))

(deftest ^:parallel detection-latency-ms-test
  (let [^OffsetDateTime reference-ts (OffsetDateTime/of 2026 1 1 0 0 0 0 ZoneOffset/UTC)
        timeout-ms                   (rt/unit->ms 10 :minute)
        deadline-ms                  (+ (inst-ms (.toInstant reference-ts)) timeout-ms)]
    (testing "zero at the deadline"
      (is (zero? (rt/detection-latency-ms reference-ts timeout-ms deadline-ms))))
    (testing "clamped to zero before the deadline"
      (is (zero? (rt/detection-latency-ms reference-ts timeout-ms (- deadline-ms 5000)))))
    (testing "milliseconds past the deadline"
      (is (= 7500
             (rt/detection-latency-ms reference-ts timeout-ms (+ deadline-ms 7500)))))))

;;; --------------------------------------------- reap-rows! -----------------------------------------------

(deftest reap-rows!-is-active-test
  (testing "is_active-based active guard: reaps and returns only the stale active row"
    (mt/with-premium-features #{:transforms-basic}
      ;; one active run per transform is allowed (unique index), so use a distinct transform per active run
      (mt/with-temp [:model/Transform    {t1 :id}    {}
                     :model/Transform    {t2 :id}    {}
                     :model/TransformRun {stale :id} {:transform_id t1 :status :started :is_active true
                                                      :run_method :manual :start_time (minutes-ago 10)
                                                      :last_heartbeat (minutes-ago 10)}
                     :model/TransformRun {fresh :id} {:transform_id t2 :status :started :is_active true
                                                      :run_method :manual :start_time (minutes-ago 10)
                                                      :last_heartbeat (minutes-ago 1)}]
        (let [reaped (rt/reap-rows! {:model :model/TransformRun :active [:= :is_active true]
                                     :stale [:< :last_heartbeat (rt/cutoff 5 :minute)]
                                     :terminal {:status "timeout" :is_active nil :end_time :%now
                                                :message "reaped"}})]
          (is (= [stale] (mapv :id reaped)))
          (is (= :timeout (t2/select-one-fn :status :model/TransformRun :id stale)))
          (is (nil? (t2/select-one-fn :is_active :model/TransformRun :id stale)))
          (is (= "reaped" (t2/select-one-fn :message :model/TransformRun :id stale)))
          (is (= :started (t2/select-one-fn :status :model/TransformRun :id fresh))))
        (testing "second sweep is empty — the row is no longer active"
          (is (empty? (rt/reap-rows! {:model :model/TransformRun :active [:= :is_active true]
                                      :stale [:< :last_heartbeat (rt/cutoff 5 :minute)]
                                      :terminal {:status "timeout" :is_active nil :end_time :%now}}))))))))

(deftest reap-rows!-or-stale-test
  (testing "an :or stale predicate reaps on either branch (fresh heartbeat, old start_time)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Transform    {tid :id}       {}
                     :model/TransformRun {old-start :id} {:transform_id tid :status :started :is_active true
                                                          :run_method :manual :start_time (minutes-ago 120)
                                                          :last_heartbeat (minutes-ago 1)}]
        (let [reaped (rt/reap-rows! {:model :model/TransformRun :active [:= :is_active true]
                                     :stale [:or [:< :last_heartbeat (rt/cutoff 5 :minute)]
                                             [:< :start_time (rt/cutoff 60 :minute)]]
                                     :terminal {:status "timeout" :is_active nil :end_time :%now}})]
          (is (= [old-start] (mapv :id reaped)))
          (is (= :timeout (t2/select-one-fn :status :model/TransformRun :id old-start))))))))

(deftest reap-rows!-status-active-test
  (testing "status-based active guard (TaskRun): guards on :status :started, transitions to :abandoned"
    (mt/with-temp [:model/TaskRun {stale :id} {:run_type :sync :entity_type :database :entity_id 1
                                               :status :started :started_at (minutes-ago 120)
                                               :updated_at (minutes-ago 120) :process_uuid "test"}
                   :model/TaskRun {fresh :id} {:run_type :sync :entity_type :database :entity_id 1
                                               :status :started :started_at (minutes-ago 1)
                                               :updated_at (minutes-ago 1) :process_uuid "test"}]
      (let [reaped (rt/reap-rows! {:model :model/TaskRun :active [:= :status "started"]
                                   :stale [:< :updated_at (rt/cutoff 60 :minute)]
                                   :terminal {:status "abandoned"}})]
        (is (= [stale] (mapv :id reaped)))
        (is (= :abandoned (t2/select-one-fn :status :model/TaskRun :id stale)))
        (is (= :started (t2/select-one-fn :status :model/TaskRun :id fresh)))))))

;;; --------------------------------------------- heartbeat-ids! -------------------------------------------

(deftest heartbeat-ids!-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temp [:model/Transform    {t1 :id}   {}
                   :model/Transform    {t2 :id}   {}
                   :model/TransformRun {beat :id} {:transform_id t1 :status :started :is_active true
                                                   :run_method :manual :start_time (minutes-ago 10)
                                                   :last_heartbeat (minutes-ago 10)}
                   :model/TransformRun {skip :id} {:transform_id t2 :status :started :is_active true
                                                   :run_method :manual :start_time (minutes-ago 10)
                                                   :last_heartbeat (minutes-ago 10)}
                   ;; inactive run can share a transform with an active one (unique index is on active rows)
                   :model/TransformRun {done :id} {:transform_id t1 :status :succeeded :is_active nil
                                                   :run_method :manual :start_time (minutes-ago 10)
                                                   :last_heartbeat (minutes-ago 10)}]
      (rt/heartbeat-ids! :model/TransformRun [:= :is_active true] :last_heartbeat [beat done])
      (let [recent? (fn [id] (.isAfter ^OffsetDateTime (t2/select-one-fn :last_heartbeat :model/TransformRun :id id)
                                       (minutes-ago 1)))]
        (is (recent? beat) "a passed, still-active id is stamped")
        (is (not (recent? skip)) "an id not in the list is left to go stale")
        (is (not (recent? done)) "an inactive id is not stamped (active guard)")
        (is (nil? (rt/heartbeat-ids! :model/TransformRun [:= :is_active true] :last_heartbeat [])) "empty id list is a no-op")))))
