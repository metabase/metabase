(ns metabase.util.performance-test
  (:require
   #?@(:clj [[clojure.test.check.clojure-test :refer [defspec]]
             [clojure.test.check.properties :as prop]
             [malli.generator :as mg]])
   [clojure.test :refer [are deftest is testing]]
   [metabase.util.performance :as perf]))

#?(:clj (set! *warn-on-reflection* true))

#?(:clj
   (deftest ^:parallel reduce-test
     (is (= 10 (perf/reduce + 0 [1 2 3 4])))
     (is (= 20 (perf/reduce + 0 [1 2 3 4] [1 2 3 4])))
     (is (= 30 (perf/reduce + 0 [1 2 3 4] [1 2 3 4] [1 2 3 4])))
     (is (= 40 (perf/reduce + 0 [1 2 3 4] [1 2 3 4] [1 2 3 4] [1 2 3 4])))
     (is (= "hello" (perf/reduce str "" "hello")))))

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

#?(:clj
   (deftest ^:parallel transpose-test
     (is (= [[1 2 3 4] [1 2 3 4] [1 2 3 4] [1 2 3 4] [1 2 3 4]]
            (perf/transpose [[1 1 1 1 1] [2 2 2 2 2] [3 3 3 3 3] [4 4 4 4 4]])
            (apply mapv vector [[1 1 1 1 1] [2 2 2 2 2] [3 3 3 3 3] [4 4 4 4 4]])))
     (is (= [[1 2 3 4 5] [1 2 3 4 5] [1 2 3 4 5] [1 2 3 4 5] [1 2 3 4 5]]
            (perf/transpose [[1 1 1 1 1] [2 2 2 2 2] [3 3 3 3 3] [4 4 4 4 4] [5 5 5 5 5]])
            (apply mapv vector [[1 1 1 1 1] [2 2 2 2 2] [3 3 3 3 3] [4 4 4 4 4] [5 5 5 5 5]])))))

#?(:clj
   (deftest list-comprehensions-test
     (are [i o] (= o i)
       (perf/for [x (range 3)
                  y (range 5)]
         [x y])
       #_=> [[0 0] [0 1] [0 2] [0 3] [0 4] [1 0] [1 1] [1 2] [1 3] [1 4] [2 0] [2 1] [2 2] [2 3] [2 4]]

       (perf/for [x (range 3) :when (odd? x)
                  y (range 5)] [x y])
       #_=> [[1 0] [1 1] [1 2] [1 3] [1 4]]

       (perf/for [x (range 3) :when (> x 5)
                  y (range 5)]
         [x y])
       #_=> []

       (perf/for [x (range 10) :when (odd? x)
                  y (range 20) :while (< y 7)
                  :let [z [x y]]]
         z)
       #_=> [[1 0] [1 1] [1 2] [1 3] [1 4] [1 5] [1 6] [3 0] [3 1] [3 2] [3 3] [3 4] [3 5] [3 6] [5 0] [5 1] [5 2] [5 3] [5 4] [5 5] [5 6] [7 0] [7 1] [7 2] [7 3] [7 4] [7 5] [7 6] [9 0] [9 1] [9 2] [9 3] [9 4] [9 5] [9 6]]

       (perf/for [x (range 5)
                  :let [x2 (* 2 x)] :when (> x2 4)
                  y (range 20) :while (< y 7)
                  :let [z [x2 y]]]
         z)
       #_=> [[6 0] [6 1] [6 2] [6 3] [6 4] [6 5] [6 6] [8 0] [8 1] [8 2] [8 3] [8 4] [8 5] [8 6]]

       (perf/for [x (range 7)
                  y (range 7) :while (< y x)]
         [x y])
       #_=> [[1 0] [2 0] [2 1] [3 0] [3 1] [3 2] [4 0] [4 1] [4 2] [4 3] [5 0] [5 1] [5 2] [5 3] [5 4] [6 0] [6 1] [6 2] [6 3] [6 4] [6 5]]

       (perf/for [x nil
                  y nil]
         [x y])
       #_=> [])

     (are [i o] (= o i)
       (with-out-str
         (perf/doseq [x (range 3)
                      y (range 5)]
           (println x y)))
       #_=> "0 0\n0 1\n0 2\n0 3\n0 4\n1 0\n1 1\n1 2\n1 3\n1 4\n2 0\n2 1\n2 2\n2 3\n2 4\n"
       (with-out-str
         (perf/doseq [x (range 5)
                      :let [x2 (* 2 x)] :when (> x2 4)
                      y (range 20) :while (< y 7)
                      :let [z [x2 y]]] (println z)))
       #_=> "[6 0]\n[6 1]\n[6 2]\n[6 3]\n[6 4]\n[6 5]\n[6 6]\n[8 0]\n[8 1]\n[8 2]\n[8 3]\n[8 4]\n[8 5]\n[8 6]\n"
       (with-out-str
         (perf/doseq [x nil
                      y nil]
           (println x y)))
       #_=> "")))

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
        #?(:clj (when (instance? clojure.lang.Sorted c)
                  (is (= (.comparator ^clojure.lang.Sorted c)
                         (.comparator ^clojure.lang.Sorted walked)))))))))

(deftest test-select-keys
  (are [keys result] (= result (perf/select-keys {:a 1 :b 2 :c 3 :d 4 :e 5} keys))
    [] {}
    [:a] {:a 1}
    [:a :b] {:a 1 :b 2}
    [:a :b :q] {:a 1 :b 2}
    [:a :b :c :d :e] {:a 1 :b 2 :c 3 :d 4 :e 5}
    [:a :b :c :d :e :f] {:a 1 :b 2 :c 3 :d 4 :e 5}))

(deftest test-update-keys
  (is (= {"a" 1 "b" 2 "c" 3} (perf/update-keys {:a 1 :b 2 :c 3} name)))
  (is (= {} (perf/update-keys nil keyword)))

  (testing "no changes"
    (let [original {:a 1 :b 2 :c 3}
          result (perf/update-keys original identity)]
      (is (identical? original result))))

  (testing "empty"
    (is (identical? {} (perf/update-keys {} str))))

  (testing "partial key transformation"
    (is (= {:keep-me 1 :changed 2}
           (perf/update-keys {:keep-me 1 :change-me 2} #(if (= % :change-me) :changed %)))))

  (testing "key collision - later keys should overwrite"
    (is (= {:same 20}
           (perf/update-keys {:a 10 :b 20} (constantly :same)))))

  (testing "f returns nil keys"
    (is (= {nil 2} (perf/update-keys {:a 1 :b 2} (constantly nil))))))

(deftest ^:parallel get-in-test
  (testing "basic nested access"
    (is (= 3 (perf/get-in {:a {:b 3}} [:a :b])))
    (is (= "value" (perf/get-in {:x {:y {:z "value"}}} [:x :y :z])))
    (is (= 42 (perf/get-in {:key 42} [:key])))
    (is (= {:a 1} (perf/get-in {:a 1} [])))
    (is (nil? (perf/get-in nil [:a :b]))))

  (testing "missing keys return nil"
    (is (nil? (perf/get-in {:a {:b 3}} [:a :c])))
    (is (nil? (perf/get-in {:a 1} [:x :y :z]))))

  (testing "with not-found value"
    (is (= :default (perf/get-in {:a {:b 3}} [:a :c] :default)))
    (is (nil? (perf/get-in {:a {:b 3}} [:a :c] nil)))
    (is (nil? (perf/get-in {:a {:b nil}} [:a :b] :something-else))))

  (testing "nil values vs missing keys"
    (is (nil? (perf/get-in {:a {:b nil}} [:a :b])))
    (is (= :default (perf/get-in {:a {:b nil}} [:a :c] :default))))

  (testing "works with vectors"
    (is (= 2 (perf/get-in [[1 2] [3 4]] [0 1])))
    (is (= 30 (perf/get-in {:items [10 20 30]} [:items 2]))))

  (testing "partial path exists"
    (is (nil? (perf/get-in {:a 1} [:a :b])))
    (is (= :fallback (perf/get-in {:a "not-a-map"} [:a :b] :fallback)))))

#?(:clj
   (defn- trap-seq
     "Returns a lazy seq of `safe-count` elements (0 to safe-count - 1) followed by elements that throw on realization.
      Used to verify that mapv doesn't over-realize lazy sequences."
     [safe-count]
     (concat (range safe-count)
             (for [_ (range 10)]
               (throw (ex-info "should not be realized" {:safe-count safe-count}))))))

(deftest ^:parallel mapv-does-not-realize-lazy-seqs-test
  (testing "Does not realize long or infinite sequences beyond what's needed (bug repro)"
    (is (= [1 2]
           (perf/mapv (comp first vector)
                      [1 2]
                      (concat (range 1000)
                              (for [_ (range 10)]
                                (throw (ex-info "you should not be here" {})))))))))

#?(:clj
   (defspec mapv-single-coll-equivalence 100
     (prop/for-all [coll (mg/generator [:sequential :int])]
                   (= (mapv str coll)
                      (perf/mapv str coll)))))

#?(:clj
   (defspec mapv-two-coll-equivalence 100
     (prop/for-all [c1 (mg/generator [:sequential :int])
                    c2 (mg/generator [:sequential :int])]
                   (= (mapv str c1 c2)
                      (perf/mapv str c1 c2)))))

#?(:clj
   (defspec mapv-three-coll-equivalence 100
     (prop/for-all [c1 (mg/generator [:sequential :int])
                    c2 (mg/generator [:sequential :int])
                    c3 (mg/generator [:sequential :int])]
                   (= (mapv str c1 c2 c3)
                      (perf/mapv str c1 c2 c3)))))

#?(:clj
   (defspec mapv-four-coll-equivalence 100
     (prop/for-all [c1 (mg/generator [:sequential :int])
                    c2 (mg/generator [:sequential :int])
                    c3 (mg/generator [:sequential :int])
                    c4 (mg/generator [:sequential :int])]
                   (= (mapv str c1 c2 c3 c4)
                      (perf/mapv str c1 c2 c3 c4)))))

#?(:clj
   (defspec smallest-count-does-not-over-realize-2-colls 100
     (prop/for-all [short-len (mg/generator [:int {:min 0 :max 33}])
                    extra-len (mg/generator [:int {:min 34 :max 100}])]
                   (let [short-coll (vec (range short-len))
                         trap-coll  (trap-seq (+ short-len extra-len))]
                     (= (#'perf/smallest-count short-coll trap-coll)
                        (min short-len extra-len))))))

#?(:clj
   (defspec mapv-does-not-over-realize-2-colls 1000
     (prop/for-all [short-len (mg/generator [:int {:min 0 :max 50}])
                    extra-len (mg/generator [:int {:min 34 :max 100}])]
                   (let [short-coll (vec (range short-len))
                         trap-coll  (trap-seq (+ short-len extra-len))]
                     (= (mapv vector short-coll trap-coll)
                        (perf/mapv vector short-coll trap-coll))))))

#?(:clj
   (defspec mapv-does-not-over-realize-3-colls 1000
     (prop/for-all [short-len (mg/generator [:int {:min 0 :max 33}])
                    extra-len (mg/generator [:int {:min 34 :max 100}])]
                   (let [short-coll (vec (range short-len))
                         trap-coll  (trap-seq (+ short-len extra-len))]
                     (= (mapv vector short-coll trap-coll trap-coll)
                        (perf/mapv vector short-coll trap-coll trap-coll))))))

#?(:clj
   (defspec mapv-does-not-over-realize-4-colls 1000
     (prop/for-all [short-len (mg/generator [:int {:min 0 :max 33}])
                    extra-len (mg/generator [:int {:min 34 :max 100}])]
                   (let [short-coll (vec (range short-len))
                         trap-coll  (trap-seq (+ short-len extra-len))]
                     (= (mapv vector short-coll trap-coll trap-coll trap-coll)
                        (perf/mapv vector short-coll trap-coll trap-coll trap-coll))))))

#?(:clj
   (defspec mapv-handles-infinite-seqs-2-colls 1000
     (prop/for-all [coll (mg/generator [:vector {:min 0 :max 50} :int])]
                   (= (mapv vector coll (range))
                      (perf/mapv vector coll (range))))))

#?(:clj
   (defspec mapv-handles-infinite-seqs-3-colls 1000
     (prop/for-all [coll (mg/generator [:vector {:min 0 :max 50} :int])]
                   (= (mapv vector coll (range) (iterate inc 0))
                      (perf/mapv vector coll (range) (iterate inc 0))))))

#?(:clj
   (defspec mapv-handles-infinite-seqs-4-colls 1000
     (prop/for-all [coll (mg/generator [:vector {:min 0 :max 50} :int])]
                   (= (mapv vector coll (range) (iterate inc 0) (repeat 1))
                      (perf/mapv vector coll (range) (iterate inc 0) (repeat 1))))))

#?(:clj
   (defspec mapv-boundary-32-equivalence 1000
     (prop/for-all [n (mg/generator [:int {:min 28 :max 36}])]
                   (let [c1 (vec (range n))
                         c2 (vec (range n))]
                     (= (mapv + c1 c2)
                        (perf/mapv + c1 c2))))))
