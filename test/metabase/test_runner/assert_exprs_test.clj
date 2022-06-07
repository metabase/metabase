(ns metabase.test-runner.assert-exprs-test
  (:require [clojure.test :refer :all]
            [metabase.test-runner.assert-exprs :as test-runner.assert-exprs]))

(deftest partial=-test
  (testing "Partial map"
    (is (partial= {:a 1}
                  {:a 1, :b 2}))
    (testing "actual missing a key"
      (is (= {:only-in-actual   nil
              :only-in-expected {:b 2}
              :pass?            false}
             (#'test-runner.assert-exprs/partial=-diff {:a 1, :b 2} {:a 1}))))
    (testing "actual has wrong value for a key"
      (is (= {:only-in-actual   {:a 2}
              :only-in-expected {:a 1}
              :pass?            false}
             (#'test-runner.assert-exprs/partial=-diff {:a 1, :b 2} {:a 2, :b 2})))))

  (testing "Partial sequence match"
    (is (partial= [1 2 3]
                  [1 2 3 4 5 6]))
    (is (partial= {:a [1 2 3]}
                  {:a [1 2 3 4 5 6]}))
    (testing "actual missing element"
      (is (= {:only-in-actual   nil
              :only-in-expected {:a [nil nil 3]}
              :pass?            false}
             (#'test-runner.assert-exprs/partial=-diff {:a [1 2 3]} {:a [1 2]})))
      (is (= {:only-in-actual   nil
              :only-in-expected [nil nil 3]
              :pass?            false}
             (#'test-runner.assert-exprs/partial=-diff [1 2 3] [1 2])))
      (is (= []
             (#'test-runner.assert-exprs/remove-keys-not-in-expected ["A"] [])))
      (is (= {:only-in-actual   nil
              :only-in-expected ["A"]
              :pass?            false}
             (#'test-runner.assert-exprs/partial=-diff ["A"] []))))
    (testing "actual has wrong element"
      (is (= {:only-in-actual   {:a [nil nil 4]}
              :only-in-expected {:a [nil nil 3]}
              :pass?            false}
             (#'test-runner.assert-exprs/partial=-diff {:a [1 2 3]} {:a [1 2 4]})))
      (is (= {:only-in-actual   [nil nil 4]
              :only-in-expected [nil nil 3]
              :pass?            false}
             (#'test-runner.assert-exprs/partial=-diff [1 2 3] [1 2 4])))))

  (testing "Empty sequence match"
    (is (= {:a 1, :b []}
           (#'test-runner.assert-exprs/remove-keys-not-in-expected
            {:a 1, :b []}
            {:a 1, :b [], :c [1]})))
    (is (partial= {:a 1, :b []}
                  {:a 1, :b []}))))
