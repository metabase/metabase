(ns ^:mb/once metabase.util.performance-test
  (:require [clojure.test :refer :all]
            [metabase.util.performance :as perf]))

(deftest concat-test
  (is (= [1 2 3 4 5] (perf/concat [1] [] [2] [3 4] nil '(5))))
  (is (= [] (perf/concat [] [])))
  (is (= [] (perf/concat [] [])))
  ;; Pseudo-generative testing.
  (dotimes [n 20]
    (let [inputs (repeatedly (+ n 2)
                             (fn []
                               (let [r (rand-int 3)]
                                 (when (> r 0)
                                   (cond-> (repeatedly (rand-int 10) #(rand-int 1000))
                                     (= r 2) vec)))))]
      (is (= (apply concat inputs) (apply perf/concat inputs))))))

(defn- mapv-via-run! [f coll]
  (let [v (volatile! [])]
    (perf/run! #(vswap! v conj (f %)) coll)
    @v))

(deftest run!-test
  (is (= [] (mapv-via-run! inc [])))
  (is (= [1 2 3 4 5] (mapv-via-run! inc (range 5)))))
