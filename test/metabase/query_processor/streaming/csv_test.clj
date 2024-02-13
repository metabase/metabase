(ns metabase.query-processor.streaming.csv-test
  (:require
   [cheshire.core :as json]
   [clojure.data.csv :as csv]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs])
  (:import
   (java.io BufferedOutputStream ByteArrayOutputStream)))

(set! *warn-on-reflection* true)

(defn- parse-and-sort-csv [response]
  (assert (some? response))
  (sort-by
   ;; ID in CSV is a string, parse it and sort it to get the first 5
   (comp #(Integer/parseInt %) first)
   ;; First row is the header
   (rest (csv/read-csv response))))

(deftest date-columns-should-be-emitted-without-time
  (is (= [["1" "April 7, 2014" "5" "12"]
          ["2" "September 18, 2014" "1" "31"]
          ["3" "September 15, 2014" "8" "56"]
          ["4" "March 11, 2014" "5" "4"]
          ["5" "May 5, 2013" "3" "49"]]
         (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                            (json/generate-string (mt/mbql-query checkins)))]
           (take 5 (parse-and-sort-csv result))))))

(deftest check-an-empty-date-column
  (testing "NULL values should be written correctly"
    (mt/dataset defs/test-data-with-null-date-checkins
      (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                         (json/generate-string (mt/mbql-query checkins {:order-by [[:asc $id]], :limit 5})))]
        (is (= [["1" "April 7, 2014" "" "5" "12"]
                ["2" "September 18, 2014" "" "1" "31"]
                ["3" "September 15, 2014" "" "8" "56"]
                ["4" "March 11, 2014" "" "5" "4"]
                ["5" "May 5, 2013" "" "3" "49"]]
               (parse-and-sort-csv result)))))))

(deftest sqlite-datetime-test
  (mt/test-driver :sqlite
    (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                       (json/generate-string (mt/mbql-query checkins {:order-by [[:asc $id]], :limit 5})))]
      (is (= [["1" "April 7, 2014" "5" "12"]
              ["2" "September 18, 2014" "1" "31"]
              ["3" "September 15, 2014" "8" "56"]
              ["4" "March 11, 2014" "5" "4"]
              ["5" "May 5, 2013" "3" "49"]]
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

(defn- csv-export
  "Given a seq of result rows, write it as a CSV, then read the CSV and return the resulting data."
  [rows]
  (driver/with-driver :h2
    (mt/with-metadata-provider (mt/id)
      (with-open [bos (ByteArrayOutputStream.)
                  os  (BufferedOutputStream. bos)]
        (let [results-writer (qp.si/streaming-results-writer :csv os)]
          (qp.si/begin! results-writer {:data {:ordered-cols [{:base_type :type/*}
                                                              {:base_type :type/*}
                                                              {:base_type :type/*}]}} {})
          (doall (map-indexed
                  (fn [i row] (qp.si/write-row! results-writer row i [] {}))
                  rows))
          (qp.si/finish! results-writer {:row_count (count rows)}))
        (let [bytea (.toByteArray bos)]
          (rest (csv/read-csv (String. bytea))))))))

(deftest lazy-seq-realized-test
  (testing "Lazy seqs within rows are automatically realized during exports (#26261)"
    (let [row (first (csv-export [[(lazy-seq [1 2 3])]]))]
      (is (= ["[1 2 3]"] row))))

  (testing "LocalDate in a lazy seq (checking that elements in a lazy seq are formatted correctly as strings)"
    (let [row (first (csv-export [[(lazy-seq [#t "2021-03-30T"])]]))]
      (is (= ["[\"2021-03-30\"]"] row)))))

(deftest format-datetimes-test
  (testing "Format datetime columns the way we expect (#10803)"
    (let [query   (str "SELECT cast(parsedatetime('2020-06-03', 'yyyy-MM-dd') AS timestamp) AS \"birth_date\",\n"
                       "       cast(parsedatetime('2020-06-03 23:41:23', 'yyyy-MM-dd HH:mm:ss') AS timestamp) AS \"created_at\"")
          results (qp/process-query (assoc (mt/native-query {:query query}) :middleware {:format-rows? false}))]
      (is (= [["2020-06-03" "2020-06-03T23:41:23"]]
             (csv-export (mt/rows results)))))))
