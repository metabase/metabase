(ns metabase.api.query-description-test
  (:require [clojure.test :refer :all]
            [metabase.api.query-description :as sut]
            [metabase.models.table :refer [Table]]
            [metabase.test :as mt]
            [metabase.test
             [data :as data]
             [fixtures :as fixtures]]))

(use-fixtures :once (fixtures/initialize :db))

(deftest metrics-query-test
  (mt/with-db
    (testing "queries"

      (testing "without any arguments, just the table"
        (is (= {:table "Venues"}
               (sut/generate-query-description (Table (mt/id :venues))
                                               (:query (data/mbql-query :venues))))))

      (testing "with limit"
        (is (= {:table "Venues"
                :limit 10}
               (sut/generate-query-description (Table (mt/id :venues))
                                               (:query (data/mbql-query :venues
                                                         {:limit 10}))))))

      (testing "with cumulative sum of price"
        (is (= {:table       "Venues"
                :aggregation [{:type :cum-sum
                               :arg  "Price"}]}
               (sut/generate-query-description (Table (mt/id :venues))
                                               (:query (data/mbql-query :venues
                                                         {:aggregation [[:cum-sum $price]]})))))))))
