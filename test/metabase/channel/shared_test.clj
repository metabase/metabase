(ns metabase.channel.shared-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.shared :as channel.shared]
   [metabase.test :as mt]))

(deftest cron-to-friendly-description-test
  (mt/with-dynamic-fn-redefs [channel.shared/schedule-timezone (constantly "UTC")]
    (testing "converts cron expressions to human-readable descriptions"
      (are [cron expected] (= expected (channel.shared/friendly-cron-description cron))
        ;; Hourly patterns
        "0 0 * * * ?"    "Run hourly UTC"
        "0 0 * * * ? *"  "Run hourly UTC"
        "0 30 * * * ?"   "Run hourly at 30 minutes past the hour UTC"

        ;; Daily patterns
        "0 0 12 * * ?"   "Run daily at 12 PM UTC"
        "0 0 12 * * ? *" "Run daily at 12 PM UTC"
        "0 30 9 * * ?"   "Run daily at 9:30 AM UTC"
        "0 15 17 * * ?"  "Run daily at 5:15 PM UTC"
        "0 0 0 * * ?"    "Run daily at 12 AM UTC"

        ;; Weekly patterns
        "0 0 9 ? * 2"    "Run weekly on Monday at 9 AM UTC"
        "0 0 9 ? * 2 *"  "Run weekly on Monday at 9 AM UTC"
        "0 30 17 ? * 6"  "Run weekly on Friday at 5:30 PM UTC"
        "0 0 0 ? * 1"    "Run weekly on Sunday at 12 AM UTC"
        "0 45 14 ? * 4"  "Run weekly on Wednesday at 2:45 PM UTC"))

    (testing "falls back to cron->description for complex patterns"
      (are [cron expected] (= expected (channel.shared/friendly-cron-description cron))
        "0 0 12 1-15 * ?"  "Run at 12:00 pm, between day 1 and 15 of the month UTC"
        "0 0/15 * * * ?"   "Run every 15 minutes UTC"
        "0 0 12 ? * 2,4,6" "Run at 12:00 pm, only on Monday, Wednesday and Friday UTC"
        "0 0 12 L * ?"     "Run at 12:00 pm, on the last day of the month UTC"
        "0 0 12 ? * 2#1"   "Run at 12:00 pm, on the first Monday of the month UTC")))

  (mt/with-dynamic-fn-redefs [channel.shared/schedule-timezone (constantly "Asia/Ho_Chi_Minh")]
    (testing "with timezone Asia/Ho_Chi_Minh"
      (is (= "Run hourly Asia/Ho_Chi_Minh" (channel.shared/friendly-cron-description "0 0 * * * ?"))))))
