(ns metabase.query-processor.reducible-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.reducible :as qp.reducible]
            [metabase.test :as mt]))

(deftest quit-test
  (testing "async-qp should properly handle `quit` exceptions"
    (let [out-chan ((qp.reducible/async-qp (fn [query xformf context]
                                             (throw (qp.reducible/quit ::bye)))) {})]
      (is (= ::bye
             (metabase.test/wait-for-result out-chan))))))
