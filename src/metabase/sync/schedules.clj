(ns metabase.sync.schedules
  "Types and defaults for the syncing schedules used for the scheduled sync tasks. Has defaults for the two schedules
  maps and some helper methods for turning those into appropriately named cron strings as stored in the
  `metabase_database` table."
  (:require
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def ^:private CronSchedulesMap
  "Schema with values for a DB's schedules that can be put directly into the DB."
  [:map
   [:metadata_sync_schedule      {:optional true} u.cron/CronScheduleString]
   [:cache_field_values_schedule {:optional true} [:maybe u.cron/CronScheduleString]]])

(mr/def ::ExpandedSchedulesMap
  (mu/with-api-error-message
   [:map
    {:error/message "Map of expanded schedule maps"}
    [:cache_field_values {:optional true} [:maybe u.cron/ScheduleMap]]
    [:metadata_sync      {:optional true} u.cron/ScheduleMap]]
   (deferred-tru "value must be a valid map of schedule maps for a DB.")))

(def ExpandedSchedulesMap
  "Schema for the `:schedules` key we add to the response containing 'expanded' versions of the CRON schedules.
   This same key is used in reverse to update the schedules."
  [:ref ::ExpandedSchedulesMap])

(mu/defn schedule-map->cron-strings :- CronSchedulesMap
  "Convert a map of `:schedules` as passed in by the frontend to a map of cron strings with the appropriate keys for
   Database. This map can then be merged directly inserted into the DB, or merged with a map of other columns to
   insert/update."
  [{:keys [metadata_sync cache_field_values]} :- ExpandedSchedulesMap]
  (cond-> {}
    metadata_sync      (assoc :metadata_sync_schedule      (u.cron/schedule-map->cron-string metadata_sync))
    cache_field_values (assoc :cache_field_values_schedule (u.cron/schedule-map->cron-string cache_field_values))))

(defn randomly-once-an-hour
  "Schedule map for once an hour at a random minute of the hour."
  [excluded-minute]
   ;; avoid around near the hour because it's usually when notifications are scheduled.
  (let [choices (remove #{excluded-minute} (range 5 55))]
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
  ([]
   (default-randomized-schedule {:excluded-minute 50}))
  ([{:keys [excluded-minute]}]
   {:cache_field_values (randomly-once-a-day)
    :metadata_sync      (randomly-once-an-hour excluded-minute)}))

;; two because application and db each have defaults
(def default-cache-field-values-schedule-cron-strings
  "Default `:cache_field_values_schedule`s (two as application and db have different defaults)."
  #{"0 0 0 * * ? *" "0 50 0 * * ? *"})

(def default-metadata-sync-schedule-cron-strings
  "Default `:metadata_sync_schedule`s (two as application and db have different defaults)."
  #{"0 0 * * * ? *" "0 50 * * * ? *"})

(def old-sample-metadata-sync-schedule-cron-string
  "Before ADM-943, the default value for this sync string was 43 causing issues with stampedes."
  "0 43 * * * ? *")
