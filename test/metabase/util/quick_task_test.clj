(ns metabase.util.quick-task-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

(deftest run-with-timeout-returns-result-test
  (is (= :done (quick-task/run-with-timeout! (constantly :done)))))

(deftest run-with-timeout-swallows-exception-test
  (is (nil? (quick-task/run-with-timeout! #(throw (ex-info "broken" {}))))))

(deftest run-with-timeout-cancels-slow-task-test
  (let [started     (promise)
        interrupted (promise)]
    (is (nil? (quick-task/run-with-timeout! #(try
                                               (deliver started true)
                                               (Thread/sleep 60000)
                                               (catch InterruptedException _
                                                 (deliver interrupted true)))
                                            2000)))
    (is (true? (deref started 0 :not-started)))
    (is (true? (deref interrupted 5000 :not-interrupted)))))
