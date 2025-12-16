(ns ^:mb/driver-tests metabase.query-processor.fields-test
  "Tests for the `:fields` clause."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
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

(deftest ^:parallel fk-do-not-include-should-not-break-test
  (testing "Check that we don't error when there's a do-not-include (sensitive) foreign key (#64050)"
    (let [mp (-> (mt/metadata-provider)
                 (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                 (mt/id :products :title))
                 (lib.tu/merged-mock-metadata-provider
                  {:fields [{:id (mt/id :products :id)
                             :visibility-type :sensitive}]}))
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/limit 1))]
      (is (seq (mt/rows (qp/process-query query)))))))

(deftest ^:parallel fk-do-not-include-should-not-break-nested-test
  (testing "Check that we don't error when there's a do-not-include (sensitive) foreign key (#64050)"
    (let [mp (-> (mt/metadata-provider)
                 (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                 (mt/id :products :title))
                 (lib.tu/merged-mock-metadata-provider
                  {:fields [{:id (mt/id :products :id)
                             :visibility-type :sensitive}]}))
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/limit 1))
          mp (lib.tu/mock-metadata-provider mp {:cards
                                                [{:id              1
                                                  :name            "NATIVE"
                                                  :database-id     (mt/id)
                                                  :dataset-query   query
                                                  :type :model}]})]
      (let [q2 (-> (lib/query mp (lib.metadata/card mp 1))
                   (lib/limit 1))]
        (is (seq (mt/rows (qp/process-query q2))))))))
