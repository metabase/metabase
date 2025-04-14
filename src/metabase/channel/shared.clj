(ns metabase.channel.shared
  "Shared functions for channel implementations."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr])
  (:import
   (net.redhogs.cronparser CronExpressionDescriptor Options)))

(set! *warn-on-reflection* true)

(defn validate-channel-details
  "Validate a value against a schema and throw an exception if it's invalid.
  The :errors key are used on the UI to display field-specific error messages."
  [schema value]
  (when-let [errors (some-> (mr/explain schema value)
                            me/humanize)]
    (throw (ex-info (tru "Invalid channel details") {:errors errors}))))

(defn- maybe-deref
  [x]
  (if (instance? clojure.lang.IDeref x)
    @x
    x))

(defn maybe-realize-data-rows
  "Realize the data rows in a [[metabase.notification.payload.execute/Part]]"
  [part]
  (when part
    (m/update-existing-in part [:result :data :rows] maybe-deref)))

(defn- schedule-timezone
  []
  (or (driver/report-timezone) "UTC"))

(defn- format-time
  "Format hour and minute into a 12-hour time string with AM/PM."
  [hour minute]
  (let [hour-12 (cond
                  (zero? hour) 12
                  (> hour 12) (- hour 12)
                  :else hour)
        am-pm (if (< hour 12) "AM" "PM")]
    (if-not (zero? minute)
      (format "%d:%02d %s" hour-12 minute am-pm)
      (format "%d %s" hour-12 am-pm))))

(defn- cron-description
  [cron-string]
  (try
    (let [s (CronExpressionDescriptor/getDescription ^String cron-string
                                                     (doto (Options.)
                                                       (.setZeroBasedDayOfWeek false)))
          s (str (u/lower-case-en (subs s 0 1))
                 (subs s 1))]
      (format "Run %s %s" s (schedule-timezone)))
    (catch Exception e
      (log/errorf e "Failed to parse cron expression: %s" cron-string)
      nil)))

(defn friendly-cron-description
  "Convert a cron string to a human-readable description."
  [cron-string]
  (let [[seconds minutes hours day-of-month month day-of-week year] (str/split cron-string #"\s+")
        timezone (schedule-timezone)]
    (cond
      ;; Hourly pattern
      (and
       (= seconds "0")
       (= minutes "0")
       (= hours "*")
       (or (nil? year) (= year "*"))
       (not= day-of-month "?")
       (not= month "?"))
      (format "Run hourly %s" timezone)

      ;; Hourly pattern with specific minutes
      (and
       (= seconds "0")
       (re-matches #"\d+" minutes)
       (= hours "*")
       (or (nil? year) (= year "*"))
       (not= day-of-month "?")
       (not= month "?"))
      (format "Run hourly at %d minutes past the hour %s"
              (Integer/parseInt minutes)
              timezone)

      ;; Daily pattern
      (and
       (= seconds "0")
       (re-matches #"\d+" minutes)
       (re-matches #"\d+" hours)
       (or (nil? year) (= year "*"))
       (= day-of-month "*")
       (= month "*"))
      (format "Run daily at %s %s"
              (format-time (Integer/parseInt hours) (Integer/parseInt minutes))
              timezone)

      ;; Weekly pattern
      (and
       (= seconds "0")
       (re-matches #"\d+" minutes)
       (re-matches #"\d+" hours)
       (or (nil? year) (= year "*"))
       (= day-of-month "?")
       (= month "*")
       (re-matches #"\d+" day-of-week))
      (let [day-name (["Sunday" "Monday" "Tuesday" "Wednesday" "Thursday" "Friday" "Saturday"]
                      (dec (Integer/parseInt day-of-week)))]
        (format "Run weekly on %s at %s %s"
                day-name
                (format-time (Integer/parseInt hours) (Integer/parseInt minutes))
                timezone))

      ;; Default case
      :else
      (cron-description cron-string))))
