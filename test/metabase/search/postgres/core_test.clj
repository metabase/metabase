(ns metabase.search.postgres.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.search :refer [is-postgres?]]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.index-test :refer [legacy-results]]
   [metabase.test :as mt]
   [toucan2.realize :as t2.realize]))

(def ^:private hybrid
  (comp t2.realize/realize search.postgres/hybrid))

(def ^:private hybrid-multi
  search.postgres/hybrid-multi)

(deftest ^:synchronized hybrid-test
  (when (is-postgres?)
    (mt/dataset test-data
      (search.postgres/init! true)
      (testing "consistent results between all searches for certain queries\n"
        (doseq [term ["satisfaction" "e-commerce" "example" "rasta" "new" "revenue" "collection"]]
          (testing (str "consistent results, but not ordering\n" term)
            (is (= (set (legacy-results term))
                   (set (hybrid term))))))))))

(deftest ^:synchronized hybrid-multi-test
  (when (is-postgres?)
    (mt/dataset test-data
      (search.postgres/init! true)
      (testing "consistent results between both hybrid implementations"
        (doseq [term ["satisfaction" "e-commerce" "example" "rasta" "new" "revenue" "collection"]]
          (testing term
            (is (= (hybrid term)
                   (hybrid-multi term)))))))))
