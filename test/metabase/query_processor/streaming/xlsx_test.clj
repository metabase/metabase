(ns metabase.query-processor.streaming.xlsx-test
  "Additional tests for downloads (including XLSX) are in places like `metabase.query-processor.streaming-test`."
  (:require [clojure.test :refer :all]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.query-processor
             [streaming :as qp.streaming]
             [timezone :as qp.timezone]]
            [metabase.util.files :as u.files]))

(defn- timestamps-in-xlsx-results
  "Run a query that "
  []
  (mt/dataset attempted-murders
    (let [filename (str (u.files/get-path (System/getProperty "java.io.tmpdir") "out.xlsx"))
          query    (mt/mbql-query attempts
                     {:fields   [$date $datetime $datetime_ltz $datetime_tz $datetime_tz_id $time $time_ltz $time_tz]
                      :order-by [[:asc $id]]
                      :limit    1})]
      (with-open [os (java.io.FileOutputStream. filename)]
        (is (= :completed
               (:status (qp/process-query query
                                          (qp.streaming/streaming-context :xlsx os))))))
      (->> (spreadsheet/load-workbook filename)
           (spreadsheet/select-sheet "Query result")
           (spreadsheet/select-columns {:A :date
                                        :B :datetime
                                        :C :datetime-ltz
                                        :D :datetime-tz
                                        :E :datetime-tz-id
                                        :F :time
                                        :G :time-ltz
                                        :H :time-tz})
           second))))

(deftest report-timezone-test
  (testing "XLSX downloads should format stuff with the report timezone rather than UTC (#13677)\n"
    (testing "Should be in UTC by default"
      (is (= {:date           "2019-11-01T00:00:00Z"
              :datetime       "2019-11-01T00:23:18.331Z"
              :datetime-ltz   "2019-11-01T07:23:18.331Z"
              :datetime-tz    "2019-11-01T07:23:18.331Z"
              :datetime-tz-id "2019-11-01T07:23:18.331Z"
              :time           "00:23:18Z"
              :time-ltz       "07:23:18Z"
              :time-tz        "07:23:18Z"}
             (timestamps-in-xlsx-results))))
    (testing "If report timezone is set, results should be in that timezone"
      (binding [qp.timezone/*results-timezone-id-override* "US/Pacific"]
        (is (= {:date           "2019-11-01T00:00:00-07:00"
                :datetime       "2019-11-01T00:23:18.331-07:00"
                :datetime-ltz   "2019-11-01T00:23:18.331-07:00"
                :datetime-tz    "2019-11-01T00:23:18.331-07:00"
                :datetime-tz-id "2019-11-01T00:23:18.331-07:00"
                :time           "16:23:18-08:00"
                :time-ltz       "23:23:18-08:00"
                :time-tz        "23:23:18-08:00"}
               (timestamps-in-xlsx-results)))))))
