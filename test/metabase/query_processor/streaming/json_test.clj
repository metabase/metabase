(ns metabase.query-processor.streaming.json-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   [java.io ByteArrayOutputStream OutputStream]))

(set! *warn-on-reflection* true)

(deftest geographic-coordinates-json-test
  (testing "Ensure JSON longitude and latitude values are correctly exported"
    (let [result (mt/user-http-request
                  :rasta :post 200 "dataset/json" :query
                  (json/encode
                   {:database (mt/id)
                    :type     :query
                    :query    {:source-table (mt/id :venues)
                               :fields       [[:field (mt/id :venues :id) {:base-type :type/Integer}]
                                              [:field (mt/id :venues :longitude) {:base-type :type/Float}]
                                              [:field (mt/id :venues :latitude) {:base-type :type/Float}]]
                               :order-by     [[:asc (mt/id :venues :id)]]
                               :limit        5}})
                  :format_rows true)]
      (is (= [{:ID "1", :Longitude "165.37400000° W", :Latitude "10.06460000° N"}
              {:ID "2", :Longitude "118.32900000° W", :Latitude "34.09960000° N"}
              {:ID "3", :Longitude "118.42800000° W", :Latitude "34.04060000° N"}
              {:ID "4", :Longitude "118.46500000° W", :Latitude "33.99970000° N"}
              {:ID "5", :Longitude "118.26100000° W", :Latitude "34.07780000° N"}]
             result)))))

(deftest batched-streaming-results-test
  (testing "While streaming JSON results in the API, we should only `.flush` a handful of times (#34795)"
    (let [baos    (ByteArrayOutputStream.)
          flushes (atom [])
          closes  (atom 0)
          os      (proxy [OutputStream] []
                    (close []
                      (swap! closes inc)
                      (.close baos))
                    (flush []
                      (swap! flushes conj (.size baos))
                      (.flush baos))
                    (write
                      ([b]          (.write baos ^int b))
                      ([bs off len] (.write baos bs off len))))]
      (qp.streaming/do-with-streaming-rff
       :api os
       (fn [rff]
         (qp/process-query (mt/mbql-query orders) rff)))
      (is (< 0 (count @flushes) 6))
      (is (pos? @closes)))))
