(ns metabase.metabot.tools.charts.fit
  "Whether a chart type can show the columns that a query returns.

  The frontend draws a Metabot chart with its default settings, and some chart types can't be drawn from some columns:
  a pie chart needs a number to measure, so over two text columns the user sees `Which columns do you want to use?`
  instead of a chart. The checks here classify columns the way `isDimension` and `isMetric` in
  `frontend/src/metabase-lib/v1/types/utils/isa.ts` do, and each one holds when the visualization's `checkRenderable`
  passes with its default settings."
  (:require
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- aggregation? [col]
  (= :source/aggregations (:lib/source col)))

(defn- binned? [col]
  (some? ((some-fn :lib/binning :lib/original-binning) col)))

(defn- dimension? [col]
  (or (not (aggregation? col)) (binned? col)))

(defn- id-name? [col]
  (let [col-name (u/lower-case-en (:name col))]
    (or (= "id" col-name) (str/ends-with? col-name "_id") (str/ends-with? col-name "-id"))))

(defn- metric?
  "Whether `col` is a number to measure."
  [col]
  (and (not (:lib/breakout? col))
       (lib.types.isa/summable? col)
       (not (id-name? col))
       (not (binned? col))))

(defn- grouping?
  "Whether `col` is a column to group by: one that the frontend picks for a chart's categories or x-axis."
  [col]
  (and (dimension? col) (not (metric? col))))

(defn- n-of [pred cols]
  (count (filter pred cols)))

(defn- groupings-and-metrics
  "A requirement for 1 to `max-groupings` columns to group by and at least 1 number to measure."
  [max-groupings needs]
  {:needs needs
   :fits? (fn [cols]
            (and (<= 1 (n-of grouping? cols) max-groupings)
                 (some metric? cols)))})

(def ^:private requirements
  "What each chart type, other than `table` and `object`, needs from a query's columns.
  `:needs` says it to the model, and `:fits?` checks the columns. `scalar`, `gauge` and `smartscalar` show a single
  value, so they also need the columns that their `isSensible` asks for: from other columns the frontend still draws
  them, with the wrong value."
  (let [axes  (groupings-and-metrics 2 "1 or 2 columns to group by and at least 1 number to measure")
        rings (groupings-and-metrics 3 "1 to 3 columns to group by and at least 1 number to measure")]
    {"bar"         axes
     "line"        axes
     "area"        axes
     "combo"       axes
     "row"         axes
     "boxplot"     axes
     "pie"         rings
     ;; The frontend draws a pie chart with 2 or 3 columns to group by as a sunburst
     "sunburst"    rings
     "waterfall"   (groupings-and-metrics 1 "exactly 1 column to group by and at least 1 number to measure")
     "treemap"     {:needs "a column to group by and a number to measure"
                    :fits? #(and (some grouping? %) (some metric? %))}
     "funnel"      {:needs "exactly 1 column to group by and exactly 1 number to measure"
                    :fits? #(= 1 (n-of grouping? %) (n-of metric? %))}
     "scatter"     {:needs "2 or 3 numbers to measure, or 1 number to measure and 1 or 2 columns to plot it against"
                    :fits? (fn [cols]
                             (let [metrics (n-of metric? cols)]
                               (or (<= 2 metrics 3)
                                   (and (= 1 metrics) (<= 1 (n-of dimension? cols) 2)))))}
     "sankey"      {:needs "2 columns to group by that are neither dates nor coordinates, and a number to measure"
                    :fits? (fn [cols]
                             (and (<= 2 (n-of (every-pred grouping?
                                                          (complement lib.types.isa/temporal?)
                                                          (complement lib.types.isa/coordinate?))
                                              cols))
                                  (some metric? cols)))}
     "pivot"       {:needs "at least 2 columns, each one a breakout or an aggregation"
                    :fits? #(and (<= 2 (count %)) (every? (some-fn aggregation? :lib/breakout?) %))}
     "scalar"      {:needs "exactly 1 column"
                    :fits? #(= 1 (count %))}
     "smartscalar" {:needs "a date as the only column to group by, and a number to measure"
                    :fits? #(and (= 1 (n-of grouping? %) (n-of lib.types.isa/temporal? %))
                                 (some metric? %))}
     "gauge"       {:needs "exactly 1 column, a number"
                    :fits? (fn [[col :as cols]]
                             (and (= 1 (count cols))
                                  (lib.types.isa/numeric? col)
                                  (not (lib.types.isa/temporal? col))))}
     "progress"    {:needs "a numeric column"
                    :fits? #(some lib.types.isa/numeric? %)}
     "map"         {:needs "latitude and longitude columns, or a state or country column and a number to measure"
                    :fits? #(or (and (some lib.types.isa/latitude? %) (some lib.types.isa/longitude? %))
                                (and (some (some-fn lib.types.isa/state? lib.types.isa/country?) %)
                                     (some metric? %)))}}))

(defn- fits?
  [chart-type cols]
  (if-let [requirement (requirements chart-type)]
    (boolean ((:fits? requirement) cols))
    true))

(tools/defrecoverable incompatible-chart-type!
  "The frontend can't draw the chart type from the columns that the query returns."
  {:payload [:map {:closed true}
             [:chart-type (into [:enum] (keys requirements))]
             [:columns    [:int {:min 0}]]
             [:groupings  [:int {:min 0}]]
             [:metrics    [:int {:min 0}]]
             [:fitting    [:sequential {:min 1} (into [:enum] shared/chart-types)]]]}
  [{:keys [chart-type columns groupings metrics fitting]}]
  {:message  (str "Chart type \"" chart-type "\" can't show this query's columns. "
                  "It needs " (:needs (requirements chart-type)) ". "
                  "The query returns " columns " " (u/format-plural columns "column") ": "
                  groupings " to group by and " metrics " " (u/format-plural metrics "number") " to measure. "
                  "Chart types that fit these columns: " (str/join ", " fitting) ".")
   :recovery [{:uses #{"construct_notebook_query"}
               :text (str "To keep this chart type, call `construct_notebook_query` with a query that returns the "
                          "columns it needs.")}]})

(defn- returned-columns
  "The columns that `query` returns, or nil when they can't be worked out without running it."
  [query]
  (try
    (let [query (lib-be/normalize-query query)]
      (when (seq query)
        (not-empty (lib/returned-columns query))))
    (catch Exception e
      (log/debug e "Could not work out the columns that a chart's query returns")
      nil)))

(defn check-chart-type!
  "Throw [[incompatible-chart-type!]] when the frontend can't draw `chart-type` from the columns that `query` returns.
  A query whose columns can't be known without running it, such as a SQL query, passes."
  [chart-type query]
  (when-let [cols (returned-columns query)]
    (let [chart-type (name chart-type)]
      (when-not (fits? chart-type cols)
        (incompatible-chart-type! {:chart-type chart-type
                                   :columns    (count cols)
                                   :groupings  (n-of grouping? cols)
                                   :metrics    (n-of metric? cols)
                                   :fitting    (filterv #(fits? % cols) shared/chart-types)})))))
