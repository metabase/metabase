(ns metabase.query-processor.timezone-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test :as mt]))

(deftest ^:parallel same-zone-rules?-test
  (are [zone-id-1 zone-id-2] (qp.timezone/same-zone-rules? zone-id-1 zone-id-2)
    "US/Pacific"    "America/Los_Angeles"
    "UTC"           "Etc/UTC"
    "UTC"           "GMT"
    "Asia/Calcutta" "Asia/Kolkata"
    "Etc/GMT+8"     "-08:00")
  (are [zone-id-1 zone-id-2] (not (qp.timezone/same-zone-rules? zone-id-1 zone-id-2))
    "US/Pacific"    "America/Vancouver"
    "US/Pacific"    "-08:00"
    "Europe/Berlin" "Europe/Paris"))

(deftest pinned-now-test
  (let [instant (t/instant "2020-06-17T12:00:00Z")]
    (mt/with-driver :h2
      (mt/with-results-timezone-id "Asia/Tokyo"
        (testing "the pinned moment, in the results timezone"
          (is (= (t/zoned-date-time "2020-06-17T21:00:00+09:00[Asia/Tokyo]")
                 (qp.timezone/with-pinned-now instant (qp.timezone/now)))))
        (testing "control: unpinned, the real clock"
          (is (not= instant (t/instant (qp.timezone/now)))))))))
