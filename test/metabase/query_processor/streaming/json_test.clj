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
  (testing "Ensure JSON longitude and latitude values are correctly exported"
    (let [result (mt/user-http-request
                   :rasta :post 200 "dataset/json" :query
                   (json/generate-string
                     {:database (mt/id)
                      :type     :query
                      :query    {:source-table (mt/id :venues)
                                 :fields       [[:field (mt/id :venues :id) {:base-type :type/Integer}]
                                                [:field (mt/id :venues :longitude) {:base-type :type/Float}]
                                                [:field (mt/id :venues :latitude) {:base-type :type/Float}]]
                                 :order-by     [[:asc (mt/id :venues :id)]]
                                 :limit        5}}))]
      (is (= [{:ID "1", :Longitude "165.37400000° W", :Latitude "10.06460000° N"}
              {:ID "2", :Longitude "118.32900000° W", :Latitude "34.09960000° N"}
              {:ID "3", :Longitude "118.42800000° W", :Latitude "34.04060000° N"}
              {:ID "4", :Longitude "118.46500000° W", :Latitude "33.99970000° N"}
              {:ID "5", :Longitude "118.26100000° W", :Latitude "34.07780000° N"}]
             result)))))
