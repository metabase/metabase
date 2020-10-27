(ns metabase.pulse.render.datetime
  "Logic for rendering datetimes inside Pulses."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [trs tru]]
             [schema :as su]]
            [schema.core :as s])
  (:import java.time.Period
           java.time.temporal.Temporal))

(defn- reformat-temporal-str [timezone-id s new-format-string]
  (t/format new-format-string (u.date/parse s timezone-id)))

(defn format-temporal-str
  "Reformat a temporal literal string `s` (i.e., an ISO-8601 string) with a human-friendly format based on the
  column `:unit`."
  [timezone-id s col]
  (if (str/blank? s)
    ""
    (case (:unit col)
      ;; these types have special formatting
      :hour    (reformat-temporal-str timezone-id s "h a - MMM yyyy")
      :week    (str "Week " (reformat-temporal-str timezone-id s "w - YYYY"))
      :month   (reformat-temporal-str timezone-id s "MMMM yyyy")
      :quarter (reformat-temporal-str timezone-id s "QQQ - yyyy")

      ;; no special formatting here : return as ISO-8601
      ;; TODO: probably shouldn't even be showing sparkline for x-of-y groupings?
      (:year :hour-of-day :day-of-week :week-of-year :month-of-year)
      s

      ;; for everything else return in this format
      (reformat-temporal-str timezone-id s "MMM d, yyyy"))))

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
