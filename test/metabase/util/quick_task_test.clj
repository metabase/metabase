(ns metabase.util.quick-task-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

(deftest run-with-timeout-returns-result-test
  (is (= :done (quick-task/run-with-timeout! (constantly :done)))))

(deftest run-with-timeout-swallows-exception-test
  (is (nil? (quick-task/run-with-timeout! #(throw (ex-info "broken" {}))))))

(deftest run-with-timeout-cancels-slow-task-test
  (let [interrupted (promise)]
    (mt/with-dynamic-fn-redefs [quick-task/task-timeout-ms (constantly 100)]
      (is (nil? (quick-task/run-with-timeout! #(try
                                                 (Thread/sleep 60000)
                                                 (catch InterruptedException _
                                                   (deliver interrupted true)))))))
    (is (true? (deref interrupted 5000 :not-interrupted)))))
