(ns metabase.change-log.task.cleanup-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.change-log.task.cleanup :as cleanup]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest cleanup-test
  (testing "the task deletes the entries older than 30 days, in as many batches as it takes"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [row  (fn [days] (t2/insert-returning-pk! :change_log {:table_name "test_table", :row_id days
                                                                  :action     "update"
                                                                  :created_at (t/minus (t/offset-date-time)
                                                                                       (t/days days))}))
            old  [(row 31) (row 31) (row 31)]
            kept (row 29)]
        (#'cleanup/delete-old! 2)
        (is (= [kept] (t2/select-fn-vec :id :change_log :id [:in (conj old kept)])))))))
