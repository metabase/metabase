(ns metabase.sync.schedules-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.util.cron :as u.cron]))

(deftest ^:parallel schedule-map->cron-strings-test
  (is (= {} (sync.schedules/schedule-map->cron-strings {})))
  (is (= {:cache_field_values_schedule "0 0 4 * * ? *"}
         (sync.schedules/schedule-map->cron-strings {:cache_field_values {:schedule_type "daily"
                                                                          :schedule_hour 4}})))
  (is (= {:metadata_sync_schedule      "0 0 * * * ? *",
          :cache_field_values_schedule "0 0 4 * * ? *"}
         (sync.schedules/schedule-map->cron-strings {:cache_field_values {:schedule_type "daily"
                                                                          :schedule_hour 4}
                                                     :metadata_sync      {:schedule_type "hourly"}}))))

(deftest ^:parallel default-randomized-schedule
  (testing "randomized schedule never matches \"default\" values"
    ;; this really checks to prevent flaky tests which assert a non-default value, and to prevent "randomizing" the
    ;; same db schedules multiple times
    (doseq [[defaults k] [[sync.schedules/default-cache-field-values-schedule-cron-strings
                           :cache_field_values]
                          [sync.schedules/default-metadata-sync-schedule-cron-strings
                           :metadata_sync]]]
     (let [generator  (comp u.cron/schedule-map->cron-string
                            k
                            sync.schedules/default-randomized-schedule)]
       (is (empty? (filter defaults (repeatedly 500 generator)))
           (format "Found default values for %s randomized schedule" (name k)))))))
