(ns metabase.util.cron
  "Utility functions for converting frontend schedule dictionaries to cron strings and vice versa.
   See http://www.quartz-scheduler.org/documentation/quartz-2.x/tutorials/crontrigger.html#format for details on cron format"
  (:require [clojure.string :as str]
            [schema.core :as s]))

(def ^:private ScheduleMap
  "Schema for a frontend-parsable schedule map. Used for Pulses and DB scheduling."
  {(s/optional-key :schedule_day)   (s/maybe (s/enum "sun" "mon" "tues" "wed" "thu" "fri" "sat"))
   (s/optional-key :schedule_frame) (s/maybe (s/enum "first" "mid" "last"))
   (s/optional-key :schedule_hour)  (s/maybe (s/constrained s/Int (fn [n]
                                                                    (and (>= n 0)
                                                                         (<= n 23)))))
   :schedule_type                   (s/enum "hourly" "daily" "weekly" "monthly")})

;;; ------------------------------------------------------------ Schedule Map -> Cron String ------------------------------------------------------------

(defn- cron-string
  "Build a cron string from key-value pair parts."
  {:style/indent 0}
  [& {:keys [seconds minutes hours day-of-month month day-of-week year]}]
  (str/join " " [(or seconds      "0")
                 (or minutes      "0")
                 (or hours        "*")
                 (or day-of-month "*")
                 (or month        "*")
                 (or day-of-week  "?")
                 (or year         "*")]))

(def ^:private day-of-week->cron
  {"sun"  1
   "mon"  2
   "tues" 3
   "wed"  4
   "thu"  5
   "fri"  6
   "sat"  7})

(def ^:private day-of-month->cron
  {"first" 1
   "mid"   15
   "last"  "L"})

(s/defn ^:always-validate schedule-map->cron-string :- s/Str
  "Convert the frontend schedule map into a cron string."
  [{day-of-week :schedule_day, day-of-month :schedule_frame, hour :schedule_hour, schedule-type :schedule_type} :- ScheduleMap]
  (apply cron-string (case (keyword schedule-type)
                       :hourly  nil
                       :daily   [:hours hour]
                       :weekly  [:hours       hour
                                 :day-of-week (day-of-week->cron day-of-week)]
                       :monthly [:hours        hour
                                 :day-of-month (day-of-month->cron day-of-month)])))


;;; ------------------------------------------------------------ Cron String -> Schedule Map ------------------------------------------------------------

(def ^:private cron->day-of-week
  {"1" "sun"
   "2" "mon"
   "3" "tues"
   "4" "wed"
   "5" "thu"
   "6" "fri"
   "7" "sat"})

(def ^:private cron->day-of-month
  {"1"  "first"
   "15" "mid"
   "L"  "last"})

(defn- cron->hour [hours]
  (when (and hours
             (not= hours "*"))
    (Integer/parseInt hours)))

(defn- cron->schedule-type [hours day-of-month day-of-week]
  (cond
    (and day-of-month (not= day-of-month "*")) "monthly"
    (and day-of-week  (not= day-of-week "?"))  "weekly"
    (and hours        (not= hours "*"))        "daily"
    :else                                      "hourly"))

(s/defn ^:always-validate cron-string->schedule-map :- ScheduleMap
  [cron-string :- s/Str]
  (let [[_ _ hours day-of-month _ day-of-week _] (str/split cron-string #"\s+")]
    {:schedule_day   (cron->day-of-week day-of-week)
     :schedule_frame (cron->day-of-month day-of-month)
     :schedule_hour  (cron->hour hours)
     :schedule_type  (cron->schedule-type hours day-of-month day-of-week)}))
