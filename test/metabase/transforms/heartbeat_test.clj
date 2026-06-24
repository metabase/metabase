(ns metabase.transforms.heartbeat-test
  "Tests for transform-run and job-run heartbeats and orphan reaping."
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.models.job-run :as job-run]
   [metabase.transforms.models.transform-run :as transform-run]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- minutes-ago ^OffsetDateTime [^long n]
  (.minusMinutes (OffsetDateTime/now ZoneOffset/UTC) n))

(defn- heartbeat ^OffsetDateTime [run-id]
  (t2/select-one-fn :last_heartbeat :model/TransformRun :id run-id))

(defn- recently-beaten? [run-id]
  (.isAfter (heartbeat run-id) (minutes-ago 1)))

(defn- job-heartbeat ^OffsetDateTime [run-id]
  (t2/select-one-fn :last_heartbeat :model/TransformJobRun :id run-id))

(defn- job-recently-beaten? [run-id]
  (.isAfter (job-heartbeat run-id) (minutes-ago 1)))

(deftest heartbeat-runs!-test
  (mt/with-premium-features #{:transforms-basic}
    ;; only one active run per transform is allowed (unique index): distinct transform per active run
    (mt/with-temp [:model/Transform    {t1 :id}          {}
                   :model/Transform    {t2 :id}          {}
                   :model/TransformRun {beat-id :id}     {:transform_id   t1
                                                          :status         :started
                                                          :is_active      true
                                                          :run_method     :manual
                                                          :start_time     (minutes-ago 10)
                                                          :last_heartbeat (minutes-ago 10)}
                   :model/TransformRun {other-id :id}    {:transform_id   t2
                                                          :status         :started
                                                          :is_active      true
                                                          :run_method     :manual
                                                          :start_time     (minutes-ago 10)
                                                          :last_heartbeat (minutes-ago 10)}
                   :model/TransformRun {done-id :id}     {:transform_id   t1
                                                          :status         :succeeded
                                                          :is_active      nil
                                                          :run_method     :manual
                                                          :start_time     (minutes-ago 10)
                                                          :last_heartbeat (minutes-ago 10)}]
      (transform-run/heartbeat-runs! [beat-id done-id])
      (testing "only the passed run that is still active gets a fresh heartbeat"
        (is (recently-beaten? beat-id))
        (is (not (recently-beaten? other-id)) "a run not in the id list is left to go stale"))
      (testing "an inactive run is not stamped even when passed (is_active guard)"
        (is (not (recently-beaten? done-id))))
      (testing "empty id list is a no-op"
        (is (nil? (transform-run/heartbeat-runs! [])))))))

(deftest heartbeat-and-reconcile-runs!-beats-connections-test
  (testing "the per-node tick beats exactly the runs registered in the cancel/heartbeat registry"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Transform    {t1 :id}             {}
                     :model/Transform    {t2 :id}             {}
                     :model/TransformRun {registered-id :id}   {:transform_id   t1
                                                                :status         :started
                                                                :is_active      true
                                                                :run_method     :manual
                                                                :start_time     (minutes-ago 10)
                                                                :last_heartbeat (minutes-ago 10)}
                     :model/TransformRun {unregistered-id :id} {:transform_id   t2
                                                                :status         :started
                                                                :is_active      true
                                                                :run_method     :manual
                                                                :start_time     (minutes-ago 10)
                                                                :last_heartbeat (minutes-ago 10)}]
        (canceling/chan-start-run! registered-id (a/promise-chan))
        (try
          (canceling/heartbeat-and-reconcile-runs!)
          (is (recently-beaten? registered-id) "the registered (executing) run is heartbeated")
          (is (not (recently-beaten? unregistered-id)) "a run not being executed here is left to go stale")
          (finally
            (canceling/chan-end-run! registered-id)))))))

(deftest reap-orphaned-runs!-test
  (mt/with-premium-features #{:transforms-basic :audit-app}
    (mt/with-prometheus-system! [_ _system]
      (mt/with-temp [:model/Transform    {t1 :id}          {}
                     :model/Transform    {t2 :id}          {}
                     :model/TransformRun {stale-id :id}    {:transform_id   t1
                                                            :status         :started
                                                            :is_active      true
                                                            :run_method     :manual
                                                            :start_time     (minutes-ago 10)
                                                            :last_heartbeat (minutes-ago 10)}
                     :model/TransformRun {fresh-id :id}    {:transform_id   t2
                                                            :status         :started
                                                            :is_active      true
                                                            :run_method     :manual
                                                            :start_time     (minutes-ago 10)
                                                            :last_heartbeat (minutes-ago 1)}]
        (testing "reaps only the run whose heartbeat is older than the threshold"
          (let [reaped (transform-run/reap-orphaned-runs! 5)]
            (is (= [stale-id] (mapv :id reaped)))
            (is (= :timeout (t2/select-one-fn :status :model/TransformRun :id stale-id)))
            (is (= :started (t2/select-one-fn :status :model/TransformRun :id fresh-id)))
            (testing "reaped row carries the distinguishing message"
              (is (= "Timed out: crashed"
                     (t2/select-one-fn :message :model/TransformRun :id stale-id))))))
        (testing "a second sweep finds nothing (row already inactive)"
          (is (empty? (transform-run/reap-orphaned-runs! 5))))))))

(deftest start-run!-stamps-initial-heartbeat-test
  (testing "a freshly started run has an initial heartbeat"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Transform {transform-id :id} {}]
        (let [{run-id :id} (transform-run/start-run! transform-id {:run_method "manual"})]
          (is (some? (heartbeat run-id)) "last_heartbeat is populated by the column default"))))))

;;; ------------------------------------------- Job-run heartbeat -------------------------------------------

(deftest job-heartbeat-runs!-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temp [:model/TransformJob    {job-id :id}   {:name "hb-job" :schedule "0 0 * * * ? *"}
                   :model/TransformJobRun {beat-id :id}  {:job_id         job-id
                                                          :status         :started
                                                          :is_active      true
                                                          :run_method     :manual
                                                          :last_heartbeat (minutes-ago 10)}
                   :model/TransformJobRun {other-id :id} {:job_id         job-id
                                                          :status         :started
                                                          :is_active      true
                                                          :run_method     :manual
                                                          :last_heartbeat (minutes-ago 10)}
                   :model/TransformJobRun {done-id :id}  {:job_id         job-id
                                                          :status         :succeeded
                                                          :is_active      nil
                                                          :run_method     :manual
                                                          :last_heartbeat (minutes-ago 10)}]
      (job-run/heartbeat-runs! [beat-id done-id])
      (testing "only the passed run that is still active gets a fresh heartbeat"
        (is (job-recently-beaten? beat-id))
        (is (not (job-recently-beaten? other-id)) "a run not in the id list is left to go stale"))
      (testing "an inactive run is not stamped even when passed (is_active guard)"
        (is (not (job-recently-beaten? done-id))))
      (testing "empty id list is a no-op"
        (is (nil? (job-run/heartbeat-runs! [])))))))

(deftest job-reap-orphaned-runs!-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-prometheus-system! [_ _system]
      (mt/with-temp [:model/TransformJob    {job-id :id}   {:name "hb-job" :schedule "0 0 * * * ? *"}
                     :model/TransformJobRun {stale-id :id} {:job_id         job-id
                                                            :status         :started
                                                            :is_active      true
                                                            :run_method     :manual
                                                            :last_heartbeat (minutes-ago 10)}
                     :model/TransformJobRun {fresh-id :id} {:job_id         job-id
                                                            :status         :started
                                                            :is_active      true
                                                            :run_method     :manual
                                                            :last_heartbeat (minutes-ago 1)}]
        (testing "reaps only the job run whose heartbeat is older than the threshold"
          (let [reaped (job-run/reap-orphaned-runs! 5)]
            (is (= [stale-id] (mapv :id reaped)))
            (is (= :timeout (t2/select-one-fn :status :model/TransformJobRun :id stale-id)))
            (is (= :started (t2/select-one-fn :status :model/TransformJobRun :id fresh-id)))
            (is (= "Timed out: crashed"
                   (t2/select-one-fn :message :model/TransformJobRun :id stale-id)))))
        (testing "a second sweep finds nothing (row already inactive)"
          (is (empty? (job-run/reap-orphaned-runs! 5))))))))
