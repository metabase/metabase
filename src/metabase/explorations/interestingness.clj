(ns metabase.explorations.interestingness
  "Bridge between the explorations worker and `metabase.interestingness.core`.

  Most `:model/ExplorationQuery` rows are a single breakout dimension by one aggregation, so
  their QP result has two columns: the dim and the measure. The time-faceted variant additionally
  carries a categorical-vs-temporal pair of breakouts → three columns, rendered as a multi-series
  line chart. This namespace normalizes either shape into the `chart-config` consumed by
  `metabase.interestingness.chart/chart-interestingness`."
  (:require
   [clojure.string :as str]
   [metabase.types.core]
   [metabase.util.i18n :as i18n])
  (:import
   (java.time DayOfWeek LocalTime Month)
   (java.time.format DateTimeFormatter FormatStyle TextStyle)))

(set! *warn-on-reflection* true)

(def ^:private extraction-units
  #{:day-of-week :hour-of-day :month-of-year :quarter-of-year
    :day-of-month :day-of-year :week-of-year :minute-of-hour})

(defn- col-extraction-unit
  "The extraction temporal-unit on `col`'s field_ref (e.g. :day-of-week), or nil."
  [col]
  (let [fr (:field_ref col)
        u  (when (sequential? fr)
             (some #(when (map? %) (or (:temporal-unit %) (get % "temporal-unit"))) fr))]
    (when-let [k (some-> u keyword)]
      (extraction-units k))))

(defn- start-of-week-day ^DayOfWeek []
  (-> ((requiring-resolve 'metabase.settings.core/get) :start-of-week)
      (or :sunday)
      name
      (str/upper-case)
      (DayOfWeek/valueOf)))

(defn- extraction-label
  "Humanize an extraction-unit breakout value in the current user's locale (via
  [[metabase.util.i18n/user-locale]], the same accessor the formatter uses): weekday name for
  :day-of-week (honoring the `start-of-week` setting), month name for :month-of-year, a
  localized short time for :hour-of-day; anything else (and any failure) falls back to the raw
  value stringified."
  [unit v]
  (try
    (let [n   (long (double v))
          loc (i18n/user-locale)]
      (case unit
        :day-of-week   (.getDisplayName (.plus (start-of-week-day) (long (dec n))) TextStyle/FULL loc)
        :month-of-year (.getDisplayName (Month/of (int n)) TextStyle/FULL loc)
        :hour-of-day   (.format (.withLocale (DateTimeFormatter/ofLocalizedTime FormatStyle/SHORT) loc)
                                (LocalTime/of (int n) 0))
        (str v)))
    (catch Throwable _ (str v))))

(defn- col->chart-type
  [col]
  (let [t (or (some-> (:effective_type col) keyword)
              (some-> (:base_type col) keyword))]
    (cond
      (nil? t)                "string"
      (isa? t :type/DateTime) "datetime"
      (isa? t :type/Date)     "date"
      (isa? t :type/Time)     "time"
      (isa? t :type/Boolean)  "boolean"
      (isa? t :type/Number)   "number"
      :else                   "string")))

(defn- numeric-col?
  [col]
  (some-> (or (:effective_type col) (:base_type col)) keyword (isa? :type/Number)))

(defn- temporal-col?
  [col]
  (some-> (or (:effective_type col) (:base_type col)) keyword (isa? :type/Temporal)))

(defn- pick-indices
  "Pick column roles given 2 or 3 result columns.

    - 2 cols → `{:dim-idx <i> :metric-idx <i>}`
    - 3 cols → `{:dim-idx <temporal-idx> :metric-idx <numeric-idx> :series-idx <remaining-idx>}`

  Returns nil when no numeric column exists, or — for 3 cols — when no temporal column exists."
  [cols]
  (let [n          (count cols)
        metric-idx (first (keep-indexed (fn [i c] (when (numeric-col? c) i)) cols))]
    (when metric-idx
      (case n
        ;; An extraction-unit column (day-of-week, hour-of-day, …) is an integer position, so
        ;; it's numeric too — pin it as the dimension so the real measure stays the metric and
        ;; the axes don't swap. Otherwise the lone numeric column is the metric.
        2 (let [extr-idx (first (keep-indexed (fn [i c] (when (col-extraction-unit c) i)) cols))]
            (if (and extr-idx (numeric-col? (nth cols (- 1 extr-idx))))
              {:dim-idx extr-idx :metric-idx (- 1 extr-idx)}
              {:dim-idx (- 1 metric-idx) :metric-idx metric-idx}))
        3 (let [temporal-idx (first (keep-indexed
                                     (fn [i c]
                                       (when (and (not= i metric-idx) (temporal-col? c)) i))
                                     cols))
                series-idx   (first (filter #(and (not= % metric-idx)
                                                  (not= % temporal-idx))
                                            (range n)))]
            (when (and temporal-idx series-idx)
              {:dim-idx temporal-idx :metric-idx metric-idx :series-idx series-idx}))
        nil))))

(defn- pair-filter
  "Drop rows whose metric value isn't a number; preserve x/y alignment."
  [rows dim-idx metric-idx]
  (let [pairs (keep (fn [r]
                      (let [y (nth r metric-idx nil)]
                        (when (number? y)
                          [(nth r dim-idx nil) y])))
                    rows)]
    [(mapv first pairs) (mapv second pairs)]))

(defn- effective-display-type
  "If the query's `:display` is nil or one of the chart-less display types,
  pick a default based on the dimension's chart-type so the scorer doesn't see
  `:unknown`."
  [display dim-chart-type]
  (if (or (nil? display) (#{"table" "scalar" "smartscalar"} display))
    (if (#{"datetime" "date" "time"} dim-chart-type) "line" "bar")
    display))

(defn- two-col-chart-config
  [exploration-query cols rows dim-idx metric-idx]
  (let [dim-col             (nth cols dim-idx)
        metric-col          (nth cols metric-idx)
        extr                (col-extraction-unit dim-col)
        dim-chart-type      (if extr "string" (col->chart-type dim-col))
        [x-values0 y-values] (pair-filter rows dim-idx metric-idx)
        x-values            (if extr (mapv #(extraction-label extr %) x-values0) x-values0)]
    (when (seq y-values)
      (let [series-name (or (:display_name metric-col) (:name metric-col) "value")]
        {:display_type (effective-display-type (:display exploration-query) dim-chart-type)
         :title        (:name exploration-query)
         :series       {series-name
                        {:x            {:name (or (:display_name dim-col) (:name dim-col))
                                        :type dim-chart-type}
                         :y            {:name series-name
                                        :type "number"}
                         :x_values     x-values
                         :y_values     y-values
                         :display_name series-name}}}))))

(defn- three-col-chart-config
  "Build a multi-series line chart-config: one series per distinct categorical value, x = temporal
  breakout, y = metric. Categorical nulls collapse to `\"(empty)\"`; non-string values are
  stringified to satisfy the `:map-of :string ::series-config` schema."
  [exploration-query cols rows dim-idx metric-idx series-idx]
  (let [dim-col        (nth cols dim-idx)
        metric-col     (nth cols metric-idx)
        dim-chart-type (col->chart-type dim-col)
        metric-name    (or (:display_name metric-col) (:name metric-col) "value")
        x-meta         {:name (or (:display_name dim-col) (:name dim-col))
                        :type dim-chart-type}
        y-meta         {:name metric-name :type "number"}
        grouped        (->> rows
                            (keep (fn [r]
                                    (let [y (nth r metric-idx nil)]
                                      (when (number? y)
                                        (let [series-val (nth r series-idx nil)]
                                          [(if (nil? series-val) "(empty)" (str series-val))
                                           (nth r dim-idx nil)
                                           y])))))
                            (group-by first))]
    (when (seq grouped)
      {:display_type "line"
       :title        (:name exploration-query)
       :series       (into {}
                           (map (fn [[series-key triples]]
                                  [series-key
                                   {:x            x-meta
                                    :y            y-meta
                                    :x_values     (mapv #(nth % 1) triples)
                                    :y_values     (mapv #(nth % 2) triples)
                                    :display_name series-key}]))
                           grouped)})))

(defn qp-result->chart-config
  "Build a `metabase.interestingness.chart.types/chart-config` from an `:model/ExplorationQuery`
  row and its in-memory QP result. Returns nil when the result can't be scored: no rows, no
  numeric column, fewer than two cols, or — for the 3-col faceted shape — no temporal column."
  [exploration-query qp-result]
  (let [cols (get-in qp-result [:data :cols])
        rows (get-in qp-result [:data :rows])]
    (when (and (#{2 3} (count cols)) (seq rows))
      (when-let [{:keys [dim-idx metric-idx series-idx]} (pick-indices cols)]
        (case (count cols)
          2 (two-col-chart-config exploration-query cols rows dim-idx metric-idx)
          3 (three-col-chart-config exploration-query cols rows dim-idx metric-idx series-idx))))))
