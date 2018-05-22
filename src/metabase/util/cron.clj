(ns metabase.util.cron
  "Utility functions for converting frontend schedule dictionaries to cron strings and vice versa.
   See http://www.quartz-scheduler.org/documentation/quartz-2.x/tutorials/crontrigger.html#format for details on cron
   format."
  (:require [clojure.string :as str]
            [schema.core :as s]
            [metabase.util.schema :as su])
  (:import org.quartz.CronExpression))

(def CronScheduleString
  "Schema for a valid cron schedule string."
  (su/with-api-error-message
      (s/constrained
       su/NonBlankString
       (fn [^String s]
         (try (CronExpression/validateExpression s)
              true
              (catch Throwable _
                false)))
       "Invalid cron schedule string.")
      "value must be a valid Quartz cron schedule string."))


(def ^:private CronHour
  (s/constrained s/Int (fn [n]
                         (and (>= n 0)
                              (<= n 23)))))

(def ScheduleMap
  "Schema for a frontend-parsable schedule map. Used for Pulses and DB scheduling."
  (su/with-api-error-message
      (s/named
       {(s/optional-key :schedule_day)   (s/maybe (s/enum "sun" "mon" "tue" "wed" "thu" "fri" "sat"))
        (s/optional-key :schedule_frame) (s/maybe (s/enum "first" "mid" "last"))
        (s/optional-key :schedule_hour)  (s/maybe CronHour)
        :schedule_type                   (s/enum "hourly" "daily" "weekly" "monthly")}
       "Expanded schedule map")
    "value must be a valid schedule map. See schema in metabase.util.cron for details."))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          SCHEDULE MAP -> CRON STRING                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private cron-string :- CronScheduleString
  "Build a cron string from key-value pair parts."
  {:style/indent 0}
  [{:keys [seconds minutes hours day-of-month month day-of-week year]}]
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
   "tue" 3
   "wed"  4
   "thu"  5
   "fri"  6
   "sat"  7})

(defn- frame->cron [frame day-of-week]
  (if day-of-week
    ;; specific days of week like Mon or Fri
    (assoc {:day-of-month "?"}
      :day-of-week (case frame
                     "first" (str (day-of-week->cron day-of-week) "#1")
                     "last"  (str (day-of-week->cron day-of-week) "L")))
    ;; specific CALENDAR DAYS like 1st or 15th
    (assoc {:day-of-week "?"}
      :day-of-month (case frame
                      "first" "1"
                      "mid"   "15"
                      "last"  "L"))))

(s/defn ^{:style/indent 0} schedule-map->cron-string :- CronScheduleString
  "Convert the frontend schedule map into a cron string."
  [{day-of-week :schedule_day, frame :schedule_frame, hour :schedule_hour, schedule-type :schedule_type} :- ScheduleMap]
  (cron-string (case (keyword schedule-type)
                 :hourly  {}
                 :daily   {:hours hour}
                 :weekly  {:hours       hour
                           :day-of-week (day-of-week->cron day-of-week)
                           :day-of-month "?"}
                 :monthly (assoc (frame->cron frame day-of-week)
                            :hours hour))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          CRON STRING -> SCHEDULE MAP                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- cron->day-of-week [day-of-week]
  (when-let [[_ day-of-week] (re-matches #"(^\d).*$" day-of-week)]
    (case day-of-week
      "1" "sun"
      "2" "mon"
      "3" "tue"
      "4" "wed"
      "5" "thu"
      "6" "fri"
      "7" "sat")))

(defn- cron-day-of-week+day-of-month->frame [day-of-week day-of-month]
  (cond
    (re-matches #"^\d#1$" day-of-week) "first"
    (re-matches #"^\dL$"  day-of-week) "last"
    (= day-of-month "1")               "first"
    (= day-of-month "15")              "mid"
    (= day-of-month "L")               "last"
    :else                              nil))

(defn- cron->hour [hours]
  (when (and hours
             (not= hours "*"))
    (Integer/parseInt hours)))

(defn- cron->schedule-type [hours day-of-month day-of-week]
  (cond
    (and day-of-month
         (not= day-of-month "*")
         (or (= day-of-week "?")
             (re-matches #"^\d#1$" day-of-week)
             (re-matches #"^\dL$"  day-of-week))) "monthly"
    (and day-of-week
         (not= day-of-week "?"))                  "weekly"
    (and hours
         (not= hours "*"))                        "daily"
    :else                                         "hourly"))


(s/defn ^{:style/indent 0} cron-string->schedule-map :- ScheduleMap
  "Convert a normal CRON-STRING into the expanded ScheduleMap format used by the frontend."
  [cron-string :- CronScheduleString]
  (let [[_ _ hours day-of-month _ day-of-week _] (str/split cron-string #"\s+")]
    {:schedule_day   (cron->day-of-week day-of-week)
     :schedule_frame (cron-day-of-week+day-of-month->frame day-of-week day-of-month)
     :schedule_hour  (cron->hour hours)
     :schedule_type  (cron->schedule-type hours day-of-month day-of-week)}))
