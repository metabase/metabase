(ns metabase.query-processor.streaming.csv-test
  (:require [cheshire.core :as json]
            [clojure.data.csv :as csv]
            [clojure.test :refer :all]
            [metabase.test :as mt]
            [metabase.test.data.dataset-definitions :as defs]))

(defn- parse-and-sort-csv [response]
  (assert (some? response))
  (sort-by
   ;; ID in CSV is a string, parse it and sort it to get the first 5
   (comp #(Integer/parseInt %) first)
   ;; First row is the header
   (rest (csv/read-csv response))))

(deftest date-columns-should-be-emitted-without-time
  (is (= [["1" "2014-04-07" "5" "12"]
          ["2" "2014-09-18" "1" "31"]
          ["3" "2014-09-15" "8" "56"]
          ["4" "2014-03-11" "5" "4"]
          ["5" "2013-05-05" "3" "49"]]
         (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                            (json/generate-string (mt/mbql-query checkins)))]
           (take 5 (parse-and-sort-csv result))))))

(deftest check-an-empty-date-column
  (testing "NULL values should be written correctly"
    (mt/dataset defs/test-data-with-null-date-checkins
      (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                         (json/generate-string (mt/mbql-query checkins {:order-by [[:asc $id]], :limit 5})))]
        (is (= [["1" "2014-04-07" "" "5" "12"]
                ["2" "2014-09-18" "" "1" "31"]
                ["3" "2014-09-15" "" "8" "56"]
                ["4" "2014-03-11" "" "5" "4"]
                ["5" "2013-05-05" "" "3" "49"]]
               (parse-and-sort-csv result)))))))

(deftest sqlite-datetime-test
  (mt/test-driver :sqlite
    (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                       (json/generate-string (mt/mbql-query checkins {:order-by [[:asc $id]], :limit 5})))]
      (is (= [["1" "2014-04-07" "5" "12"]
              ["2" "2014-09-18" "1" "31"]
              ["3" "2014-09-15" "8" "56"]
              ["4" "2014-03-11" "5" "4"]
              ["5" "2013-05-05" "3" "49"]]
             (parse-and-sort-csv result))))))

(deftest datetime-fields-are-untouched-when-exported
  (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                     (json/generate-string (mt/mbql-query users {:order-by [[:asc $id]], :limit 5})))]
    (is (= [["1" "Plato Yeshua"        "2014-04-01T08:30:00"]
            ["2" "Felipinho Asklepios" "2014-12-05T15:15:00"]
            ["3" "Kaneonuskatew Eiran" "2014-11-06T16:15:00"]
            ["4" "Simcha Yan"          "2014-01-01T08:30:00"]
            ["5" "Quentin Sören"       "2014-10-03T17:30:00"]]
           (parse-and-sort-csv result)))))
