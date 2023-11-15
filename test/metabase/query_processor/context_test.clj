(ns metabase.query-processor.context-test
  "There are additional related tests in [[metabase.query-processor.middleware.process-userland-query-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.context :as qp.context]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel exceptions-test
  (testing "Test a query that throws an Exception."
    (is (thrown?
         Throwable
         (qp/process-query
          {:database (mt/id)
           :type     :native
           :native   {:query "SELECT asdasdasd;"}})))))

(deftest ^:parallel exceptions-test-2
  (testing "Test when an Exception is thrown in the reducing fn."
    (is (thrown-with-msg?
         Throwable
         #"Cannot open file"
         (qp/process-query
          {:database (mt/id)
           :type     :query
           :query    {:source-table (mt/id :venues), :limit 20}}
          (qp.context/sync-context
           {:reducef (fn [& _]
                       (throw (Exception. "Cannot open file")))}))))))
