(ns metabase.query-processor.streaming.json-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.query-processor.streaming.json :as streaming.json]
   [metabase.test :as mt]))

(deftest map->serialized-json-kvs-test
  (is (= "\"a\":100,\"b\":200"
         (#'streaming.json/map->serialized-json-kvs {:a 100, :b 200}))))

(deftest geographic-coordinates-json-test
  (testing "Ensure CSV longtitude and latitude values are correctly exported"
    (mt/dataset airports
      (let [result (mt/user-http-request
                     :rasta :post 200 "dataset/json" :query
                     (json/generate-string
                       {:database (mt/id)
                        :type     :query
                        :query    {:source-table (mt/id :airport)
                                   :fields       [[:field (mt/id :airport :id) {:base-type :type/Integer}]
                                                  [:field (mt/id :airport :longitude) {:base-type :type/Float}]
                                                  [:field (mt/id :airport :latitude) {:base-type :type/Float}]]
                                   :order-by     [[:asc (mt/id :airport :id)]]
                                   :limit        5}}))]
        (is (= [{:ID "1", :Longitude "9.84924316° E", :Latitude "57.09275891° N"}
                {:ID "2", :Longitude "39.22489900° E", :Latitude "6.22202000° S"}
                {:ID "3", :Longitude "2.19777989° W", :Latitude "57.20190048° N"}
                {:ID "4", :Longitude "89.67790222° W", :Latitude "39.84410095° N"}
                {:ID "5", :Longitude "54.65110016° E", :Latitude "24.43300056° N"}]
               result))))))
