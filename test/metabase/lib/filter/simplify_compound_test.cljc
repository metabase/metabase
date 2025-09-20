(ns metabase.lib.filter.simplify-compound-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.filter.simplify-compound :as lib.filter.simplify-compound]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- simplify-compound-filter [x]
  (lib.filter.simplify-compound/simplify-compound-filter x))

(defn- opts [& {:as kvs}]
  (merge {:lib/uuid (str (random-uuid))} kvs))

(deftest ^:parallel simplify-compound-filter-test
  (testing "can `simplify-compound-filter` fix `and` or `or` with only one arg?"
    (is (=? [:= {} [:field {} 1] 2]
            (simplify-compound-filter [:and (opts) [:= (opts) [:field (opts) 1] 2]])))))

(deftest ^:parallel simplify-compound-filter-test-2
  (testing "can `simplify-compound-filter` unnest nested `and`s or `or`s?"
    (is (=? [:and {}
             [:= {} [:field {} 1] 2]
             [:= {} [:field {} 3] 4]
             [:= {} [:field {} 5] 6]]
            (simplify-compound-filter
             [:and (opts)
              [:= (opts) [:field (opts) 1] 2]
              [:and (opts)
               [:= (opts) [:field (opts) 3] 4]
               [:and (opts)
                [:= (opts) [:field (opts) 5] 6]]]])))))

(deftest ^:parallel simplify-compound-filter-test-3
  (testing "can `simplify-compound-filter` remove duplicates?"
    (is (=? [:and {}
             [:= {}
              [:field {} 1]
              2]
             [:= {}
              [:field {} 3]
              4]]
            (simplify-compound-filter
             [:and (opts)
              [:= (opts)
               [:field (opts) 1]
               2]
              [:= (opts)
               [:field (opts) 3]
               4]
              [:= (opts)
               [:field (opts) 1]
               2]])))))

(deftest ^:parallel simplify-compound-filter-test-4
  (testing "can `simplify-compound-filter` eliminate `not` inside a `not`?"
    (is (=? [:= {} [:field {} 1] 2]
            (simplify-compound-filter [:not (opts) [:not (opts) [:= (opts) [:field (opts) 1] 2]]])))))

(deftest ^:parallel simplify-compound-filter-test-5a
  (testing "removing empty/nil filter clauses"
    (testing "does `simplify-compound-filter` return `nil` for empty filter clauses?"
      (is (=? nil
              (simplify-compound-filter nil))))))

(deftest ^:parallel simplify-compound-filter-test-5b
  (testing "removing empty/nil filter clauses"
    (are [x] (nil? (simplify-compound-filter x))
      [:and (opts) nil nil]
      [:and (opts) nil [:and (opts) nil nil nil] nil])))

(deftest ^:parallel simplify-compound-filter-test-5c
  (testing "removing empty/nil filter clauses"
    (is (=? [:= {} [:field {} 1] 2]
            (simplify-compound-filter [:and (opts) nil [:and (opts) nil [:= (opts) [:field (opts) 1] 2] nil] nil])))))

(deftest ^:parallel simplify-compound-filter-test-5d
  (testing "removing empty/nil filter clauses"
    (is (=? [:and {}
             [:= {} [:field {} 1] 2]
             [:= {} [:field {} 3] 4]
             [:= {} [:field {} 5] 6]
             [:= {} [:field {} 7] 8]
             [:= {} [:field {} 9] 10]]
            (simplify-compound-filter
             [:and (opts)
              nil
              [:= (opts) [:field (opts) 1] 2]
              [:and (opts)
               [:= (opts) [:field (opts) 3] 4]]
              nil
              [:and (opts)
               [:and (opts)
                [:and (opts)
                 [:= (opts) [:field (opts) 5] 6]
                 nil
                 nil]
                [:= (opts) [:field (opts) 7] 8]
                [:= (opts) [:field (opts) 9] 10]]]])))))

(deftest ^:parallel simplify-compound-filter-test-6
  (testing "`simplify-compound-filter` should also work with more complex structures"
    (is (=? {:aggregation [[:share {}
                            [:and {}
                             [:= {} [:field {} 1] 2]
                             [:= {} [:field {} 3] 4]
                             [:= {} [:field {} 5] 6]
                             [:= {} [:field {} 7] 8]
                             [:= {} [:field {} 9] 10]]]]}
            (simplify-compound-filter
             {:aggregation [[:share (opts)
                             [:and (opts)
                              nil
                              [:= (opts) [:field (opts) 1] 2]
                              [:and (opts)
                               [:= (opts) [:field (opts) 3] 4]]
                              nil
                              [:and (opts)
                               [:and (opts)
                                [:and (opts)
                                 [:= (opts) [:field (opts) 5] 6]
                                 nil
                                 nil]
                                [:= (opts) [:field (opts) 7] 8]
                                [:= (opts) [:field (opts) 9] 10]]]]]]})))))

(deftest ^:parallel simplify-compound-filter-test-7a
  (testing "Check that `simplify-compound-filter` can apply de Morgan's law on `:not`"
    (testing ":and clauses"
      (is (=? [:or {}
               [:not {} [:= {} [:field {} 1] 2]]
               [:not {} [:= {} [:field {} 2] 3]]]
              (simplify-compound-filter
               [:not (opts)
                [:and (opts)
                 [:= (opts) [:field (opts) 1] 2]
                 [:= (opts) [:field (opts) 2] 3]]]))))))

(deftest ^:parallel simplify-compound-filter-test-7b
  (testing "Check that `simplify-compound-filter` can apply de Morgan's law on `:not`"
    (testing ":or clauses"
      (testing "Check that `simplify-compound-filter` can apply de Morgan's law on `:not` over `:or`"
        (is (=? [:and {}
                 [:not {} [:= {} [:field {} 1] 2]]
                 [:not {} [:= {} [:field {} 2] 3]]]
                (simplify-compound-filter
                 [:not (opts)
                  [:or (opts)
                   [:= (opts) [:field (opts) 1] 2]
                   [:= (opts) [:field (opts) 2] 3]]])))))))

(deftest ^:parallel simplify-compound-filter-test-8a
  (testing "check that `simplify-compound-filter` doesn't remove `nil` from filters where it's being used as the value"
    (is (=? [:= {}
             [:field {} 1]
             nil]
            (simplify-compound-filter [:= (opts) [:field (opts) 1] nil])))))

(deftest ^:parallel simplify-compound-filter-test-8b
  (testing "check that `simplify-compound-filter` doesn't remove `nil` from filters where it's being used as the value"
    (is (=? [:= {}
             [:field {} 1]
             nil]
            (simplify-compound-filter [:and (opts) nil [:= (opts) [:field (opts) 1] nil]])))))
