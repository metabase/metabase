(ns metabase.query-processor.inactive-fields-test
  "See also [[metabase.query-processor.middleware.remove-inactive-field-refs-test]] (for the middleware specifically)."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]))

(deftest ^:parallel inactive-remaps-in-join-test
  (testing "Do not add inactive remapped columns in a join (#62591)"
    (let [base-mp       (fn []
                          (-> (mt/metadata-provider)
                              (lib.tu/remap-metadata-provider (mt/id :orders :product_id) (mt/id :products :title))))
          query         (let [mp (base-mp)]
                          (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                              (lib/join (lib.metadata/table mp (mt/id :orders)))
                              (lib/order-by (lib.metadata/field mp (mt/id :people :id)))
                              (lib/limit 2)
                              (dissoc :lib/metadata)))
          mp            (-> (base-mp)
                            (lib.tu/merged-mock-metadata-provider
                             {:fields [{:id     (mt/id :products :title)
                                        :active false}]}))
          query         (lib/query mp query)
          expected-cols ["ID"
                         "Address"
                         "Email"
                         "Password"
                         "Name"
                         "City"
                         "Longitude"
                         "State"
                         "Source"
                         "Birth Date"
                         "Zip"
                         "Latitude"
                         "Created At"
                         "Orders → ID"
                         "Orders → User ID"
                         "Orders → Product ID"
                         "Orders → Subtotal"
                         "Orders → Tax"
                         "Orders → Total"
                         "Orders → Discount"
                         "Orders → Created At"
                         "Orders → Quantity"]]
      (testing `lib.metadata.result-metadata/returned-columns
        (is (= expected-cols
               (map :display-name (lib.metadata.result-metadata/returned-columns query)))))
      (testing `qp.preprocess/query->expected-cols
        (is (= expected-cols
               (map :display_name (qp.preprocess/query->expected-cols query)))))
      (let [results (qp/process-query query)]
        (testing "cols in QP results after running the query"
          (is (= expected-cols
                 (map :display_name (mt/cols results)))))
        (is (= [[1 "9611-9809 West Rosedale Road" "borer-hudson@yahoo.com" "ccca881f-3e4b-4e5c-8336-354103604af6" "Hudson Borer"
                 "Wood River" -98.5259864 "NE" "Twitter" "1986-12-12T00:00:00Z" "68883" 40.71314890000001 "2017-10-07T01:34:35.462Z"
                 1 1 14 37.65 2.07 39.72 nil "2019-02-11T21:40:27.892Z" 2]
                [1 "9611-9809 West Rosedale Road" "borer-hudson@yahoo.com" "ccca881f-3e4b-4e5c-8336-354103604af6" "Hudson Borer"
                 "Wood River" -98.5259864 "NE" "Twitter" "1986-12-12T00:00:00Z" "68883" 40.71314890000001 "2017-10-07T01:34:35.462Z"
                 2 1 123 110.93 6.1 117.03 nil "2018-05-15T08:04:04.58Z" 3]]
               (mt/rows results)))))))
