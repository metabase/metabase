(ns metabase.query-processor.streaming.xlsx-test
  "Additional tests for downloads (including XLSX) are in places like `metabase.query-processor.streaming-test`."
  (:require [clojure.test :refer :all]
            [metabase.query-processor.streaming-test :as streaming-test]
            [metabase.test :as mt]))

(defn- timestamps-in-xlsx-results []
  (mt/dataset attempted-murders
    (let [query (mt/mbql-query attempts
                  {:fields   [$date $datetime $datetime_ltz $datetime_tz $datetime_tz_id $time $time_ltz $time_tz]
                   :order-by [[:asc $id]]
                   :limit    1})]
      (first
       (streaming-test/process-query-api-response-streaming
        :xlsx
        query
        [:date :datetime :datetime-ltz :datetime-tz :datetime-tz-id :time :time-ltz :time-tz])))))

(deftest report-timezone-test
  (mt/test-drivers #{:postgres}
    (testing "XLSX downloads should format stuff with the report timezone rather than UTC (#13677)\n"
      (testing "Should be in UTC by default"
        (is (= (merge
                {:date           #inst "2019-11-01T00:00:00.000-00:00"
                 :datetime       #inst "2019-11-01T00:23:18.331-00:00"
                 :datetime-ltz   #inst "2019-11-01T07:23:18.331-00:00"
                 :datetime-tz    #inst "2019-11-01T07:23:18.331-00:00"
                 :datetime-tz-id #inst "2019-11-01T07:23:18.331-00:00"
                 ;; Excel actually display these without the date info (which is zero), but since Docjure returns
                 ;; java.util.Dates by default when parsing an XLSX doc, they have the date info here.
                 :time           #inst "1899-12-31T00:23:18.000-00:00"
                 :time-ltz       #inst "1899-12-31T07:23:18.000-00:00"
                 :time-tz        #inst "1899-12-31T07:23:18.000-00:00"})
               (timestamps-in-xlsx-results))))
      (testing "If report timezone is set, results should be in that timezone"
        (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
          (is (= (merge
                  {:date           #inst "2019-11-01T00:00:00.000"
                   :datetime       #inst "2019-11-01T00:23:18.331"
                   :datetime-ltz   #inst "2019-11-01T00:23:18.331"
                   :datetime-tz    #inst "2019-11-01T00:23:18.331"
                   :datetime-tz-id #inst "2019-11-01T00:23:18.331"
                   :time           #inst "1899-12-31T00:23:18.000-00:00"
                   :time-tz        #inst "1899-12-31T23:23:18.000-00:00"
                   :time-ltz       #inst "1899-12-31T23:23:18.000-00:00"})
                 (timestamps-in-xlsx-results))))))))
