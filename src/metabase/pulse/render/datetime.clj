(ns metabase.pulse.render.datetime
  "Logic for rendering datetimes inside Pulses."
  (:require [clj-time
             [core :as t]
             [format :as f]]
            [metabase.util
             [date :as du]
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s])
  (:import metabase.util.i18n.UserLocalizedString
           [org.joda.time DateMidnight DateTime DateTimeZone]
           org.joda.time.base.BaseSingleFieldPeriod))

(defn- reformat-timestamp [timezone old-format-timestamp new-format-string]
  (f/unparse (f/with-zone (f/formatter new-format-string)
               (DateTimeZone/forTimeZone timezone))
             (du/str->date-time old-format-timestamp timezone)))

(defn format-timestamp
  "Formats timestamps with human friendly absolute dates based on the column :unit"
  [timezone timestamp col]
  (case (:unit col)
    :hour          (reformat-timestamp timezone timestamp "h a - MMM YYYY")
    :week          (str "Week " (reformat-timestamp timezone timestamp "w - YYYY"))
    :month         (reformat-timestamp timezone timestamp "MMMM YYYY")
    :quarter       (let [timestamp-obj (du/str->date-time timestamp timezone)]
                     (str "Q"
                          (inc (int (/ (t/month timestamp-obj)
                                       3)))
                          " - "
                          (t/year timestamp-obj)))

    ;; TODO: probably shouldn't even be showing sparkline for x-of-y groupings?
    (:year :hour-of-day :day-of-week :week-of-year :month-of-year)
    (str timestamp)

    (reformat-timestamp timezone timestamp "MMM d, YYYY")))


(def ^:private year  (comp t/year  t/now))
(def ^:private month (comp t/month t/now))
(def ^:private day   (comp t/day   t/now))

(def ^:private RenderableInterval
  {:interval-start     DateMidnight
   :interval           BaseSingleFieldPeriod
   :this-interval-name UserLocalizedString
   :last-interval-name UserLocalizedString})

(defmulti ^:private renderable-interval
  {:arglists '([unit])}
  identity)

(defmethod renderable-interval :default [_] nil)

(s/defmethod renderable-interval :day :- RenderableInterval
  [_]
  {:interval-start     (t/date-midnight (year) (month) (day))
   :interval           (t/days 1)
   :this-interval-name (tru "Today")
   :last-interval-name (tru "Yesterday")})

(defn- start-of-this-week []
  (-> (org.joda.time.LocalDate.) .weekOfWeekyear .roundFloorCopy .toDateTimeAtStartOfDay))

(s/defmethod renderable-interval :week :- RenderableInterval
  [_]
  (start-of-this-week)
  (t/weeks 1)
  (tru "This week")
  (tru "Last week"))

(s/defmethod renderable-interval :month :- RenderableInterval
  [_]
  (t/date-midnight (year) (month))
  (t/months 1)
  (tru "This month")
  (tru "Last month"))

(defn- start-of-this-quarter []
  (t/date-midnight (year) (inc (* 3 (Math/floor (/ (dec (month))
                                                   3))))))

(s/defmethod renderable-interval :quarter :- RenderableInterval
  [_]
  (start-of-this-quarter)
  (t/months 3)
  (tru "This quarter")
  (tru "Last quarter"))

(s/defmethod renderable-interval :year :- RenderableInterval
  [_]
  (t/date-midnight (year))
  (t/years 1)
  (tru "This year")
  (tru "Last year"))

(s/defn ^:private date->interval-name :- (s/maybe su/NonBlankString)
  [date :- (s/maybe DateTime), unit :- (s/maybe s/Keyword)]
  (when (and date unit)
    (when-let [{:keys [interval-start interval this-interval-name last-interval-name]} (renderable-interval unit)]
      (condp t/within? date
        (t/interval interval-start (t/plus interval-start interval))
        this-interval-name

        (t/interval (t/minus interval-start interval) interval-start)
        last-interval-name

        nil))))

(s/defn format-timestamp-relative :- (s/maybe su/NonBlankString)
  "Formats timestamps with relative names (today, yesterday, this *, last *) based on column :unit, if possible,
  otherwie returns nil"
  [timezone timestamp {:keys [unit]}]
  (date->interval-name (du/str->date-time timestamp timezone) unit))

(defn format-timestamp-pair
  "Formats a pair of timestamps, using relative formatting for the first timestamps if possible and 'Previous :unit' for
  the second, otherwise absolute timestamps for both"
  [timezone [a b] col]
  (if-let [a' (format-timestamp-relative timezone a col)]
    [a' (str "Previous " (-> col :unit name))]
    [(format-timestamp timezone a col) (format-timestamp timezone b col)]))
