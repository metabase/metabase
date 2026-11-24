(ns metabase.transforms.dag-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.coordinated-run :as coordinated-run]
   [metabase.transforms.dag :as dag]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.dag-run :as dag-run]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.models.transform-run-cancelation :as transform-run-cancelation]
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

;; test-helpers-set-global-values!: these tests trigger an intentional duplicate-key violation,
;; which on Postgres would abort (poison) the transaction with-temp otherwise wraps the body in
(deftest start-dag-run-unique-active-run-test
  (testing "the (source_transform_id, is_active) unique constraint allows at most one active run per seed"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Transform {tid :id} {:name "seed"}]
        (let [{run-id :id} (dag-run/start-dag-run! tid :upstream nil 1)]
          (try
            (is (thrown? Exception (dag-run/start-dag-run! tid :downstream nil 1)))
            (testing "a terminal run doesn't collide, so a new run can start"
              (coordinated-run/succeed-started-run! :model/TransformDagRun run-id)
              (let [{run-id-2 :id} (dag-run/start-dag-run! tid :downstream nil 1)]
                (is (pos-int? run-id-2))))
            (finally
              (t2/delete! :model/TransformDagRun :source_transform_id tid))))))))

(deftest run-dag-start-race-test
  (testing "run-dag! treats losing the unique-active-run insert race as already-running"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Transform {tid :id} {:name "seed" :table_dependencies []}]
        (let [{run-id :id} (dag-run/start-dag-run! tid :upstream nil 1)
              start-promise (promise)]
          (try
            ;; bypass the fast pre-check to simulate two triggers racing past it together; the loser's
            ;; insert then hits the unique constraint and must be treated as "already running"
            (mt/with-dynamic-fn-redefs [dag-run/running-run-for-source-transform-id (constantly nil)]
              (is (nil? (dag/run-dag! tid {:direction :upstream :start-promise start-promise})))
              (is (nil? (deref start-promise 100 :timed-out))
                  "start-promise is delivered nil so a waiting caller doesn't hang"))
            (finally
              (t2/delete! :model/TransformDagRun :id run-id))))))))

;;; ------------------------------------------- Model lifecycle -------------------------------------------

(deftest dag-run-lifecycle-test
  (mt/with-temp [:model/Transform {tid :id} {:name "seed"}]
    (testing "start-dag-run! creates a started, active run for the seed transform"
      (let [{run-id :id :as run} (dag-run/start-dag-run! tid :upstream (mt/user->id :rasta) 3)]
        (try
          (is (= :started (:status run)))
          (is (true? (:is_active run)))
          (is (= tid (:source_transform_id run)))
          (testing "the seed transform's name/entity_id are snapshotted for post-deletion display"
            (is (= "seed" (:source_transform_name run)))
            (is (some? (:source_transform_entity_id run))))
          (is (= 3 (:transform_count run)))
          (is (= :upstream (:direction run)))
          (is (= (mt/user->id :rasta) (:user_id run)))
          (testing "running-run-for-source-transform-id finds the active run"
            (is (= run-id (:id (dag-run/running-run-for-source-transform-id tid)))))
          (testing "succeed-started-run! makes it terminal and inactive"
            (is (= 1 (coordinated-run/succeed-started-run! :model/TransformDagRun run-id)))
            (is (= :succeeded (:status (t2/select-one :model/TransformDagRun :id run-id))))
            (is (nil? (:is_active (t2/select-one :model/TransformDagRun :id run-id))))
            (is (nil? (dag-run/running-run-for-source-transform-id tid))))
          (finally
            (t2/delete! :model/TransformDagRun :id run-id)))))
    (testing "cancel-started-run! cancels an active run but is a no-op once terminal"
      (let [{run-id :id} (dag-run/start-dag-run! tid :downstream nil 1)]
        (try
          (is (= 1 (coordinated-run/cancel-started-run! :model/TransformDagRun run-id)))
          (is (= :canceled (:status (t2/select-one :model/TransformDagRun :id run-id))))
          (is (zero? (coordinated-run/cancel-started-run! :model/TransformDagRun run-id))
              "a finished run is never resurrected into a canceled state")
          (finally
            (t2/delete! :model/TransformDagRun :id run-id)))))
    (testing "fail-started-run! records the failure message"
      (let [{run-id :id} (dag-run/start-dag-run! tid :upstream nil 1)]
        (try
          (coordinated-run/fail-started-run! :model/TransformDagRun run-id {:message "boom"})
          (let [row (t2/select-one :model/TransformDagRun :id run-id)]
            (is (= :failed (:status row)))
            (is (= "boom" (:message row))))
          (finally
            (t2/delete! :model/TransformDagRun :id run-id)))))))

(deftest dag-run-survives-transform-deletion-test
  (testing "deleting the seed transform nulls source_transform_id but preserves the DAG run and its snapshot"
    (mt/with-temp [:model/Transform {tid :id} {:name "doomed seed"}]
      (let [{run-id :id} (dag-run/start-dag-run! tid :upstream nil 1)]
        (try
          (coordinated-run/succeed-started-run! :model/TransformDagRun run-id)
          (t2/delete! :model/Transform :id tid)
          (let [run (t2/select-one :model/TransformDagRun :id run-id)]
            (is (some? run) "the run row survives (FK is SET NULL, not CASCADE)")
            (is (nil? (:source_transform_id run)))
            (is (= "doomed seed" (:source_transform_name run))))
          (finally
            (t2/delete! :model/TransformDagRun :id run-id)))))))

(deftest dag-run-member-runs-test
  ;; two distinct member transforms: transform_run enforces one active run per transform
  (mt/with-temp [:model/Transform {seed :id} {:name "seed"}
                 :model/Transform {tid-a :id} {:name "member-a"}
                 :model/Transform {tid-b :id} {:name "member-b"}]
    (let [{run-id :id} (dag-run/start-dag-run! seed :upstream nil 2)]
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

(defn- cancel-statement-count!
  "Cancel a DAG run that has `n` active member runs, and return the number of statements that took and the member run
  ids."
  [n]
  (mt/with-temp [:model/Transform {seed :id} {:name "seed"}]
    (let [transform-ids (t2/insert-returning-pks! :model/Transform
                                                  (for [i (range n)]
                                                    (assoc (mt/with-temp-defaults :model/Transform)
                                                           :name (str "member " i " of " n))))
          {run-id :id}  (dag-run/start-dag-run! seed :upstream nil n)]
      (try
        (let [member-ids (mapv #(:id (transform-run/start-run! % {:dag_run_id run-id :run_method :manual})) transform-ids)
              stmts      (events.tu/real-statement-count!
                          #(coordinated-run/cancel! :model/TransformDagRun :dag_run_id run-id))]
          {:count stmts :member-ids member-ids})
        (finally
          (t2/delete! :model/TransformRun :dag_run_id run-id)
          (t2/delete! :model/TransformDagRun :id run-id)
          (t2/delete! :model/Transform :id [:in transform-ids]))))))

(deftest cancel-statement-count-test
  (testing "cancel! runs as many statements for 10 active member runs as for 40, and requests cancelation of each"
    (cancel-statement-count! 2)
    (let [small (cancel-statement-count! 10)
          large (cancel-statement-count! 40)]
      (is (= (:count small) (:count large))))))

(deftest cancel-marks-each-active-member-test
  (testing "cancel! records a cancelation and the canceling status for every active member run"
    (mt/with-temp [:model/Transform {seed :id} {:name "seed"}
                   :model/Transform {tid-a :id} {:name "member-a"}
                   :model/Transform {tid-b :id} {:name "member-b"}]
      (let [{run-id :id} (dag-run/start-dag-run! seed :upstream nil 2)]
        (try
          (let [{run-a :id} (transform-run/start-run! tid-a {:dag_run_id run-id :run_method :manual})
                {run-b :id} (transform-run/start-run! tid-b {:dag_run_id run-id :run_method :manual})]
            (is (true? (coordinated-run/cancel! :model/TransformDagRun :dag_run_id run-id)))
            (is (= #{run-a run-b} (t2/select-fn-set :run_id :model/TransformRunCancelation :run_id [:in [run-a run-b]])))
            (is (= #{:canceling} (t2/select-fn-set :status :model/TransformRun :id [:in [run-a run-b]])))
            (testing "a second request adds no second cancelation row"
              (transform-run-cancelation/mark-cancel-started-runs! [run-a run-b])
              (is (= 2 (t2/count :model/TransformRunCancelation :run_id [:in [run-a run-b]])))))
          (finally
            (t2/delete! :model/TransformRun :dag_run_id run-id)
            (t2/delete! :model/TransformDagRun :id run-id)))))))

(defn- cancel-with-failing-writes!
  "Cancel a DAG run of three member runs, each with a cancel channel, calling `insert!` with the member run ids and the
  ids of each insert of cancelations before it, and return the member run ids, whether `cancel!` threw, the members
  whose channel got the signal and the members marked canceling."
  [insert!]
  (mt/with-temp [:model/Transform {seed :id} {:name "seed"}
                 :model/Transform {tid-a :id} {:name "member-a"}
                 :model/Transform {tid-b :id} {:name "member-b"}
                 :model/Transform {tid-c :id} {:name "member-c"}]
    (let [{run-id :id} (dag-run/start-dag-run! seed :upstream nil 3)]
      (try
        (let [run-ids  (mapv #(:id (transform-run/start-run! % {:dag_run_id run-id :run_method :manual}))
                             [tid-a tid-b tid-c])
              channels (into {} (map (fn [id] [id (a/promise-chan)])) run-ids)
              insert   (mt/original-fn #'transforms.db/insert-cancelations-for-active-runs!)]
          (doseq [[id chan] channels]
            (canceling/chan-start-run! id chan))
          (try
            (let [threw? (mt/with-dynamic-fn-redefs [transforms.db/insert-cancelations-for-active-runs!
                                                     (fn [ids] (insert! run-ids ids) (insert ids))]
                           (try
                             (coordinated-run/cancel! :model/TransformDagRun :dag_run_id run-id)
                             false
                             (catch Exception _ true)))]
              {:run-ids   run-ids
               :threw?    threw?
               :signalled (into #{} (keep (fn [[id chan]] (when (= :cancel! (a/poll! chan)) id))) channels)
               :canceling (t2/select-fn-set :id :model/TransformRun :id [:in run-ids] :status :canceling)})
            (finally
              (run! canceling/chan-end-run! run-ids))))
        (finally
          (t2/delete! :model/TransformRun :dag_run_id run-id)
          (t2/delete! :model/TransformDagRun :id run-id))))))

(deftest cancel-falls-back-to-each-member-test
  (testing "cancel! marks and signals each member on its own when marking them together throws"
    (let [{:keys [run-ids threw? signalled canceling]}
          (cancel-with-failing-writes! (fn [_run-ids ids] (when (next ids) (throw (ex-info "Write failed" {})))))]
      (is (false? threw?))
      (is (= (set run-ids) signalled canceling))))
  (testing "falling back, cancel! cancels and signals members before one whose own write fails, then throws"
    (let [{:keys [run-ids threw? signalled canceling]}
          (cancel-with-failing-writes! (fn [run-ids ids]
                                         (when (or (next ids) (= ids [(second run-ids)]))
                                           (throw (ex-info "Write failed" {})))))]
      (is (true? threw?))
      (is (= #{(first run-ids)} signalled canceling)))))
