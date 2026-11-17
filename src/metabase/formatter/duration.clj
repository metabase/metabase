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
  {"minute"      ms-per-minute
   "second"      ms-per-second
   "millisecond" 1})

(def ^:private narrow-units
  [{:unit-ms ms-per-day,    :wrap-ms Long/MAX_VALUE, :label #(tru "{0}d" %)}
   {:unit-ms ms-per-hour,   :wrap-ms ms-per-day,     :label #(tru "{0}h" %)}
   {:unit-ms ms-per-minute, :wrap-ms ms-per-hour,    :label #(tru "{0}m" %)}
   {:unit-ms ms-per-second, :wrap-ms ms-per-minute,  :label #(tru "{0}s" %)}
   {:unit-ms 1,             :wrap-ms ms-per-second,  :label #(tru "{0}ms" %)}])

(def ^:private DurationOptions
  [:map {:closed true}
   [:unit      {:optional true} [:maybe :string]]
   [:style     {:optional true} [:maybe :string]]
   [:precision {:optional true} [:maybe :string]]
   [:decimal   {:optional true} [:maybe char?]]
   [:grouping  {:optional true} [:maybe char?]]])

(defn- precision-ms
  [precision]
  (get precision->ms precision ms-per-second))

(defn- rounded-ms
  "Returns the absolute value of a duration in milliseconds, rounded to the given precision."
  [value unit precision]
  (let [ms   (* (Math/abs (double value)) (double (get unit->ms unit ms-per-second)))
        step (double (precision-ms precision))]
    (Math/round (* (Math/floor (+ (/ ms step) 0.5)) step))))

(defn- format-integer
  [n grouping]
  (str/replace (String/format Locale/US "%,d" (object-array [n])) "," (str grouping)))

(defn- zero-pad
  [n width]
  (String/format Locale/US (str "%0" width "d") (object-array [n])))

(defn- format-digital
  [total-ms precision decimal grouping]
  (let [hours   (format-integer (quot total-ms ms-per-hour) grouping)
        minutes (zero-pad (quot (rem total-ms ms-per-hour) ms-per-minute) 2)
        seconds (zero-pad (quot (rem total-ms ms-per-minute) ms-per-second) 2)
        millis  (zero-pad (rem total-ms ms-per-second) 3)]
    (case precision
      "minute"      (str hours ":" minutes)
      "millisecond" (str hours ":" minutes ":" seconds decimal millis)
      (str hours ":" minutes ":" seconds))))

(defn- format-narrow
  [total-ms precision grouping]
  (str/join " " (for [{:keys [unit-ms wrap-ms label]} narrow-units
                      :let  [n (quot (rem total-ms wrap-ms) unit-ms)]
                      :when (or (pos? n)
                                (and (zero? total-ms) (= unit-ms (precision-ms precision))))]
                  (label (format-integer n grouping)))))

(mu/defn format-duration :- :string
  "Formats `value`, a duration in `unit`, as a string in the given style, rounded to the given precision."
  [value                                           :- number?
   {:keys [unit style precision decimal grouping]} :- DurationOptions]
  (let [total-ms (rounded-ms value unit precision)]
    (str (when (and (neg? value) (pos? total-ms)) "-")
         (if (= style "narrow")
           (format-narrow total-ms precision grouping)
           (format-digital total-ms precision (or decimal \.) grouping)))))

(mu/defn duration-days :- number?
  "Converts `value`, a duration in `unit`, to days, rounded to the given precision."
  [value     :- number?
   unit      :- [:maybe :string]
   precision :- [:maybe :string]]
  (cond-> (/ (double (rounded-ms value unit precision)) ms-per-day)
    (neg? value) -))
