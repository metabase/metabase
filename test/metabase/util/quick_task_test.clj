(ns metabase.util.quick-task-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.app-db.core :as mdb]
   [metabase.util.quick-task :as quick-task]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- transaction-seen
  "What a task sees of the transaction of the thread that submitted it."
  []
  {:connection?     (some? t2.conn/*current-connectable*)
   :in-transaction? (mdb/in-transaction?)})

(deftest task-submitted-in-transaction-runs-after-commit-test
  (let [seen (promise)]
    (t2/with-transaction [_conn]
      (is (nil? (quick-task/submit-task! #(deliver seen (transaction-seen)))))
      (is (= ::not-yet (deref seen 1000 ::not-yet)) "the task is not submitted before the commit"))
    (is (= {:connection? false :in-transaction? false} (deref seen 60000 ::timeout)))))

(deftest task-submitted-in-rolled-back-transaction-never-runs-test
  (let [ran (promise)]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (quick-task/submit-task! #(deliver ran true)))
    @(quick-task/submit-task! (fn [] nil))
    (is (not (realized? ran)))))

(deftest task-submitted-outside-transaction-runs-at-once-test
  (let [fut (quick-task/submit-task! (fn [] :done))]
    (is (some? fut))
    @fut
    (is (.isDone ^java.util.concurrent.Future fut))))
