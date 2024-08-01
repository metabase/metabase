(ns metabase.formatter.datetime
  "Logic for rendering datetimes when context such as timezone, column metadata, and visualization settings are known."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.streaming.common :as common]
   [metabase.shared.formatting.constants :as constants]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log])
  (:import
   (com.ibm.icu.text RuleBasedNumberFormat)
   (java.util Locale)))

(set! *warn-on-reflection* true)

(defn temporal-string?
  "Returns `true` if the string `s` is parseable as a datetime.

  `(temporal-string? \"asdf\")` -> false
  `(temporal-string? \"2020-02-02\")` -> true"
  [s]
  (boolean
   (try
     (u.date/parse s)
     (catch Exception _e false))))

(defn- reformat-temporal-str [timezone-id s new-format-string]
  (t/format new-format-string (u.date/parse s timezone-id)))

(defn- day-of-week
  [n abbreviate]
  (let [fmtr (java.time.format.DateTimeFormatter/ofPattern (if abbreviate "EEE" "EEEE"))]
    (.format fmtr (java.time.DayOfWeek/of n))))

(defn- month-of-year
  [n abbreviate]
  (let [fmtr (java.time.format.DateTimeFormatter/ofPattern (if abbreviate "MMM" "MMMM"))]
    (.format fmtr (java.time.Month/of n))))

(defn- x-of-y
  "Format an integer as x-th of y, for example, 2nd week of year."
  [n]
  (let [nf (RuleBasedNumberFormat. (Locale. (public-settings/site-locale)) RuleBasedNumberFormat/ORDINAL)]
    (.format nf n)))

(defn- hour-of-day
  [s time-style]
  (let [n  (parse-long s)
        ts (u.date/parse "2022-01-01-00:00:00")]
    (u.date/format time-style (t/plus ts (t/hours n)))))

(defn- viz-settings-for-col
  "Get the column-settings map for the given column from the viz-settings."
  [{column-name :name :keys [field_ref]} viz-settings]
  (let [[_ field-id-or-name] field_ref
        all-cols-settings (-> viz-settings
                              ::mb.viz/column-settings
                              ;; update the keys so that they will have only the :field-id or :column-name
                              ;; and not have any metadata. Since we don't know the metadata, we can never
                              ;; match a key with metadata, even if we do have the correct name or id
                              (update-keys #(select-keys % [::mb.viz/field-id ::mb.viz/column-name])))]
    (or (all-cols-settings {::mb.viz/field-id field-id-or-name})
        (all-cols-settings {::mb.viz/column-name field-id-or-name})
        (all-cols-settings {::mb.viz/column-name column-name}))))

(defn- determine-time-format
  "Given viz-settings with a time-style and possible time-enabled (precision) entry, create the format string.
  Note that if the `:time-enabled` key is present but the value is nil, we explicitly do not show the time."
  [{:keys [time-style] :or {time-style "h:mm A"} :as viz-settings}]
  ;; NOTE - If :time-enabled is present but nil it will return nil
  (when-some [base-time-format (case (get viz-settings :time-enabled "minutes")
                               "minutes" "mm"
                               "seconds" "mm:ss"
                               "milliseconds" "mm:ss.SSS"
                               nil nil)]
    (case time-style
      "HH:mm" (format "HH:%s" base-time-format)
      ;; Deprecated time style which should be already converted to HH:mm when viz settings are
      ;; normalized, but we'll handle it here too just in case. (#18112)
      "k:mm" (str "h" base-time-format)
      ("h:mm A" "h:mm a") (format "h:%s a" base-time-format)
      time-style)))

(defn- fix-time-style
  "The Java pattern for DateTimeFormatter is `a` for AM/PM and `A` for milli-of-day. However, to reconcile formats with
  Moment.js on the FE, we use `h:mm A` to denote AM/PM in our code base. This function replaces time format patterns
  that use the MB 'A' with 'a' so  that DateTimeFormatter properly formats times. We should consider looking into
  `metabase.shared.util.time` to see if we can eliminate this altogether."
  [time-style default-time-style]
  (str/replace (or time-style default-time-style) #"A" "a"))

(defn- post-process-date-style
  "Potentially modify a date style to abbreviate names or add a different date separator."
  [date-style {:keys [date-abbreviate date-separator]}]
  (let [conditional-changes
        (cond-> (-> date-style (str/replace #"dddd" "EEEE"))
          date-separator (str/replace #"/" date-separator)
          date-abbreviate (-> (str/replace #"MMMM" "MMM")
                              (str/replace #"EEEE" "EEE")
                              (str/replace #"DDD" "D")))]
    (-> conditional-changes
        ;; 'D' formats as Day of year, we want Day of month, which is  'd' (issue #27469)
        (str/replace #"D" "d")
        ;; 'YYYY' formats as 'week-based-year', we want 'yyyy' which formats by 'year-of-era'
        ;; aka 'day-based-year'. We likely want that most (all?) of the time.
        ;; 'week-based-year' can report the wrong year on dates near the start/end of a year based on how
        ;; ISO-8601 defines what a week is: some days may end up in the 52nd or 1st week of the wrong year:
        ;; https://stackoverflow.com/a/46395342 provides an explanation.
        (str/replace #"YYYY" "yyyy"))))

(def ^:private col-type
  "The dispatch function logic for format format-timestring.
  Find the first of the unit or highest type of the object."
  (some-fn :unit :semantic_type :effective_type :base_type))

(defmulti format-timestring
"Reformat a temporal literal string to the desired format based on column `:unit`, if provided, then on the column type.
The type is the highest present of semantic, effective, or base type. This is currently expected to be one of:
- `:type/Time` - The hour, minute, second, etc. portion of a day, not anchored to a date
- `:type/Date` - A date without hour and minute information
- `:type/DateTime` - A full date plus hour, minute, seconds, etc.
If neither a unit nor a temporal type is provided, just bottom out by assuming a date.
"
  (fn [_timezone-id _temporal-str col _viz-settings] (col-type col)))

(defmethod format-timestring :minute [timezone-id temporal-str _col {:keys [date-style time-style] :as viz-settings}]
  (reformat-temporal-str timezone-id temporal-str
                         (-> (or date-style "MMMM, yyyy")
                             (str ", " (fix-time-style time-style constants/default-time-style))
                             (post-process-date-style viz-settings))))

(defmethod format-timestring :hour [timezone-id temporal-str _col {:keys [date-style time-style] :as viz-settings}]
  (reformat-temporal-str timezone-id temporal-str
                         (-> (or date-style "MMMM d, yyyy")
                             (str ", " (fix-time-style time-style "h a"))
                             (post-process-date-style viz-settings))))

(defmethod format-timestring :day [timezone-id temporal-str _col {:keys [date-style] :as viz-settings}]
  (reformat-temporal-str timezone-id temporal-str
                         (-> (or date-style "EEEE, MMMM d, YYYY")
                             (post-process-date-style viz-settings))))

(defmethod format-timestring :week [timezone-id temporal-str _col {:keys [date-style] :as viz-settings}]
  (let [date-style (or date-style "MMMM d, YYYY")
        end-temporal-str (-> temporal-str
                             u.date/parse
                             (u.date/add :day 6)
                             u.date/format)]
    (str
     (reformat-temporal-str timezone-id temporal-str (post-process-date-style date-style viz-settings))
     " - "
     (reformat-temporal-str timezone-id end-temporal-str (post-process-date-style date-style viz-settings)))))

(defmethod format-timestring :month [timezone-id temporal-str _col {:keys [date-style] :as viz-settings}]
  (reformat-temporal-str timezone-id temporal-str
                         (-> (or date-style "MMMM, yyyy")
                             (post-process-date-style viz-settings))))

(defmethod format-timestring :quarter [timezone-id temporal-str _col _viz-settings]
  (reformat-temporal-str timezone-id temporal-str "QQQ - yyyy"))

(defmethod format-timestring :year [timezone-id temporal-str _col _viz-settings]
  (reformat-temporal-str timezone-id temporal-str "YYYY"))

(defmethod format-timestring :day-of-week [_timezone-id temporal-str _col {:keys [date-abbreviate]}]
  (day-of-week (parse-long temporal-str) date-abbreviate))

(defmethod format-timestring :month-of-year [_timezone-id temporal-str _col {:keys [date-abbreviate]}]
  (month-of-year (parse-long temporal-str) date-abbreviate))

(defmethod format-timestring :quarter-of-year [_timezone-id temporal-str _col _viz-settings]
  (format "Q%s" temporal-str))

(defmethod format-timestring :hour-of-day [_timezone-id temporal-str _col {:keys [time-style]}]
  (hour-of-day temporal-str (fix-time-style time-style "h a")))

(defmethod format-timestring :week-of-year [_timezone-id temporal-str _col _viz-settings]
  (x-of-y (parse-long temporal-str)))

(defmethod format-timestring :minute-of-hour [_timezone-id temporal-str _col _viz-settings]
  (x-of-y (parse-long temporal-str)))

(defmethod format-timestring :day-of-month [_timezone-id temporal-str _col _viz-settings]
  (x-of-y (parse-long temporal-str)))

(defmethod format-timestring :day-of-year [_timezone-id temporal-str _col _viz-settings]
  (x-of-y (parse-long temporal-str)))

(defmethod format-timestring :type/Time [timezone-id temporal-str _col viz-settings]
  (let [time-style (some-> (determine-time-format viz-settings)
                           (fix-time-style constants/default-time-style))]
    ;; ATM, the FE can technically say the time style is `nil` via the `:time-enabled` key. While this doesn't really
    ;; make sense, we should guard against it by returning an empty string if the time style is `nil`.
    (if time-style
      (reformat-temporal-str timezone-id temporal-str time-style)
      "")))

(defmethod format-timestring :type/Date [timezone-id temporal-str _col {:keys [date-style] :as viz-settings}]
  (let [date-format (post-process-date-style (or date-style "MMMM d, yyyy") viz-settings)]
    (reformat-temporal-str timezone-id temporal-str date-format)))

(defmethod format-timestring :type/DateTime [timezone-id temporal-str _col {:keys [date-style] :as viz-settings}]
  (let [date-style            (or date-style "MMMM d, yyyy")
        time-style            (some-> (determine-time-format viz-settings)
                                      (fix-time-style constants/default-time-style))
        date-time-style       (cond-> date-style
                                time-style
                                (str ", " time-style))
        default-format-string (post-process-date-style date-time-style viz-settings)]
    (t/format default-format-string (u.date/parse temporal-str timezone-id))))

(defmethod format-timestring :default [timezone-id temporal-str {:keys [unit] :as col} {:keys [date-style] :as viz-settings}]
  (if (= :default unit)
    ;; When the unit is the `:default` literal we want to retry formatting with the data types contained in col.
    (format-timestring timezone-id temporal-str (dissoc col :unit) viz-settings)
    ;; We're making an assumption when we bottom out here that the string is compatible with this default format,
    ;; 'MMMM d, yyyy'. If the time string isn't compatible with this format, we just return the string.
    ;; This is not likely to happen IRL since you generally have a useful unit or know the type of the colum. A failure
    ;; mode that can be reproduced in test is trying to format a time string (e.g.'15:30:45Z') when the column has no
    ;; type information (e.g. a semantic or effective type of `:type/Time`).
    (let [date-format (post-process-date-style (or date-style "MMMM d, yyyy") viz-settings)]
      (try
        (reformat-temporal-str timezone-id temporal-str date-format)
        (catch Exception _
          (log/warnf "Could not format temporal string %s in time zone %s with format %s."
                     temporal-str
                     timezone-id
                     date-format)
          temporal-str)))))

(defn format-temporal-str
  "Reformat a temporal literal string by combining time zone, column, and viz setting information to create a final
  desired output format."
  ([timezone-id temporal-str col] (format-temporal-str timezone-id temporal-str col {}))
  ([timezone-id temporal-str col viz-settings]
   (Locale/setDefault (Locale. (public-settings/site-locale)))
   (let [merged-viz-settings (common/normalize-keys
                               (common/viz-settings-for-col col viz-settings))]
     (if (str/blank? temporal-str)
       ""
       (format-timestring timezone-id temporal-str col merged-viz-settings)))))
