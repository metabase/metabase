(ns metabase.formatter.duration
  "Formats numbers as durations, for the `duration` number style."
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu])
  (:import
   (java.util Locale)))

(set! *warn-on-reflection* true)

(def ^:private ms-per-second 1000)
(def ^:private ms-per-minute (* 60 ms-per-second))
(def ^:private ms-per-hour (* 60 ms-per-minute))
(def ^:private ms-per-day (* 24 ms-per-hour))

(def ^:private unit->ms
  {"nanosecond"  1e-6
   "microsecond" 1e-3
   "millisecond" 1
   "second"      ms-per-second
   "minute"      ms-per-minute
   "hour"        ms-per-hour
   "day"         ms-per-day
   "week"        (* 7 ms-per-day)})

(def ^:private precision->ms
  {"minutes"      ms-per-minute
   "seconds"      ms-per-second
   "milliseconds" 1})

(def ^:private DurationOptions
  [:map {:closed true}
   [:unit      [:maybe :string]]
   [:style     [:maybe :string]]
   [:precision [:maybe :string]]
   [:decimal   [:maybe char?]]
   [:grouping  [:maybe char?]]])

(defn- duration->ms
  [value unit]
  (* (double value) (get unit->ms unit ms-per-second)))

(defn- format-integer
  [n grouping]
  (str/replace (String/format Locale/US "%,d" (object-array [n])) "," (str grouping)))

(defn- zero-pad
  [n width]
  (String/format Locale/US (str "%0" width "d") (object-array [n])))

(defn- format-digital
  [total-ms precision decimal grouping]
  (str (format-integer (quot total-ms ms-per-hour) grouping)
       ":" (zero-pad (quot (rem total-ms ms-per-hour) ms-per-minute) 2)
       (when-not (= precision "minutes")
         (str ":" (zero-pad (quot (rem total-ms ms-per-minute) ms-per-second) 2)))
       (when (= precision "milliseconds")
         (str decimal (zero-pad (rem total-ms ms-per-second) 3)))))

(defn- format-narrow
  [total-ms precision grouping]
  (let [days    (quot total-ms ms-per-day)
        hours   (quot (rem total-ms ms-per-day) ms-per-hour)
        minutes (quot (rem total-ms ms-per-hour) ms-per-minute)
        seconds (quot (rem total-ms ms-per-minute) ms-per-second)
        millis  (rem total-ms ms-per-second)
        parts   (cond-> []
                  (pos? days)    (conj (tru "{0}d" (format-integer days grouping)))
                  (pos? hours)   (conj (tru "{0}h" hours))
                  (pos? minutes) (conj (tru "{0}m" minutes))
                  (pos? seconds) (conj (tru "{0}s" seconds))
                  (pos? millis)  (conj (tru "{0}ms" millis)))]
    (cond
      (seq parts)             (str/join " " parts)
      (= precision "minutes") (tru "{0}m" 0)
      :else                   (tru "{0}s" 0))))

(mu/defn format-duration :- :string
  "Formats `value`, a duration in `unit`, as a string in the given style, rounded to the given precision."
  [value                                           :- number?
   {:keys [unit style precision decimal grouping]} :- DurationOptions]
  (let [precision-ms (get precision->ms precision ms-per-second)
        ms           (duration->ms value unit)
        total-ms     (* (Math/round (/ (Math/abs (double ms)) (double precision-ms))) precision-ms)]
    (str (when (and (neg? ms) (pos? total-ms)) "-")
         (if (= style "narrow")
           (format-narrow total-ms precision grouping)
           (format-digital total-ms precision (or decimal \.) grouping)))))

(mu/defn duration-days :- number?
  "Converts `value`, a duration in `unit`, to days."
  [value :- number?
   unit  :- [:maybe :string]]
  (/ (duration->ms value unit) ms-per-day))
