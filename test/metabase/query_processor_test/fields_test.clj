(ns metabase.query-processor-test.fields-test
  "Tests for the `:fields` clause."
  (:require [metabase.query-processor-test :as qp.test]
            [metabase.test.data :as data]))

;; Test that we can restrict the Fields that get returned to the ones specified, and that results come back in the
;; order of the IDs in the `fields` clause
(qp.test/qp-expect-with-all-drivers
  {:rows        [["Red Medicine"                  1]
                 ["Stout Burgers & Beers"         2]
                 ["The Apple Pan"                 3]
                 ["Wurstküche"                    4]
                 ["Brite Spot Family Restaurant"  5]
                 ["The 101 Coffee Shop"           6]
                 ["Don Day Korean Restaurant"     7]
                 ["25°"                           8]
                 ["Krua Siri"                     9]
                 ["Fred 62"                      10]]
   :columns     (qp.test/->columns "name" "id")
   :cols        [(qp.test/venues-col :name)
                 (qp.test/venues-col :id)]
   :native_form true}
  (->> (data/run-mbql-query venues
         {:fields   [$name $id]
          :limit    10
          :order-by [[:asc $id]]})
       qp.test/booleanize-native-form
       (qp.test/format-rows-by [str int])))
