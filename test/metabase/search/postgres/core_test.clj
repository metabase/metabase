(ns metabase.search.postgres.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.index-test :refer [legacy-results is-postgres?]]
   [metabase.test :as mt]))

(deftest ^:synchronized hybrid-test
  (when (is-postgres?)
    (mt/dataset test-data
      (search.postgres/init! true)
      (testing "consistent results between all searches for certain queries\n"
        (doseq [term ["satisfaction" "e-commerce" "example" "rasta" "new" "revenue"]]
          (testing (str "consistent results, but not ordering" term)
            (is (= (legacy-results term)
                   (search.postgres/hybrid term))))))
      (testing "But sometimes the order is inconsistent"
        (let [hybrid (search.postgres/hybrid "collection")
              legacy (legacy-results "collection")]
          (is (= (set hybrid) (set legacy)))
          (is (not= hybrid legacy)))))))

(deftest ^:synchronized hybrid-multi-test
  (when (is-postgres?)
    (mt/dataset test-data
      (search.postgres/init! true)
      (testing "consistent results between "
        (doseq [term ["satisfaction" "e-commerce" "example" "rasta" "new" "revenue"]]
          (testing term
            (is (= (search.postgres/hybrid term)
                   (search.postgres/hybrid-multi term)))))
        (testing "But sometimes the order is inconsistent"
          (let [basic (search.postgres/hybrid "collection")
                multi (search.postgres/hybrid-multi "collection")]
            (is (= (set basic) (set multi)))
            (is (not= basic multi))))))))
