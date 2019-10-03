(ns metabase.query-processor-test.timezones
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.util.date :as du])
  (:import [java.time Instant LocalDateTime OffsetDateTime ZoneId]))

;; relevant checkins:
;; id  | timestamp (UTC)          | timestamp (US/Pacific)
;; ----+--------------------------+------------------------------
;;  37 | 2015-11-19T00:00:00.000Z | 2015-11-18T16:00:00.000-08:00
;; 627 | 2015-11-21T00:00:00.000Z | 2015-11-20T16:00:00.000-08:00
;; 900 | 2015-11-21T00:00:00.000Z | 2015-11-20T16:00:00.000-08:00

(defn- checkins-on-date [date-str]
  (qp.test/rows
    (data/run-mbql-query checkins
      {:fields   [$id $date]
       :filter   [:= $date date-str]
       :order-by [[:asc $id]]})))

(deftest timezones-test
  (driver/with-driver :postgres         ; NOCOMMIT
    (doseq [[timezone date->checkins] {"UTC"        {"2015-11-18" []
                                                     "2015-11-19" [[37 "2015-11-19T00:00:00.000Z"]]
                                                     "2015-11-20" []
                                                     "2015-11-21" [[627 "2015-11-21T00:00:00.000Z"]
                                                                   [900 "2015-11-21T00:00:00.000Z"]]}
                                       "US/Pacific" {"2015-11-18" [[37 "2015-11-18T16:00:00.000-08:00"]]
                                                     "2015-11-19" []
                                                     "2015-11-20" [[627 "2015-11-20T16:00:00.000-08:00"]
                                                                   [900 "2015-11-20T16:00:00.000-08:00"]]}}]
      (tu/with-temporary-setting-values [report-timezone timezone]
        (doseq [[date checkins] date->checkins]
          (is (= checkins
                 (checkins-on-date date))
              (format "%s has %d checkins in the %s timezone" date (count checkins) timezone)))))))

(deftest y2
  (binding [metabase.query-processor/*debug* true]
    (tu/with-temporary-setting-values [report-timezone "US/Pacific"]
      (driver/with-driver :postgres
        (is (= [[37 "2015-11-18T16:00:00.000-08:00"]]
               (checkins-on-date "2015-11-18"))
            "Nov 18th has one checkin in US/Pacific timezone (midnight Nov 18th US/Pacific = 8 AM Nov 18th UTC")))))

(defn- timestamp ^java.sql.Timestamp [^String datetime-str, ^String timezone-id]
  (metabase.util.date/->Timestamp datetime-str "UTC"))

(defn- offset-date-time
  ^OffsetDateTime [^String datetime-str, ^String timezone-id]
  (OffsetDateTime/ofInstant
   (Instant/parse datetime-str)
   (ZoneId/of timezone-id)))

(defn- local-date-time
  (^LocalDateTime [^String datetime-str]
   (LocalDateTime/parse datetime-str))

  (^LocalDateTime [^String datetime-str, ^String timezone-id]
   (LocalDateTime/ofInstant
    (Instant/parse datetime-str)
    (ZoneId/of timezone-id))))

(defn- rows-with-date [report-timezone inst]
  (driver/with-driver :postgres
    (driver/notify-database-updated :postgres (data/db))
    (qp.test/rows
      (metabase.query-processor/process-query
        {:database (data/id)
         :type     :native
         :native   {:query  "SELECT * FROM checkins WHERE date = ?"
                    :params [inst]}
         :settings {:report-timezone report-timezone}}))))

(defn correct-utc []
  (rows-with-date "UTC" (local-date-time "2015-11-19T00:00")))

;; GOOD
(defn correct-pacific-local-date-time []
  (rows-with-date "US/Pacific" (local-date-time "2015-11-18T16:00")))

(defn correct-pacific-offset-date-time []
  (rows-with-date "US/Pacific" (offset-date-time "2015-11-19T00:00:00.000Z" "US/Pacific")))

;; BAD
(defn e2 []
  (rows-with-date "US/Pacific" (offset-date-time "2015-11-18T16:00:00.000-08:00" "US/Pacific")))

(defn e3 []
  (rows-with-date "US/Pacific" (offset-date-time "2015-11-18T16:00:00.000-08:00" "UTC")))

(defn- good-utc-timestamp []
  (rows-with-date "UTC" (timestamp "2015-11-19T00:00" "UTC")))

(defn e1 []
  (rows-with-date "US/Pacific" (timestamp "2015-11-18T16:00:00.000Z" "UTC")))

(defn- relevant-rows [report-timezone]
  (driver/with-driver :postgres
    (driver/notify-database-updated :postgres (data/db))
    (qp.test/rows
      (metabase.query-processor/process-query
        {:database (data/id)
         :type     :native
         :native   {:query "SELECT * FROM checkins WHERE date BETWEEN '2015-11-18'::timestamp AND '2015-11-22'::timestamp ORDER BY date ASC"}
         :settings {:report-timezone report-timezone}}))))

;; UTC
[[4  48 "2015-11-19T00:00:00.000Z" 37]
 [8   8 "2015-11-21T00:00:00.000Z" 627]
 [7  87 "2015-11-21T00:00:00.000Z" 900]
 [10 83 "2015-11-22T00:00:00.000Z" 141]
 [2  48 "2015-11-22T00:00:00.000Z" 498]]

;; US/Pacific
#_(relevant-rows "US/Pacific")
[[4  48 "2015-11-19T00:00:00.000-08:00" 37]
 [8   8 "2015-11-21T00:00:00.000-08:00" 627]
 [7  87 "2015-11-21T00:00:00.000-08:00" 900]
 [10 83 "2015-11-22T00:00:00.000-08:00" 141]
 [2  48 "2015-11-22T00:00:00.000-08:00" 498]]
