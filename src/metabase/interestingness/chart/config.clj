(ns metabase.interestingness.chart.config
  "Build a `chart-config` (see [[metabase.interestingness.chart.types]]) from a query result, so
  the interestingness engine can compute stats for anything that ran a query.

  Most scorable results are a single breakout dimension by one aggregation, so they have two
  columns: the dim and the measure. A time-faceted variant additionally carries a
  categorical-vs-temporal pair of breakouts → three columns, rendered as a multi-series line
  chart. This namespace normalizes either shape; anything else is not scorable and yields nil."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.types.core]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n])
  (:import
   (java.time DayOfWeek LocalTime Month)
   (java.time.format DateTimeFormatter FormatStyle TextStyle)))

(set! *warn-on-reflection* true)

(def ^:private extraction-units
  #{:day-of-week :hour-of-day :month-of-year :quarter-of-year
    :day-of-month :day-of-year :week-of-year :minute-of-hour})

(defn- col-extraction-unit
  "The extraction temporal-unit on a Lib column (e.g. `:day-of-week`), or nil for truncation
  buckets and untyped columns."
  [lib-col]
  (extraction-units (lib/raw-temporal-bucket lib-col)))

(defn- start-of-week-day ^DayOfWeek []
  (-> (lib-be/start-of-week)
      (or :sunday)
      name
      (u/upper-case-en)
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
  "Coarse chart-axis type for a Lib column, in the vocabulary the chart-config schema expects."
  [lib-col]
  (cond
    (lib.types.isa/date-with-time? lib-col)    "datetime"
    (lib.types.isa/date-without-time? lib-col) "date"
    (lib.types.isa/time? lib-col)              "time"
    (lib.types.isa/temporal? lib-col)          "datetime"
    (lib.types.isa/boolean? lib-col)           "boolean"
    (lib.types.isa/numeric? lib-col)           "number"
    :else                                      "string"))

(defn- pick-3-col-indices
  "Resolve `{:dim-idx :metric-idx :series-idx}` for a 3-col faceted result, given the already-picked
  `metric-idx`. Returns nil when no temporal column exists for the dim axis."
  [lib-cols metric-idx]
  (let [temporal-idx (first (keep-indexed
                             (fn [i c]
                               (when (and (not= i metric-idx) (lib.types.isa/temporal? c)) i))
                             lib-cols))
        series-idx   (first (filter #(and (not= % metric-idx)
                                          (not= % temporal-idx))
                                    (range (count lib-cols))))]
    (when (and temporal-idx series-idx)
      {:dim-idx temporal-idx :metric-idx metric-idx :series-idx series-idx})))

(defn- metric-col-idx
  "Index of the column to treat as the metric: the aggregation column (`:lib/source
  :source/aggregations`), or — when the columns carry no source metadata — the *last* numeric column.

  Not the *first* numeric column: QP results order breakouts (dimensions) before aggregations, so a
  numeric dimension (a binned or plain-numeric breakout, or an integer extraction like day-of-week)
  sits at a lower index than the measure. Picking the first numeric column would mistake that
  dimension for the metric and transpose the chart's axes. The aggregation is always last, so
  last-numeric is the right fallback. Returns nil when there is no numeric/aggregation column."
  [lib-cols]
  (or (first (keep-indexed (fn [i c] (when (= :source/aggregations (:lib/source c)) i)) lib-cols))
      (last (keep-indexed (fn [i c] (when (lib.types.isa/numeric? c) i)) lib-cols))))

(defn- pick-indices
  "Pick column roles given 2 or 3 result columns.

    - 2 cols → `{:dim-idx <i> :metric-idx <i>}`
    - 3 cols → `{:dim-idx <temporal-idx> :metric-idx <aggregation-idx> :series-idx <remaining-idx>}`

  The metric is chosen by [[metric-col-idx]] (aggregation column, else last numeric) so a numeric
  dimension is never mistaken for the measure. Returns nil when no metric column exists, or — for 3
  cols — when no temporal column exists."
  [lib-cols]
  (when-let [metric-idx (metric-col-idx lib-cols)]
    (case (count lib-cols)
      2 {:dim-idx (- 1 metric-idx) :metric-idx metric-idx}
      3 (pick-3-col-indices lib-cols metric-idx)
      nil)))

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
  `:unknown`. `display` may be a keyword, as it is on a Card."
  [display dim-chart-type]
  (let [display (some-> display name)]
    (if (or (nil? display) (#{"table" "scalar" "smartscalar"} display))
      (if (#{"datetime" "date" "time"} dim-chart-type) "line" "bar")
      display)))

(defn- col-name
  "Human-facing name for a Lib column — display-name when present, otherwise the raw name,
  otherwise a literal fallback."
  [lib-col]
  (or (:display-name lib-col) (:name lib-col) "value"))

(defn- two-col-chart-config
  [chart-source lib-cols rows dim-idx metric-idx]
  (let [dim-col              (nth lib-cols dim-idx)
        metric-col           (nth lib-cols metric-idx)
        extr                 (col-extraction-unit dim-col)
        dim-chart-type       (if extr "string" (col->chart-type dim-col))
        [x-values0 y-values] (pair-filter rows dim-idx metric-idx)
        x-values             (if extr (mapv #(extraction-label extr %) x-values0) x-values0)]
    (when (seq y-values)
      (let [series-name (col-name metric-col)]
        {:display_type (effective-display-type (:display chart-source) dim-chart-type)
         :title        (:name chart-source)
         :series       {series-name
                        {:x            {:name (col-name dim-col)
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
  [chart-source lib-cols rows dim-idx metric-idx series-idx]
  (let [dim-col        (nth lib-cols dim-idx)
        metric-col     (nth lib-cols metric-idx)
        dim-chart-type (col->chart-type dim-col)
        metric-name    (col-name metric-col)
        x-meta         {:name (col-name dim-col) :type dim-chart-type}
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
       :title        (:name chart-source)
       :series       (into {}
                           (map (fn [[series-key triples]]
                                  [series-key
                                   {:x            x-meta
                                    :y            y-meta
                                    :x_values     (mapv #(nth % 1) triples)
                                    :y_values     (mapv #(nth % 2) triples)
                                    :display_name series-key}]))
                           grouped)})))

(defn chart-config
  "Build a `metabase.interestingness.chart.types/chart-config` from `chart-source` (a map with the
  `:display` and `:name` of the thing that ran the query, such as a Card or an exploration query),
  its Lib columns, and the QP-result rows. Returns nil when the result can't be scored: fewer than
  two cols, no numeric column, or — for the 3-col faceted shape — no temporal column.

  `lib-cols` should be authentic Lib columns in production: `lib/returned-columns` of the query,
  or the QP result's `:cols` run through `lib/normalize`. The pure shape lets tests exercise the
  column-role / chart-type branching directly without round-tripping through the metadata
  provider."
  [chart-source lib-cols rows]
  (when (and (#{2 3} (count lib-cols)) (seq rows))
    (when-let [{:keys [dim-idx metric-idx series-idx]} (pick-indices lib-cols)]
      (case (count lib-cols)
        2 (two-col-chart-config chart-source lib-cols rows dim-idx metric-idx)
        3 (three-col-chart-config chart-source lib-cols rows dim-idx metric-idx series-idx)))))
