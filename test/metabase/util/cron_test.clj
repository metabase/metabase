(ns ^:mb/once metabase.util.cron-test
  "Tests for the util fns that convert things to and from frontend-friendly schedule map and cron strings.
   These don't test every possible combination but hopefully cover enough that we can be reasonably sure the
   logic is right."
  (:require
   [clojure.test :refer :all]
   [metabase.util.cron :as u.cron]))

(deftest ^:parallel schedule-map->cron-string-test
  (testing "basic schedule"
    (is (= "0 0 * * * ? *"
           (u.cron/schedule-map->cron-string
             {:schedule_type  "hourly"})))
    (is (= "0 0 0 * * ? *"
           (u.cron/schedule-map->cron-string
             {:schedule_type  "daily"})))
    (is (= "0 0 0 * * ? *"
           (u.cron/schedule-map->cron-string
             {:schedule_hour  0
              :schedule_type  "daily"})))
    (is (= "0 0 3 * * ? *"
           (u.cron/schedule-map->cron-string
             {:schedule_hour  3
              :schedule_type  "daily"})))
    (is (= "0 0 * * * ? *"
           (u.cron/schedule-map->cron-string
             {:schedule_type  "hourly"}))))
  (testing "more settings at once"
    (is (= "0 0 17 ? * 2#1 *"
           (u.cron/schedule-map->cron-string
             {:schedule_day   "mon"
              :schedule_frame "first"
              :schedule_hour  17
              :schedule_type  "monthly"})))
    (is (= "0 0 23 ? * 6L *"
           (u.cron/schedule-map->cron-string
             {:schedule_day   "fri"
              :schedule_frame "last"
              :schedule_hour  23
              :schedule_type  "monthly"})))
    (is (= "0 0 17 15 * ? *"
           (u.cron/schedule-map->cron-string
             {:schedule_frame "mid"
              :schedule_hour  17
              :schedule_type  "monthly"})))
    (is (= "0 0 0 1 * ? *"
           (u.cron/schedule-map->cron-string
             {:schedule_frame "first"
              :schedule_hour  0
              :schedule_type  "monthly"})))
    (is (= "0 0 0 L * ? *"
           (u.cron/schedule-map->cron-string
             {:schedule_frame "last"
              :schedule_hour  0
              :schedule_type  "monthly"})))
    (is (= "0 0 16 ? * 3 *"
           (u.cron/schedule-map->cron-string
             {:schedule_day   "tue"
              :schedule_hour  16
              :schedule_type  "weekly"})))))

(deftest cron-string->schedule-map-test
  (is (= {:schedule_day    nil
          :schedule_frame  nil
          :schedule_hour   nil
          :schedule_minute 0
          :schedule_type   "hourly"}
         (u.cron/cron-string->schedule-map "0 0 * * * ? *")))
  (is (= {:schedule_day    nil
          :schedule_frame  nil
          :schedule_minute 0
          :schedule_hour   0
          :schedule_type   "daily"}
         (u.cron/cron-string->schedule-map "0 0 0 * * ? *")))
  (is (= {:schedule_day    nil
          :schedule_frame  nil
          :schedule_minute 0
          :schedule_hour   3
          :schedule_type   "daily"}
         (u.cron/cron-string->schedule-map "0 0 3 * * ? *")))
  (is (= {:schedule_day    nil
          :schedule_frame  nil
          :schedule_hour   nil
          :schedule_minute 0
          :schedule_type   "hourly"}
         (u.cron/cron-string->schedule-map "0 0 * * * ? *")))
  (is (= {:schedule_day    "mon"
          :schedule_frame  "first"
          :schedule_hour   17
          :schedule_minute 0
          :schedule_type   "monthly"}
         (u.cron/cron-string->schedule-map "0 0 17 ? * 2#1 *")))
  (is (= {:schedule_day    "fri"
          :schedule_frame  "last"
          :schedule_hour   23
          :schedule_minute 0
          :schedule_type   "monthly"}
         (u.cron/cron-string->schedule-map "0 0 23 ? * 6L *")))
  (is (= {:schedule_day    "fri"
          :schedule_frame  "last"
          :schedule_hour   23
          :schedule_minute 0
          :schedule_type   "monthly"}
         (u.cron/cron-string->schedule-map "0 0 23 ? * 6L *")))
  (is (= {:schedule_day    nil
          :schedule_frame  "mid"
          :schedule_hour   17
          :schedule_minute 0
          :schedule_type   "monthly"}
         (u.cron/cron-string->schedule-map "0 0 17 15 * ? *")))
  (is (= {:schedule_day    nil
          :schedule_frame  nil
          :schedule_hour   nil
          :schedule_minute nil
          :schedule_type   "hourly"}
         (u.cron/cron-string->schedule-map "0 * * * * ? *")))
  (is (= {:schedule_day    nil
          :schedule_frame  "first"
          :schedule_hour   0
          :schedule_minute 0
          :schedule_type   "monthly"}
         (u.cron/cron-string->schedule-map "0 0 0 1 * ? *")))
  (is (= {:schedule_day    nil
          :schedule_frame  "last"
          :schedule_hour   0
          :schedule_minute 0
          :schedule_type   "monthly"}
         (u.cron/cron-string->schedule-map "0 0 0 L * ? *")))
  (is (= {:schedule_day    "tue"
          :schedule_frame  nil
          :schedule_hour   16
          :schedule_minute 0
          :schedule_type   "weekly"}
         (u.cron/cron-string->schedule-map "0 0 16 ? * 3 *"))))
