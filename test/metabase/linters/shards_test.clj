(ns metabase.linters.shards-test
  (:require
   [clojure.test :refer :all]
   [metabase.linters.shards :as shards]))

(defn- all-shards [ns->weight n]
  (mapv #(shards/shard ns->weight % n) (range n)))

(deftest ^:parallel every-namespace-in-exactly-one-shard-test
  (let [ns->weight (into {} (for [i (range 50)] [(symbol (str "ns-" i)) (inc (mod (* 37 i) 23))]))]
    (doseq [n [1 2 3 4 7]]
      (testing (str n " shards")
        (let [members (apply concat (all-shards ns->weight n))]
          (is (= (count ns->weight) (count members)))
          (is (= (set (keys ns->weight)) (set members))))))))

(deftest ^:parallel balanced-by-weight-test
  (testing "heaviest first, each to the lightest shard so far"
    (is (= [['a] ['b 'd 'e] ['c 'f 'g]]
           (all-shards '{a 10, b 6, c 5, d 3, e 2, f 1, g 4} 3)))))

(deftest ^:parallel ties-broken-by-name-test
  (testing "equal weights split the same way whatever the map's order"
    (is (= (all-shards '{a 1, b 1, c 1, d 1} 2)
           (all-shards (into (sorted-map-by #(compare %2 %1)) '{a 1, b 1, c 1, d 1}) 2)
           [['a 'c] ['b 'd]]))))

(deftest ^:parallel namespace-weights-test
  (testing "weighs each namespace by its file's line count"
    (is (=? {'metabase.linters.shards-test pos-int?}
            (shards/namespace-weights ["test/metabase/linters"])))))
