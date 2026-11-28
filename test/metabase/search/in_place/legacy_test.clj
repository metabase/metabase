(ns metabase.search.in-place.legacy-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.in-place.legacy :as legacy]))

(deftest card-projection-includes-database-id-test
  (testing "the in-place card projection (shared by questions, models and metrics) selects database_id, so the
            join data picker can tell which database a card belongs to (#82060)"
    (is (some #{[:card.database_id :database_id]}
              (#'legacy/select-clause-for-model "card")))))
