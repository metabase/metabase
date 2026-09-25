(ns metabase.usage-metadata.frequent-itemsets-test
  (:require
   [clojure.test :refer :all]
   [metabase.usage-metadata.frequent-itemsets :as frequent-itemsets]))

(deftest ^:parallel rows->baskets-counts-distinct-atoms-test
  (is (= [{:atoms #{:a :b}, :count 3}]
         (frequent-itemsets/rows->baskets
          [{:atom_fingerprints [:a :a], :total_count 2}
           {:atom_fingerprints [:a :a :b], :total_count 3}]))))

(deftest ^:parallel weighted-support-test
  (let [baskets [{:atoms #{:a :b :c} :count 3}
                 {:atoms #{:a :b} :count 2}
                 {:atoms #{:a :c} :count 1}
                 {:atoms #{:b} :count 4}]]
    (testing "closed itemsets use weighted support from baskets containing every atom"
      (is (= {[:a :b]    5
              [:a :c]    4
              [:a :b :c] 3}
             (frequent-itemsets/mine-closed-itemsets baskets))))
    (testing "any-atom support counts each matching basket once at its weight"
      (are [expected itemset] (= expected (frequent-itemsets/any-atom-support baskets itemset))
        10 #{:a :b}
        6  #{:a}))))

(deftest ^:parallel mine-closed-itemsets-worked-example-test
  (testing "two baskets sharing only a pair yield that pair as the closed itemset"
    (is (= {[:a1 :a2] 2}
           (frequent-itemsets/mine-closed-itemsets
            [{:atoms #{:a1 :a2 :a3} :count 1}
             {:atoms #{:a1 :a2 :a4} :count 1}])))))

(deftest ^:parallel mine-closed-itemsets-drops-equal-support-subsets-test
  (testing "a subset with the same support as a larger itemset is not closed"
    (is (= {[:a :b :c] 2}
           (frequent-itemsets/mine-closed-itemsets
            [{:atoms #{:a :b :c} :count 2}]))))
  (testing "a subset with greater support remains closed"
    (is (= {[:a :b]    5
            [:a :b :c] 2}
           (frequent-itemsets/mine-closed-itemsets
            [{:atoms #{:a :b :c} :count 2}
             {:atoms #{:a :b} :count 3}])))))

(deftest ^:parallel mine-closed-itemsets-respects-size-bounds-test
  (testing "singletons are excluded"
    (let [mined (frequent-itemsets/mine-closed-itemsets [{:atoms #{:a :b} :count 5}])]
      (is (every? #(>= (count %) frequent-itemsets/minimum-itemset-size) (keys mined)))
      (is (not (contains? mined [:a])))
      (is (not (contains? mined [:b])))))
  (testing "itemsets larger than five atoms are not generated"
    (let [mined (frequent-itemsets/mine-closed-itemsets
                 [{:atoms #{:a :b :c :d :e :f}, :count 2}])]
      (is (= 6 (count mined)))
      (is (every? #(= 5 (count %)) (keys mined))))))

(deftest ^:parallel relative-support-ok?-test
  (testing "ratio above the relative support floor"
    (is (frequent-itemsets/relative-support-ok?
         [{:atoms #{:a :b} :count 4}
          {:atoms #{:a :c} :count 1}]
         [:a :b]
         4)))
  (testing "ratio below the relative support floor"
    (is (not (frequent-itemsets/relative-support-ok?
              [{:atoms #{:a :b} :count 1}
               {:atoms #{:a :c} :count 4}
               {:atoms #{:b :c} :count 5}]
              [:a :b]
              1))))
  (testing "zero denominator"
    (is (frequent-itemsets/relative-support-ok? [] [:z] 0))))
