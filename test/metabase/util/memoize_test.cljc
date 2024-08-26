(ns metabase.util.memoize-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.generators :as gen]
   [metabase.util.memoize :as memo]))

(defn- call-count-harness [memoizer inner-fn]
  (let [misses        (atom 0)
        calls         (atom 0)
        wrapped-inner (fn [x]
                        (swap! misses inc)
                        (inner-fn x))
        memoized      (memoizer wrapped-inner)
        wrapped-memo  (fn [x]
                        (swap! calls inc)
                        (memoized x))]
    {:misses misses
     :calls  calls
     :f      wrapped-memo
     :reset  (fn []
               (reset! misses 0)
               (reset! calls  0))}))

(defn- round-robin [times keyspace f exp-fn]
  (let [exp-map (into {} (map (juxt identity exp-fn)) keyspace)]
    (dotimes [_ times]
      (doseq [k keyspace]
        (is (= (get exp-map k ::not-found)
               (f k)))))))

(defn- gen-keyspace [n]
  (-> (gen/set (gen/such-that seq gen/string) {:num-elements n})
      (gen/sample 1)
      first
      vec))

(defn- never-evicts [memoizer]
  (let [keyspace                 (gen-keyspace 100)
        {:keys [f calls misses]} (call-count-harness memoizer str/reverse)]
    ;; Now we deliberately call f for each entry in keyspace, ten times around.
    (round-robin 10 keyspace f str/reverse)
    (is (= 100 @misses)
        "should be as many misses as unique inputs")
    (is (= 1000 @calls)
        "and 10 calls for each unique input")))

(deftest ^:parallel memoize-never-evicts-test
  (never-evicts memo/memo))

(deftest ^:parallel fast-memoize-never-evicts-test
  (never-evicts memo/fast-memo))

(deftest ^:parallel bounded-never-evicts-if-large-enough-test
  (never-evicts #(memo/bounded % :bounded/threshold 100)))

(deftest ^:parallel fast-bounded-never-evicts-if-large-enough-test
  (never-evicts #(memo/fast-bounded % :bounded/threshold 101)))

(deftest ^:parallel bounded-evicts-when-keyspace-overflows-test
  (let [keyspace                       (gen-keyspace 100)
        {:keys [f calls misses reset]} (call-count-harness #(memo/bounded % :bounded/threshold 50) str/reverse)]
    ;; 10 round-robin calls will expect to evict twice per lap, and never hit!
    (testing "10 round-robin calls will never hit"
      (round-robin 10 keyspace f str/reverse)
      (is (= 1000 @misses))
      (is (= 1000 @calls)))
    (testing "10000 randomly sampled calls will hit sometimes"
      ;; This hits 25-30% of the time, empirically.
      (reset)
      (doseq [k (gen/sample (gen/elements keyspace) 10000)]
        (is (= (str/reverse k)
               (f k))))
      (is (= @calls  10000))
      (is (< @misses 10000)))))
