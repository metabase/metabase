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
  (:import [org.joda.time DateTime DateTimeZone]
           [org.joda.time.base BaseDateTime BaseSingleFieldPeriod]))

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


(defn- year  [] (t/year  (t/now)))
(defn- month [] (t/month (t/now)))
(defn- day   [] (t/day   (t/now)))

(def ^:private RenderableInterval
  {:interval-start     BaseDateTime
   :interval           BaseSingleFieldPeriod
   :this-interval-name su/NonBlankString
   :last-interval-name su/NonBlankString})

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
  (-> (org.joda.time.LocalDate. (t/now)) .weekOfWeekyear .roundFloorCopy .toDateTimeAtStartOfDay))

(s/defmethod renderable-interval :week :- RenderableInterval
  [_]
  {:interval-start     (start-of-this-week)
   :interval           (t/weeks 1)
   :this-interval-name (tru "This week")
   :last-interval-name (tru "Last week")})

(s/defmethod renderable-interval :month :- RenderableInterval
  [_]
  {:interval-start     (t/date-midnight (year) (month))
   :interval           (t/months 1)
   :this-interval-name (tru "This month")
   :last-interval-name (tru "Last month")})

(defn- start-of-this-quarter []
  (t/date-midnight (year) (inc (* 3 (Math/floor (/ (dec (month))
                                                   3))))))
(s/defmethod renderable-interval :quarter :- RenderableInterval
  [_]
  {:interval-start     (start-of-this-quarter)
   :interval           (t/months 3)
   :this-interval-name (tru "This quarter")
   :last-interval-name (tru "Last quarter")})

(s/defmethod renderable-interval :year :- RenderableInterval
  [_]
  {:interval-start     (t/date-midnight (year))
   :interval           (t/years 1)
   :this-interval-name (tru "This year")
   :last-interval-name (tru "Last year")})

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
  [timezone timestamp-str {:keys [unit]}]
  (date->interval-name (du/str->date-time timestamp-str timezone) unit))

(defn format-timestamp-pair
  "Formats a pair of timestamps, using relative formatting for the first timestamps if possible and 'Previous :unit' for
  the second, otherwise absolute timestamps for both"
  [timezone [a b] col]
  (if-let [a' (format-timestamp-relative timezone a col)]
    [a' (str "Previous " (-> col :unit name))]
    [(format-timestamp timezone a col) (format-timestamp timezone b col)]))
