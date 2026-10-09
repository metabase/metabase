(ns ^:mb/driver-tests metabase.query-processor.fields-test
  "Tests for the `:fields` clause."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.fields-test]}
                                                            metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.fields-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(deftest ^:parallel fields-clause-test
  (mt/test-drivers (mt/normal-drivers)
    (testing (str "Test that we can restrict the Fields that get returned to the ones specified, and that results come "
                  "back in the order of the IDs in the `fields` clause")
      (is (=? {:rows [["Red Medicine"                  1]
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
              (mt/format-rows-by
               [str int]
               (qp.test-util/rows-and-cols
                (mt/run-mbql-query venues
                  {:fields   [$name $id]
                   :limit    10
                   :order-by [[:asc $id]]}))))))))

(deftest ^:parallel named-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "fields named with `:name` come back under those names, and a later stage reads them by name"
      (let [mp          (mt/metadata-provider)
            order-id    (lib.metadata/field mp (mt/id :orders :id))
            product-id  (assoc (lib.metadata/field mp (mt/id :products :id)) :fk-field-id (mt/id :orders :product_id))
            named       (fn [column column-name]
                          (lib.options/update-options (lib/ref column) assoc :name column-name))
            two-stages  (fn [fields later-stage-column]
                          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                          (lib/with-fields fields)
                                          (lib/order-by order-id)
                                          (lib/limit 3)
                                          lib/append-stage)]
                            (lib/filter query (lib/> (later-stage-column (lib/visible-columns query)) 0))))
            named-query (two-stages [(named order-id "order_id") (named product-id "product_id")]
                                    (fn [columns] (first (filter #(= "product_id" (:name %)) columns))))]
        (is (= ["order_id" "product_id"]
               (map :name (mt/cols (qp/process-query named-query)))))
        (testing "the rows equal those of the same query without names"
          (is (= (mt/formatted-rows [int int] (qp/process-query (two-stages [order-id product-id] second)))
                 (mt/formatted-rows [int int] (qp/process-query named-query)))))))))
