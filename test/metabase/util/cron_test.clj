(ns metabase.util.cron-test
  "Tests for the util fns that convert things to and from frontend-friendly schedule map and cron strings.
   These don't test every possible combination but hopefully cover enough that we can be reasonably sure the
   logic is right."
  (:require [expectations :refer :all]
            [metabase.util.cron :as cron-util]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          SCHEDULE MAP -> CRON STRING                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;; basic hourly schedule
(expect
  "0 0 * * * ? *"
  (cron-util/schedule-map->cron-string
    {:schedule_type  "hourly"}))

;; basic daily @ midnight schedule
(expect
  "0 0 0 * * ? *"
  (cron-util/schedule-map->cron-string
    {:schedule_hour  0
     :schedule_type  "daily"}))

;; daily at 3 AM
(expect
  "0 0 3 * * ? *"
  (cron-util/schedule-map->cron-string
    {:schedule_hour  3
     :schedule_type  "daily"}))

;; hourly
(expect
  "0 0 * * * ? *"
  (cron-util/schedule-map->cron-string
    {:schedule_type  "hourly"}))

;; Monthly on the first Monday at 5PM
(expect
  "0 0 17 ? * 2#1 *"
  (cron-util/schedule-map->cron-string
    {:schedule_day   "mon"
     :schedule_frame "first"
     :schedule_hour  17
     :schedule_type  "monthly"}))

;; Monthly on the last Friday at 11PM
(expect
  "0 0 23 ? * 6L *"
  (cron-util/schedule-map->cron-string
    {:schedule_day   "fri"
     :schedule_frame "last"
     :schedule_hour  23
     :schedule_type  "monthly"}))

;; Monthly on the 15th at 5PM
(expect
  "0 0 17 15 * ? *"
  (cron-util/schedule-map->cron-string
    {:schedule_frame "mid"
     :schedule_hour  17
     :schedule_type  "monthly"}))

;; Monthly the first day of the month at Midnight
(expect
  "0 0 0 1 * ? *"
  (cron-util/schedule-map->cron-string
    {:schedule_frame "first"
     :schedule_hour  0
     :schedule_type  "monthly"}))

;; Monthly the last day of the month at Midnight
(expect
  "0 0 0 L * ? *"
  (cron-util/schedule-map->cron-string
    {:schedule_frame "last"
     :schedule_hour  0
     :schedule_type  "monthly"}))

;; Weekly every Tuesday at 4 PM
(expect
  "0 0 16 ? * 3 *"
  (cron-util/schedule-map->cron-string
    {:schedule_day   "tue"
     :schedule_hour  16
     :schedule_type  "weekly"}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          CRON STRING -> SCHEDULE MAP                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;; basic hourly schedule
(expect
  {:schedule_day   nil
   :schedule_frame nil
   :schedule_hour  nil
   :schedule_type  "hourly"}
  (cron-util/cron-string->schedule-map "0 0 * * * ? *"))

;; basic daily @ midnight schedule
(expect
  {:schedule_day   nil
   :schedule_frame nil
   :schedule_hour  0
   :schedule_type  "daily"}
  (cron-util/cron-string->schedule-map "0 0 0 * * ? *"))

;; daily at 3 AM
(expect
  {:schedule_day   nil
   :schedule_frame nil
   :schedule_hour  3
   :schedule_type  "daily"}
  (cron-util/cron-string->schedule-map "0 0 3 * * ? *"))

;; hourly
(expect
  {:schedule_day   nil
   :schedule_frame nil
   :schedule_hour  nil
   :schedule_type  "hourly"}
  (cron-util/cron-string->schedule-map "0 0 * * * ? *"))

;; TODO Monthly on the first Monday at 5PM
(expect
  {:schedule_day   "mon"
   :schedule_frame "first"
   :schedule_hour  17
   :schedule_type  "monthly"}
  (cron-util/cron-string->schedule-map "0 0 17 ? * 2#1 *"))

;; Monthly on the last Friday at 11PM
(expect
  {:schedule_day   "fri"
   :schedule_frame "last"
   :schedule_hour  23
   :schedule_type  "monthly"}
  (cron-util/cron-string->schedule-map "0 0 23 ? * 6L *"))

;; Monthly on the 15th at 5PM
(expect
  {:schedule_day   nil
   :schedule_frame "mid"
   :schedule_hour  17
   :schedule_type  "monthly"}
  (cron-util/cron-string->schedule-map "0 0 17 15 * ? *"))

;; Some random schedule you can't actually set in the UI: Once a minute
;; Should just fall back to doing hourly or something else valid for the frontend
(expect
  {:schedule_day   nil
   :schedule_frame nil
   :schedule_hour  nil
   :schedule_type  "hourly"}
  (cron-util/cron-string->schedule-map "0 * * * * ? *"))

(expect
  {:schedule_day  nil
   :schedule_frame "first"
   :schedule_hour  0
   :schedule_type  "monthly"}
  (cron-util/cron-string->schedule-map "0 0 0 1 * ? *"))

;; Monthly the last day of the month at Midnight
(expect
  {:schedule_day   nil
   :schedule_frame "last"
   :schedule_hour  0
   :schedule_type  "monthly"}
  (cron-util/cron-string->schedule-map "0 0 0 L * ? *"))

;; Weekly every Tuesday at 4 PM
(expect
  {:schedule_day   "tue"
   :schedule_frame nil
   :schedule_hour  16
   :schedule_type  "weekly"}
  (cron-util/cron-string->schedule-map "0 0 16 ? * 3 *"))
