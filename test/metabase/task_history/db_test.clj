(ns metabase.task-history.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.task-history.db :as task-history.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest run-writes-and-reads-over-partitions-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/TaskRun {r1 :id} {:run_type :sync, :entity_type :database, :entity_id db-id, :status :started}
                 :model/TaskRun {r2 :id} {:run_type :sync, :entity_type :database, :entity_id db-id, :status :started}
                 :model/TaskRun {r3 :id} {:run_type :sync, :entity_type :database, :entity_id db-id, :status :started}
                 :model/TaskHistory _ {:run_id r1, :status :started}
                 :model/TaskHistory _ {:run_id r2, :status :started}
                 :model/TaskHistory _ {:run_id r3, :status :started}
                 :model/TaskHistory _ {:run_id r3, :status :success}]
    (let [run-ids [r1 r2 r3]
          counts  (fn [] (set (map (juxt :run_id :task_count) (task-history.db/task-counts-for-runs run-ids))))]
      (is (= #{[r1 1] [r2 1] [r3 2]} (counts)))
      (is (= (counts) (mt/with-partition-size 2 (counts))))
      (is (= 3 (mt/with-partition-size 2 (task-history.db/mark-started-tasks-unknown! (set run-ids)))))
      (is (= [3] (mt/with-partition-size 2 (task-history.db/set-started-task-runs-terminal! run-ids {:status "abandoned"}))))
      (is (= #{:abandoned} (t2/select-fn-set :status :model/TaskRun :id [:in run-ids]))))))
