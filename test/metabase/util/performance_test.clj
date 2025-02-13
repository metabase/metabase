(ns metabase.util.performance-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

(deftest ^:parallel concat-test
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

(deftest ^:parallel transpose-test
  (is (= [[1 2 3 4] [1 2 3 4] [1 2 3 4] [1 2 3 4] [1 2 3 4]]
         (perf/transpose [[1 1 1 1 1] [2 2 2 2 2] [3 3 3 3 3] [4 4 4 4 4]])
         (apply mapv vector [[1 1 1 1 1] [2 2 2 2 2] [3 3 3 3 3] [4 4 4 4 4]])))
  (is (= [[1 2 3 4 5] [1 2 3 4 5] [1 2 3 4 5] [1 2 3 4 5] [1 2 3 4 5]]
         (perf/transpose [[1 1 1 1 1] [2 2 2 2 2] [3 3 3 3 3] [4 4 4 4 4] [5 5 5 5 5]])
         (apply mapv vector [[1 1 1 1 1] [2 2 2 2 2] [3 3 3 3 3] [4 4 4 4 4] [5 5 5 5 5]]))))

(deftest ^:parallel test-postwalk
  (are [before after] (= after (perf/postwalk #(cond-> %
                                                 (number? %) inc)
                                              before))

    (list 1 2 3 :a "b" nil 4 5 6)
    (list 2 3 4 :a "b" nil 5 6 7)

    [1 2 3 :a "b" nil 4 5 6]
    [2 3 4 :a "b" nil 5 6 7]

    #{1 2 3 :a "b" nil 4 5 6}
    #{2 3 4 :a "b" nil 5 6 7}

    ;; new keys overriding past keys
    {1 "1" 2 "2" 3 "3"}
    {2 "1" 3 "2" 4 "3"}

    {3 "3" 2 "2" 1 "1"}
    {2 "1" 3 "2" 4 "3"}

    {1 2 3 :a "b" 4 nil nil}
    {2 3 4 :a "b" 5 nil nil}

    {:a {:b {:c {:d [1 2 {:e 3}]}}}}
    {:a {:b {:c {:d [2 3 {:e 4}]}}}}))

(defrecord Foo [a b c])

(deftest test-walk
  (let [colls ['(1 2 3)
               [1 2 3]
               #{1 2 3}
               (sorted-set-by > 1 2 3)
               {:a 1, :b 2, :c 3}
               (sorted-map-by > 1 10, 2 20, 3 30)
               (->Foo 1 2 3)
               (map->Foo {:a 1 :b 2 :c 3 :extra 4})]]
    (doseq [c colls]
      (let [walked (perf/walk identity identity c)]
        (is (= c walked))
        (if (map? c)
          (is (= (perf/walk #(cond-> % (number? %) inc) #(reduce + (vals %)) c)
                 (reduce + (map (comp inc val) c))))
          (is (= (perf/walk inc #(reduce + %) c)
                 (reduce + (map inc c)))))
        (when (instance? clojure.lang.Sorted c)
          (is (= (.comparator ^clojure.lang.Sorted c)
                 (.comparator ^clojure.lang.Sorted walked))))))))
