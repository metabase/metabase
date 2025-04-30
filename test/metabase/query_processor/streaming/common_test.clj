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
        (mt/with-clock (t/zoned-date-time (t/instant) test-timezone)
          (let [now-in-report-zone           (t/zoned-date-time (t/instant) test-timezone)
                filename-time                (u.date/parse (streaming.common/export-filename-timestamp))
                filename-time-in-report-zone (t/zoned-date-time filename-time test-timezone)]
            (is (= now-in-report-zone filename-time-in-report-zone))))))))
