(ns metabase.explorations.interestingness
  "Bridge between the explorations worker and `metabase.interestingness.core`.

  Most `:model/ExplorationQuery` rows are a single breakout dimension by one aggregation, so
  their QP result has two columns: the dim and the measure. The time-faceted variant additionally
  carries a categorical-vs-temporal pair of breakouts → three columns, rendered as a multi-series
  line chart. This namespace normalizes either shape into the `chart-config` consumed by
  `metabase.interestingness.chart/chart-interestingness`."
  (:require
   [clojure.string :as str]
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

(defn exploration-query->lib-query
  "Lib query built from the exploration query's `:dataset_query`. The database comes from the
  row's own `:database_id` snapshot column (frozen alongside `:dataset_query` at plan time),
  so building the metadata provider costs no extra query and doesn't parse the MBQL."
  [exploration-query]
  (let [dq (:dataset_query exploration-query)
        mp (lib-be/application-database-metadata-provider (:database_id exploration-query))]
    (lib/query mp dq)))

(defn exploration-query->lib-cols
  "Lib columns from the exploration query"
  [exploration-query]
  (lib/returned-columns (exploration-query->lib-query exploration-query)))

(defn- col-extraction-unit
  "The extraction temporal-unit on a Lib column (e.g. `:day-of-week`), or nil for truncation
  buckets and untyped columns."
  [lib-col]
  (extraction-units (lib/raw-temporal-bucket lib-col)))

(defn- start-of-week-day ^DayOfWeek []
  (-> ((requiring-resolve 'metabase.settings.core/get) :start-of-week)
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
  `:unknown`."
  [display dim-chart-type]
  (if (or (nil? display) (#{"table" "scalar" "smartscalar"} display))
    (if (#{"datetime" "date" "time"} dim-chart-type) "line" "bar")
    display))

(defn- col-name
  "Human-facing name for a Lib column — display-name when present, otherwise the raw name,
  otherwise a literal fallback."
  [lib-col]
  (or (:display-name lib-col) (:name lib-col) "value"))

(defn- two-col-chart-config
  [exploration-query lib-cols rows dim-idx metric-idx]
  (let [dim-col              (nth lib-cols dim-idx)
        metric-col           (nth lib-cols metric-idx)
        extr                 (col-extraction-unit dim-col)
        dim-chart-type       (if extr "string" (col->chart-type dim-col))
        [x-values0 y-values] (pair-filter rows dim-idx metric-idx)
        x-values             (if extr (mapv #(extraction-label extr %) x-values0) x-values0)]
    (when (seq y-values)
      (let [series-name (col-name metric-col)]
        {:display_type (effective-display-type (:display exploration-query) dim-chart-type)
         :title        (:name exploration-query)
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
  [exploration-query lib-cols rows dim-idx metric-idx series-idx]
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

(defn chart-config
  "Build a `metabase.interestingness.chart.types/chart-config` from an exploration-query (for
  display + title), its Lib columns, and the QP-result rows. Returns nil when the result can't
  be scored: fewer than two cols, no numeric column, or — for the 3-col faceted shape — no
  temporal column.

  `lib-cols` should be authentic Lib columns produced via [[exploration-query->lib-cols]] in
  production. The pure shape lets tests exercise the column-role / chart-type branching directly
  without round-tripping through the metadata provider."
  [exploration-query lib-cols rows]
  (when (and (#{2 3} (count lib-cols)) (seq rows))
    (when-let [{:keys [dim-idx metric-idx series-idx]} (pick-indices lib-cols)]
      (case (count lib-cols)
        2 (two-col-chart-config exploration-query lib-cols rows dim-idx metric-idx)
        3 (three-col-chart-config exploration-query lib-cols rows dim-idx metric-idx series-idx)))))

(defn qp-result->chart-config
  "Convenience: build a `chart-config` from an `:model/ExplorationQuery` row and its in-memory QP
  result. Derives Lib columns from the query's `:dataset_query` via
  [[exploration-query->lib-cols]]; takes rows from the QP result. Returns nil when the result
  can't be scored."
  [exploration-query qp-result]
  (chart-config exploration-query
                (exploration-query->lib-cols exploration-query)
                (get-in qp-result [:data :rows])))

(defn lib-col->detail
  "A compact human-readable identifier for a single Lib column of `lib-query`. Uses the `:long`
  display-name style — which carries the join/FK-source prefix (e.g. `Product → Category`) for
  joined columns — plus any temporal-bucket / binning so that the same logical column at
  different granularities (e.g. `Created At: Month` vs `Created At: Quarter`) is distinguishable
  in prompt text."
  [lib-query lib-col]
  (when (map? lib-col)
    (let [display-name    (lib/display-name lib-query -1 lib-col :long)
          unit            (lib/raw-temporal-bucket lib-col)
          binning         (lib/binning lib-col)
          unit-name       (some-> unit name)
          unit-redundant? (and unit-name
                               (str/includes? (u/lower-case-en display-name)
                                              (u/lower-case-en unit-name)))]
      (cond-> display-name
        (and unit (not unit-redundant?)) (str ": " unit-name)
        binning                          (str " (binned)")))))
