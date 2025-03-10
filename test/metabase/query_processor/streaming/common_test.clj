(ns metabase.query-processor.streaming.common-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.test :as mt]
   [metabase.util.date-2 :as u.date]))

(set! *warn-on-reflection* true)

(deftest export-filename-timestamp-test
  (testing "Export filename reflects the current time in the report timezone"
    (let [test-timezone "America/Los_Angeles"]
      (mt/with-temporary-setting-values [report-timezone test-timezone]
        (let [now-in-report-zone           (t/zoned-date-time (t/instant) test-timezone)
              filename-time                (u.date/parse (streaming.common/export-filename-timestamp))
              filename-time-in-report-zone (t/zoned-date-time filename-time test-timezone)]
          ;; Check that the parsed timestamp matches the expected time within a tolerance of 1 second
          (is (< (abs (- (.toEpochSecond filename-time-in-report-zone)
                         (.toEpochSecond now-in-report-zone)))
                 1)))))))
