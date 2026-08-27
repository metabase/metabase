(ns metabase.query-processor.timezone-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.timezone :as qp.timezone]))

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
