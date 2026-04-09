(ns metabase.transforms-inspector.degeneracy-test
  (:require
   [clojure.test :refer :all]
   [metabase.transforms-inspector.degeneracy :as degeneracy]))

(deftest degenerate-for-display-default-test
  (testing "non-degenerate when data present"
    (is (= {:degenerate? false}
           (degeneracy/degenerate-for-display? "card-1" :bar
                                               {"card-1" {"row_count" 10}}))))
  (testing "degenerate when no_data flag is true"
    (is (= {:degenerate? true :reason :no-data}
           (degeneracy/degenerate-for-display? "card-1" :bar
                                               {"card-1" {"no_data" true}}))))
  (testing "degenerate when row_count is zero"
    (is (= {:degenerate? true :reason :no-data}
           (degeneracy/degenerate-for-display? "card-1" :line
                                               {"card-1" {"row_count" 0}}))))
  (testing "not-degenerate when card not in results"
    (is (= {:degenerate? false}
           (degeneracy/degenerate-for-display? "card-1" :scalar {}))))
  (testing "non-degenerate for card with empty result map"
    (is (= {:degenerate? false}
           (degeneracy/degenerate-for-display? "card-1" :bar
                                               {"card-1" {}})))))

(deftest degenerate-for-display-hidden-test
  (testing ":hidden display type is always degenerate"
    (is (= {:degenerate? true}
           (degeneracy/degenerate-for-display? "card-1" :hidden
                                               {"card-1" {"row_count" 100}}))))
  (testing ":hidden is degenerate even with no results"
    (is (= {:degenerate? true}
           (degeneracy/degenerate-for-display? "card-1" :hidden {})))))
