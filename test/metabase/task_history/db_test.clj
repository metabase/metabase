(ns metabase.task-history.db-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.task-history.db :as task-history.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

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

(defn- compiled-task-history-sql
  "The SQL of each TaskHistory query compiled while `thunk` runs."
  [thunk]
  (let [sqls (atom [])]
    (methodical/add-aux-method-with-unique-key!
     #'t2.pipeline/compile :after :default
     (fn [_query-type model compiled]
       (when (= model :model/TaskHistory)
         (swap! sqls conj (first compiled)))
       compiled)
     ::capture-sql)
    (try
      (thunk)
      (finally
        (methodical/remove-aux-method-with-unique-key! #'t2.pipeline/compile :after :default ::capture-sql)))
    @sqls))

(deftest nth-newest-task-history-ended-at-test
  ;; ended in the future, so these are the newest rows whatever else the app DB holds
  (let [newest (t/truncate-to (t/plus (t/offset-date-time) (t/days 1)) :millis)
        ended  (fn [seconds-earlier] (t/minus newest (t/seconds seconds-earlier)))]
    (mt/with-temp [:model/TaskHistory _ {:task "a", :started_at (ended 3), :ended_at (ended 2)}
                   :model/TaskHistory _ {:task "b", :started_at (ended 2), :ended_at (ended 1)}
                   :model/TaskHistory _ {:task "c", :started_at (ended 1), :ended_at (ended 0)}]
      (testing "returns the ended_at `offset` rows back from the most recently ended"
        (is (= [(ended 0) (ended 1) (ended 2)]
               (map #(t/offset-date-time (task-history.db/nth-newest-task-history-ended-at %) "Z")
                    [0 1 2]))))
      (testing "selects only ended_at, not every column of each skipped row (#88458)"
        (let [sqls (compiled-task-history-sql #(task-history.db/nth-newest-task-history-ended-at 1))]
          (is (seq sqls))
          (doseq [sql sqls]
            (is (re-find #"(?i)^SELECT\s+\S*ended_at\S*\s+FROM\s" sql)
                sql)))))))
