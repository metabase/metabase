(ns metabase.pulse.render.datetime-test
  (:require [clj-time.core :as t]
            [expectations :refer [expect]]
            [metabase.pulse.render.datetime :as datetime]
            [metabase.util.date :as du])
  (:import java.util.TimeZone))

(def ^:private now "2020-07-16T18:04:00Z")

(defn- utc [] (TimeZone/getTimeZone "UTC"))

(defn- format-timestamp-pair
  [unit datetime-str-1 datetime-str-2]
  (with-redefs [t/now (constantly (du/str->date-time now (utc)))]
    (datetime/format-timestamp-pair (utc) [datetime-str-1 datetime-str-2] {:unit unit})))

;; check that we can render relative timestamps for the various units we support

;; I don't know what exactly this is used for but we should at least make sure it's working correctly, see (#10326)

(expect
  ["Yesterday" "Previous day"]
  (format-timestamp-pair :day "2020-07-15T18:04:00Z" nil))

(expect
  ["Today" "Previous day"]
  (format-timestamp-pair :day now nil))

(expect
  ["Jul 18, 2020" "Jul 20, 2020"]
  (format-timestamp-pair :day "2020-07-18T18:04:00Z" "2020-07-20T18:04:00Z"))

(expect
  ["Last week" "Previous week"]
  (format-timestamp-pair :week "2020-07-09T18:04:00Z" nil))

(expect
  ["This week" "Previous week"]
  (format-timestamp-pair :week now nil))

(expect
  ["Week 5 - 2020" "Week 13 - 2020"]
  (format-timestamp-pair :week "2020-02-01T18:04:00Z" "2020-03-25T18:04:00Z"))

(expect
  ["This month" "Previous month"]
  (format-timestamp-pair :month "2020-07-16T18:04:00Z" nil))

(expect
  ["This month" "Previous month"]
  (format-timestamp-pair :month now nil))

(expect
  ["July 2021" "July 2022"]
  (format-timestamp-pair :month "2021-07-16T18:04:00Z" "2022-07-16T18:04:00Z"))

(expect
  ["Last quarter" "Previous quarter"]
  (format-timestamp-pair :quarter "2020-05-16T18:04:00Z" nil))

(expect
  ["This quarter" "Previous quarter"]
  (format-timestamp-pair :quarter now nil))

(expect
  ["Q3 - 2018" "Q3 - 2019"]
  (format-timestamp-pair :quarter "2018-07-16T18:04:00Z" "2019-07-16T18:04:00Z"))

(expect
  ["Last year" "Previous year"]
  (format-timestamp-pair :year "2019-07-16T18:04:00Z" nil))

(expect
  ["This year" "Previous year"]
  (format-timestamp-pair :year now nil))

;; No special formatting for year? :shrug:
(expect
  ["2018-07-16T18:04:00Z" "2021-07-16T18:04:00Z"]
  (format-timestamp-pair :year "2018-07-16T18:04:00Z" "2021-07-16T18:04:00Z"))
