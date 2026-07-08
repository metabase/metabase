(ns metabase.transforms.dag-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.coordinated-run :as coordinated-run]
   [metabase.transforms.dag :as dag]
   [metabase.transforms.models.dag-run :as dag-run]
   [metabase.transforms.models.transform-run :as transform-run]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Pure graph logic -------------------------------------------

(deftest dependents-graph-test
  (testing "reverses a forward dependency map (reads) into a dependents map (read-by)"
    (is (= {1 #{2 3} 2 #{4} 3 #{4}}
           (#'dag/dependents-graph {2 #{1} 3 #{1} 4 #{2 3} 1 #{}}))))
  (testing "a node nothing depends on is absent from the dependents map"
    (is (= {1 #{2}}
           (#'dag/dependents-graph {2 #{1}}))))
  (testing "empty graph"
    (is (= {} (#'dag/dependents-graph {})))))

(deftest reachable-test
  (let [graph {1 #{2 3} 2 #{4} 3 #{4} 4 #{}}]
    (testing "includes the start node and everything transitively reachable"
      (is (= #{1 2 3 4} (#'dag/reachable graph 1)))
      (is (= #{2 4} (#'dag/reachable graph 2)))
      (is (= #{4} (#'dag/reachable graph 4))))
    (testing "a start node with no outgoing edges reaches only itself"
      (is (= #{5} (#'dag/reachable {} 5)))))
  (testing "cycles terminate (each node visited once)"
    (is (= #{1 2 3} (#'dag/reachable {1 #{2} 2 #{3} 3 #{1}} 1)))))

;;; ------------------------------------------- run-dag! guard -------------------------------------------

(deftest run-dag-skips-when-already-running-test
  (testing "run-dag! does not start a second run while one is already active for the seed transform"
    (let [start-promise (promise)
          planned?      (atom false)]
      (mt/with-dynamic-fn-redefs [dag-run/running-run-for-source-transform-id (constantly {:id 1})
                                  dag-run/start-dag-run!                       (fn [& _] (reset! planned? true) {:id 2})]
        (is (nil? (dag/run-dag! 42 {:direction :upstream :start-promise start-promise})))
        (is (false? @planned?) "should not create a DAG run row when one is already running")
        (is (nil? (deref start-promise 100 :timed-out))
            "start-promise is delivered nil so a waiting caller doesn't hang")))))

;;; ------------------------------------------- Model lifecycle -------------------------------------------

(deftest dag-run-lifecycle-test
  (mt/with-temp [:model/Transform {tid :id} {:name "seed"}]
    (testing "start-dag-run! creates a started, active run for the seed transform"
      (let [{run-id :id :as run} (dag-run/start-dag-run! tid :upstream (mt/user->id :rasta))]
        (try
          (is (= :started (:status run)))
          (is (true? (:is_active run)))
          (is (= tid (:source_transform_id run)))
          (is (= :upstream (:direction run)))
          (is (= (mt/user->id :rasta) (:user_id run)))
          (testing "running-run-for-source-transform-id finds the active run"
            (is (= run-id (:id (dag-run/running-run-for-source-transform-id tid)))))
          (testing "succeed-started-run! makes it terminal and inactive"
            (is (= 1 (dag-run/succeed-started-run! run-id)))
            (is (= :succeeded (:status (t2/select-one :model/TransformDagRun :id run-id))))
            (is (nil? (:is_active (t2/select-one :model/TransformDagRun :id run-id))))
            (is (nil? (dag-run/running-run-for-source-transform-id tid))))
          (finally
            (t2/delete! :model/TransformDagRun :id run-id)))))
    (testing "cancel-started-run! cancels an active run but is a no-op once terminal"
      (let [{run-id :id} (dag-run/start-dag-run! tid :downstream nil)]
        (try
          (is (= 1 (coordinated-run/cancel-started-run! :model/TransformDagRun run-id)))
          (is (= :canceled (:status (t2/select-one :model/TransformDagRun :id run-id))))
          (is (zero? (coordinated-run/cancel-started-run! :model/TransformDagRun run-id))
              "a finished run is never resurrected into a canceled state")
          (finally
            (t2/delete! :model/TransformDagRun :id run-id)))))
    (testing "fail-started-run! records the failure message"
      (let [{run-id :id} (dag-run/start-dag-run! tid :upstream nil)]
        (try
          (dag-run/fail-started-run! run-id {:message "boom"})
          (let [row (t2/select-one :model/TransformDagRun :id run-id)]
            (is (= :failed (:status row)))
            (is (= "boom" (:message row))))
          (finally
            (t2/delete! :model/TransformDagRun :id run-id)))))))

(deftest dag-run-member-runs-test
  ;; two distinct member transforms: transform_run enforces one active run per transform
  (mt/with-temp [:model/Transform {seed :id} {:name "seed"}
                 :model/Transform {tid-a :id} {:name "member-a"}
                 :model/Transform {tid-b :id} {:name "member-b"}]
    (let [{run-id :id} (dag-run/start-dag-run! seed :upstream nil)]
      (try
        (let [{active-run :id} (transform-run/start-run! tid-a {:dag_run_id run-id :run_method :manual})
              {done-run :id}   (transform-run/start-run! tid-b {:dag_run_id run-id :run_method :manual})]
          (transform-run/succeed-started-run! done-run)
          (testing "transform-runs-for-dag-run returns all member runs"
            (is (= #{active-run done-run}
                   (set (map :id (dag-run/transform-runs-for-dag-run run-id))))))
          (testing "cancel! cancels the run and requests cancelation of only the still-active members"
            (is (true? (coordinated-run/cancel! :model/TransformDagRun :dag_run_id run-id)))
            (is (= :canceled (:status (t2/select-one :model/TransformDagRun :id run-id))))
            (is (t2/exists? :model/TransformRunCancelation :run_id active-run))
            (is (not (t2/exists? :model/TransformRunCancelation :run_id done-run)))
            (is (false? (coordinated-run/cancel! :model/TransformDagRun :dag_run_id run-id))
                "canceling an already-terminal run is a no-op")))
        (finally
          (t2/delete! :model/TransformRun :dag_run_id run-id)
          (t2/delete! :model/TransformDagRun :id run-id))))))
