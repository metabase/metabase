(ns metabase.pulse.render.datetime
  "Logic for rendering datetimes inside Pulses."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.public-settings :as public-settings]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import com.ibm.icu.text.RuleBasedNumberFormat
           java.time.format.DateTimeFormatter
           java.time.Period
           java.time.temporal.Temporal
           java.util.Locale))

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

(defn format-temporal-str
  "Reformat a temporal literal string `s` (i.e., an ISO-8601 string) with a human-friendly format based on the
  column `:unit`."
  ([timezone-id s col] (format-temporal-str timezone-id s col {}))
  ([timezone-id s col col-viz-settings]
   (Locale/setDefault (Locale. (public-settings/site-locale)))
   (let [{date-style :date_style
          abbreviate :date_abbreviate
          time-style :time_style} col-viz-settings]
     (cond (str/blank? s) ""

           (isa? (or (:effective_type col) (:base_type col)) :type/Time)
           (t/format DateTimeFormatter/ISO_LOCAL_TIME (u.date/parse s timezone-id))

           :else
           (case (:unit col)
             ;; these types have special formatting
             :minute  (reformat-temporal-str timezone-id s
                                             (str (or date-style "MMMM, yyyy") ", "
                                                  (str/replace (or time-style "h:mm a") #"A" "a")))
             :hour    (reformat-temporal-str timezone-id s
                                             (str (or date-style "MMMM, yyyy") ", "
                                                  (str/replace (or time-style "h a") #"A" "a")))
             :day     (reformat-temporal-str timezone-id s (or date-style "EEEE, MMMM d, YYYY"))
             :week    (str (tru "Week ") (reformat-temporal-str timezone-id s "w - YYYY"))
             :month   (reformat-temporal-str timezone-id s (or date-style "MMMM, yyyy"))
             :quarter (reformat-temporal-str timezone-id s "QQQ - yyyy")
             :year    (reformat-temporal-str timezone-id s "YYYY")

             ;; s is just a number as a string here
             :day-of-week     (day-of-week (parse-long s) abbreviate)
             :month-of-year   (month-of-year (parse-long s) abbreviate)
             :quarter-of-year (format "Q%s" s)
             :hour-of-day     (hour-of-day s (str/replace (or time-style "h a") #"A" "a"))

             (:week-of-year :minute-of-hour :day-of-month :day-of-year) (x-of-y (parse-long s))
             ;; TODO: probably shouldn't even be showing sparkline for x-of-y groupings?

             ;; for everything else return in this format
             (reformat-temporal-str timezone-id s "MMM d, yyyy"))))))

(def ^:private RenderableInterval
  {:interval-start     Temporal
   :interval           Period
   :this-interval-name su/NonBlankString
   :last-interval-name su/NonBlankString})

(defmulti ^:private renderable-interval
  {:arglists '([unit])}
  identity)

(defmethod renderable-interval :default [_] nil)

(s/defmethod renderable-interval :day :- RenderableInterval
  [_]
  {:interval-start     (u.date/truncate :day)
   :interval           (t/days 1)
   :this-interval-name (tru "Today")
   :last-interval-name (tru "Yesterday")})

(defn- start-of-this-week []
  (u.date/truncate :week))

(s/defmethod renderable-interval :week :- RenderableInterval
  [_]
  {:interval-start     (start-of-this-week)
   :interval           (t/weeks 1)
   :this-interval-name (tru "This week")
   :last-interval-name (tru "Last week")})

(s/defmethod renderable-interval :month :- RenderableInterval
  [_]
  {:interval-start     (u.date/truncate :month)
   :interval           (t/months 1)
   :this-interval-name (tru "This month")
   :last-interval-name (tru "Last month")})

(s/defmethod renderable-interval :quarter :- RenderableInterval
  [_]
  {:interval-start     (u.date/truncate :quarter)
   :interval           (t/months 3)
   :this-interval-name (tru "This quarter")
   :last-interval-name (tru "Last quarter")})

(s/defmethod renderable-interval :year :- RenderableInterval
  [_]
  {:interval-start     (u.date/truncate :year)
   :interval           (t/years 1)
   :this-interval-name (tru "This year")
   :last-interval-name (tru "Last year")})

(s/defn ^:private date->interval-name :- (s/maybe su/NonBlankString)
  [t :- (s/maybe Temporal), unit :- (s/maybe s/Keyword)]
  (when (and t unit)
    (when-let [{:keys [interval-start interval this-interval-name last-interval-name]} (renderable-interval unit)]
      (condp t/contains? t
        (t/interval interval-start (t/plus interval-start interval))
        this-interval-name

        (t/interval (t/minus interval-start interval) interval-start)
        last-interval-name

        nil))))

(s/defn format-temporal-str-relative :- (s/maybe su/NonBlankString)
  "Formats timestamps with relative names (today, yesterday, this *, last *) based on column :unit, if possible,
  otherwie returns nil"
  [timezone-id s {:keys [unit]}]
  (date->interval-name (u.date/parse s timezone-id) unit))

(defn format-temporal-string-pair
  "Formats a pair of temporal string literals (i.e., ISO-8601 strings) using relative formatting for the first
  temporal values if possible, and 'Previous :unit' for the second; otherwise absolute instants in time for both."
  [timezone-id [a b] col]
  {:pre [((some-fn nil? string?) timezone-id)]}
  (try
    (if-let [a' (format-temporal-str-relative timezone-id a col)]
      [a' (tru "Previous {0}" (-> col :unit name))]
      [(format-temporal-str timezone-id a col) (format-temporal-str timezone-id b col)])
    (catch Throwable _
      ;; TODO  - there is code that calls this in `render.body` regardless of the types of values
      (log/warn (trs "FIXME: These aren''t valid temporal literals: {0} {1}. Why are we attempting to format them as such?"
                     (pr-str a) (pr-str b)))
      nil)))
