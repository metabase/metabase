(ns metabase.typed-schemas.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.typed-schemas.common :as typed-schemas.common]))

(deftest column-schema-includes-description-test
  (is (= {:type          "column"
          :name          "name"
          :displayName   "Name"
          :baseType      "type/Text"
          :jsType        "string"
          :description   "Name of the customer"}
         (#'typed-schemas.common/column-schema {:name         "name"
                                                :display_name "Name"
                                                :base_type    "type/Text"
                                                :description  "Name of the customer"}))))

(deftest column-schema-maps-metabase-types-test
  (are [column js-type] (= js-type
                           (:jsType (#'typed-schemas.common/column-schema column)))
    {:name "bool", :base_type :type/Boolean}        "boolean"
    {:name "int", :base_type :type/Integer}         "number"
    {:name "date", :base_type :type/DateTime}       "Date"
    {:name "uuid", :base_type :type/UUID}           "string"
    {:name "string", :base_type "type/Text"}        "string"
    {:name "decimal", :base_type "Decimal"}         "number"
    {:name "effective", :effective_type :type/Text} "string"
    {:name "unknown", :base_type :type/Structured}  "unknown"))

(deftest keyed-map-disambiguates-duplicate-keys-with-readable-suffix-test
  (is (= {"channelOrderItems" {:key     "channelOrderItems"
                               :id      "40f15584-bca0-4557-910d-e5e789757f23"
                               :tableId 261}
          "channelOrders"     {:key     "channelOrders"
                               :id      "ca9bef16-d484-4add-8245-ddbc78287e8f"
                               :tableId 167}}
         (#'typed-schemas.common/keyed-map
          [{:key     "channel"
            :id      "ca9bef16-d484-4add-8245-ddbc78287e8f"
            :tableId 167
            :keyDisambiguator "Orders"}
           {:key     "channel"
            :id      "40f15584-bca0-4557-910d-e5e789757f23"
            :tableId 261
            :keyDisambiguator "OrderItems"}]))))

(deftest keyed-map-falls-back-to-id-when-readable-suffix-does-not-disambiguate-test
  (is (= {"channelOrders1" {:key     "channelOrders1"
                            :id      1
                            :tableId 167}
          "channelOrders2" {:key     "channelOrders2"
                            :id      2
                            :tableId 168}}
         (#'typed-schemas.common/keyed-map
          [{:key     "channel"
            :id      1
            :tableId 167
            :keyDisambiguator "Orders"}
           {:key     "channel"
            :id      2
            :tableId 168
            :keyDisambiguator "Orders"}]))))
