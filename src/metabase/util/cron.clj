(ns metabase.util.cron
  "Utility functions for converting frontend schedule dictionaries to cron strings and vice versa.
   See http://www.quartz-scheduler.org/documentation/quartz-2.x/tutorials/crontrigger.html#format for details on cron
   format."
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (net.redhogs.cronparser CronExpressionDescriptor)
   (org.quartz CronExpression)))

(set! *warn-on-reflection* true)

(mr/def ::CronScheduleString
  (mu/with-api-error-message
   [:and
    ms/NonBlankString
    [:fn
     {:error/fn (fn [{:keys [value]} _]
                  (try
                    (CronExpression/validateExpression value)
                    (catch Throwable e
                      (str "Invalid cron schedule string: " (.getMessage e)))))}
     (fn [^String s]
       (try
         (CronExpression/validateExpression s)
         true
         (catch Throwable _
           false)))]]
   (i18n/deferred-tru "value must be a valid Quartz cron schedule string.")))

(def CronScheduleString
  "Malli Schema for a valid cron schedule string."
  [:ref ::CronScheduleString])

(mr/def ::CronHour
  [:int {:min 0, :max 23}])

(mr/def ::CronMinute
  [:int {:min 0, :max 59}])

(mr/def ::ScheduleMap
  (mu/with-api-error-message
   [:map
    {:error/message "Expanded schedule map"}
    [:schedule_type                    [:enum "hourly" "daily" "weekly" "monthly"]]
    [:schedule_day    {:optional true} [:maybe [:enum "sun" "mon" "tue" "wed" "thu" "fri" "sat"]]]
    [:schedule_frame  {:optional true} [:maybe [:enum "first" "mid" "last"]]]
    [:schedule_hour   {:optional true} [:maybe ::CronHour]]
    [:schedule_minute {:optional true} [:maybe ::CronMinute]]]
   (i18n/deferred-tru "value must be a valid schedule map. See schema in metabase.util.cron for details.")))

(def ScheduleMap
  "Schema for a frontend-parsable schedule map. Used for Pulses and DB scheduling."
  [:ref ::ScheduleMap])


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          SCHEDULE MAP -> CRON STRING                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private cron-string :- CronScheduleString
  "Build a cron string from key-value pair parts."
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
   "tue"  3
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

(mu/defn schedule-map->cron-string :- CronScheduleString
  "Convert the frontend schedule map into a cron string."
  [{day-of-week :schedule_day, hour :schedule_hour, minute :schedule_minute,
    frame :schedule_frame,  schedule-type :schedule_type} :- ScheduleMap]
  (cron-string (case (keyword schedule-type)
                 :hourly  {:minutes minute}
                 :daily   {:hours (or hour 0)}
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

(defn- cron->digit [digit]
  (when (and digit
             (not= digit "*"))
    (Integer/parseInt digit)))

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

(mu/defn ^{:style/indent 0} cron-string->schedule-map :- ScheduleMap
  "Convert a normal `cron-string` into the expanded ScheduleMap format used by the frontend."
  [cron-string :- CronScheduleString]
  (let [[_ mins hours day-of-month _ day-of-week _] (str/split cron-string #"\s+")]
    {:schedule_minute (cron->digit mins)
     :schedule_day    (cron->day-of-week day-of-week)
     :schedule_frame  (cron-day-of-week+day-of-month->frame day-of-week day-of-month)
     :schedule_hour   (cron->digit hours)
     :schedule_type   (cron->schedule-type hours day-of-month day-of-week)}))

(mu/defn describe-cron-string :- ms/NonBlankString
  "Return a human-readable description of a cron expression, localized for the current User."
  [^String cron-string :- CronScheduleString]
  (CronExpressionDescriptor/getDescription cron-string (i18n/user-locale)))
