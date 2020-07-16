(ns metabase.query-processor-test.fields-test
  "Tests for the `:fields` clause."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor-test :as qp.test]
             [test :as mt]]))

(deftest fields-clause-test
  (mt/test-drivers (mt/normal-drivers)
    (testing (str "Test that we can restrict the Fields that get returned to the ones specified, and that results come "
                  "back in the order of the IDs in the `fields` clause")
      (is (= {:rows [["Red Medicine"                  1]
                     ["Stout Burgers & Beers"         2]
                     ["The Apple Pan"                 3]
                     ["Wurstküche"                    4]
                     ["Brite Spot Family Restaurant"  5]
                     ["The 101 Coffee Shop"           6]
                     ["Don Day Korean Restaurant"     7]
                     ["25°"                           8]
                     ["Krua Siri"                     9]
                     ["Fred 62"                      10]]
              :cols [(mt/col :venues :name)
                     (mt/col :venues :id)]}
             (mt/format-rows-by [str int]
               (qp.test/rows-and-cols
                 (mt/run-mbql-query venues
                   {:fields   [$name $id]
                    :limit    10
                    :order-by [[:asc $id]]}))))))))
