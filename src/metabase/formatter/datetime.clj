(ns metabase.formatter.datetime
  "Logic for rendering datetimes when context such as timezone, column metadata, and visualization settings are known."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.public-settings :as public-settings]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]])
  (:import
   (com.ibm.icu.text RuleBasedNumberFormat)
   (java.time.format DateTimeFormatter)
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
  [col viz-settings]
  (let [[_ field-id]    (:field_ref col)
        all-cols-settings (-> viz-settings
                              ::mb.viz/column-settings
                              ;; update the keys so that they will have only the :field-id or :column-name
                              ;; and not have any metadata. Since we don't know the metadata, we can never
                              ;; match a key with metadata, even if we do have the correct name or id
                              (update-keys #(select-keys % [::mb.viz/field-id ::mb.viz/column-name])))]
    (or (all-cols-settings {::mb.viz/field-id field-id})
        (all-cols-settings {::mb.viz/column-name field-id}))))

(defn format-temporal-str
  "Reformat a temporal literal string `s` (i.e., an ISO-8601 string) with a human-friendly format based on the
  column `:unit`."
  ([timezone-id s col] (format-temporal-str timezone-id s col {}))
  ([timezone-id s {:keys [effective_type base_type] :as col} viz-settings]
   (Locale/setDefault (Locale. (public-settings/site-locale)))
   (cond
     (str/blank? s) ""

     (isa? (or effective_type base_type) :type/DateTime)
     (t/format DateTimeFormatter/ISO_LOCAL_DATE_TIME (u.date/parse s timezone-id))

     (isa? (or effective_type base_type) :type/Time)
     (t/format DateTimeFormatter/ISO_LOCAL_TIME (u.date/parse s timezone-id))

     :else
     (let [col-viz-settings             (viz-settings-for-col col viz-settings)
           {date-style     :date-style
            abbreviate     :date-abbreviate
            date-separator :date-separator
            time-style     :time-style} (if (seq col-viz-settings)
                                          (-> col-viz-settings
                                              (update-keys (comp keyword name)))
                                          (-> (:type/Temporal (public-settings/custom-formatting))
                                              (update-keys (fn [k] (-> k name (str/replace #"_" "-") keyword)))))
           post-process-date-style      (fn [date-style]
                                          (let [conditional-changes
                                                (cond-> (-> date-style (str/replace #"dddd" "EEEE"))
                                                  date-separator (str/replace #"/" date-separator)
                                                  abbreviate     (-> (str/replace #"MMMM" "MMM")
                                                                     (str/replace #"EEEE" "EEE")
                                                                     (str/replace #"DDD" "D")))]
                                            (-> conditional-changes
                                                ;; 'D' formats as Day of year, we want Day of month, which is  'd' (issue #27469)
                                                (str/replace #"D" "d"))))]
       (case (:unit col)
         ;; these types have special formatting
         :minute  (reformat-temporal-str timezone-id s
                                         (-> (or date-style "MMMM, yyyy")
                                             (str ", " (str/replace (or time-style "h:mm a") #"A" "a"))
                                             post-process-date-style))
         :hour    (reformat-temporal-str timezone-id s
                                         (-> (or date-style "MMMM, yyyy")
                                             (str ", " (str/replace (or time-style "h a") #"A" "a"))
                                             post-process-date-style))
         :day     (reformat-temporal-str timezone-id s
                                         (-> (or date-style "EEEE, MMMM d, YYYY")
                                             post-process-date-style))
         :week    (str (tru "Week ") (reformat-temporal-str timezone-id s "w - YYYY"))
         :month   (reformat-temporal-str timezone-id s
                                         (-> (or date-style "MMMM, yyyy")
                                             post-process-date-style))
         :quarter (reformat-temporal-str timezone-id s "QQQ - yyyy")
         :year    (reformat-temporal-str timezone-id s "YYYY")

         ;; s is just a number as a string here
         :day-of-week     (day-of-week (parse-long s) abbreviate)
         :month-of-year   (month-of-year (parse-long s) abbreviate)
         :quarter-of-year (format "Q%s" s)
         :hour-of-day     (hour-of-day s (str/replace (or time-style "h a") #"A" "a"))

         (:week-of-year :minute-of-hour :day-of-month :day-of-year) (x-of-y (parse-long s))

         ;; for everything else return in this format
         (reformat-temporal-str timezone-id s (-> (or date-style "MMMM d, yyyy")
                                                  post-process-date-style)))))))
