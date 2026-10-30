(ns metabase.change-log.task.cleanup-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.change-log.task.cleanup :as cleanup]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest cleanup-test
  (testing "the task deletes the entries older than change-log-retention-days"
    (mt/with-temporary-setting-values [change-log-retention-days 30]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [row  (fn [days] (t2/insert-returning-pk! :change_log {:table_name "test_table", :row_id days
                                                                    :action     "update"
                                                                    :created_at (t/minus (t/offset-date-time)
                                                                                         (t/days days))}))
              old  (row 31)
              kept (row 29)]
          (#'cleanup/delete-old!)
          (is (= [kept] (t2/select-fn-vec :id :change_log :id [:in [old kept]]))))))))
