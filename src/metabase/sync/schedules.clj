(ns metabase.sync.schedules
  "Types and defaults for the syncing schedules used for the scheduled sync tasks. Has defaults for the two schedules
  maps and some helper methods for turning those into appropriately named cron strings as stored in the
  `metabase_database` table."
  (:require [metabase.util.cron :as u.cron]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(def CronSchedulesMap
  "Schema with values for a DB's schedules that can be put directly into the DB."
  {(s/optional-key :metadata_sync_schedule)      u.cron/CronScheduleString
   (s/optional-key :cache_field_values_schedule) u.cron/CronScheduleString})

(def ExpandedSchedulesMap
  "Schema for the `:schedules` key we add to the response containing 'expanded' versions of the CRON schedules.
   This same key is used in reverse to update the schedules."
  (su/with-api-error-message
      (s/named
       {(s/optional-key :cache_field_values) u.cron/ScheduleMap
        (s/optional-key :metadata_sync)      u.cron/ScheduleMap}
       "Map of expanded schedule maps")
    "value must be a valid map of schedule maps for a DB."))

(s/defn schedule-map->cron-strings :- CronSchedulesMap
  "Convert a map of `:schedules` as passed in by the frontend to a map of cron strings with the approriate keys for
   Database. This map can then be merged directly inserted into the DB, or merged with a map of other columns to
   insert/update."
  [{:keys [metadata_sync cache_field_values]} :- ExpandedSchedulesMap]
  (cond-> {}
    metadata_sync      (assoc :metadata_sync_schedule      (u.cron/schedule-map->cron-string metadata_sync))
    cache_field_values (assoc :cache_field_values_schedule (u.cron/schedule-map->cron-string cache_field_values))))

(defn randomly-once-an-hour
  "Schedule map for once an hour at a random minute of the hour."
  []
  ;; prevent zeros and 50s which would appear as non-random choices
  (let [choices (into [] (remove #{0 50}) (range 60))]
    {:schedule_minute (rand-nth choices)
     :schedule_type   "hourly"}))

(defn randomly-once-a-day
  "Schedule map for once a day at a random hour of the day."
  []
  ;; prevent zeros which would appear as non-random
  {:schedule_hour  (inc (rand-int 23))
   :schedule_type  "daily"})

(defn default-randomized-schedule
  "Default schedule maps for caching field values and sync. Defaults to `:cache_field_values` randomly once a day and
  `:metadata_sync` randomly once an hour. "
  []
  {:cache_field_values (randomly-once-a-day)
   :metadata_sync      (randomly-once-an-hour)})

;; two because application and db each have defaults
(def default-cache-field-values-schedule-cron-strings
  "Default `:cache_field_values_schedule`s (two as application and db have different defaults)."
  #{"0 0 0 * * ? *" "0 50 0 * * ? *"})

(def default-metadata-sync-schedule-cron-strings
  "Default `:metadata_sync_schedule`s (two as application and db have different defaults)."
  #{"0 0 * * * ? *" "0 50 * * * ? *"})

(defn scheduling
  "Adds sync schedule defaults to a map of schedule-maps."
  [{:keys [cache_field_values metadata_sync] :as _schedules}]
  {:cache_field_values (or cache_field_values (randomly-once-a-day))
   :metadata_sync      (or metadata_sync (randomly-once-an-hour))})
