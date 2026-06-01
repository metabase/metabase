(ns metabase.metabot.tools.charts.select
  "Select a subset of an existing chart's data points via a filter over its result columns.

  A `data-selection` is a named set of real chart rows the model wants to highlight together.
  The model supplies a filter (a subquery over the chart's result columns); we run the chart's own
  query, keep the rows that match, and store them as targets keyed by a fresh selection id. The
  frontend resolves that id to the matching rows and highlights all of them at once, so the model
  can reference many points on the chart with a single `metabase://data-selection/<id>` link."
  (:require
   [clojure.string :as str]
   [metabase.metabot.tmpl :as te]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private max-selection-points
  "Upper bound on the number of points a single selection may carry, to keep streamed state small."
  1000)

;;; ---------------------------------------- Query resolution ----------------------------------------

(defn resolve-selection-query
  "Resolve the query whose points are being selected, from agent memory state. Prefers an explicit
  `query-id`, then the first query backing `chart-id`. Throws an agent error when neither resolves."
  [charts-state queries-state chart-id query-id]
  (or (when query-id
        (or (get queries-state query-id)
            (get queries-state (keyword (str query-id)))))
      (when chart-id
        (let [chart (or (get charts-state chart-id)
                        (get charts-state (keyword (str chart-id))))]
          (first (:queries chart))))
      (throw (ex-info (str "No chart or query was found to select points from. "
                           "Pass the chart_id of a chart you created, or a query_id.")
                      {:agent-error? true
                       :status-code  400
                       :chart-id     chart-id
                       :query-id     query-id}))))

;;; ---------------------------------------- Filter evaluation ----------------------------------------

(defn- ->number
  [v]
  (cond
    (number? v) (double v)
    (string? v) (try (Double/parseDouble (str/trim v)) (catch Exception _ nil))
    :else       nil))

(defn- column-label
  [{:keys [name display_name]}]
  (or name display_name))

(defn- find-column-index
  "0-based index of the result column matching `col-name` by `:name` or `:display_name`
  (case-insensitive). nil when no column matches."
  [result-columns col-name]
  (let [target (some-> col-name str u/lower-case-en str/trim)]
    (when (seq target)
      (first (keep-indexed
              (fn [i {:keys [name display_name]}]
                (when (or (= target (some-> name str u/lower-case-en str/trim))
                          (= target (some-> display_name str u/lower-case-en str/trim)))
                  i))
              result-columns)))))

(defn- values-equal?
  "Numeric-aware equality: compares as numbers when both coerce, otherwise as strings."
  [a b]
  (let [na (->number a) nb (->number b)]
    (if (and na nb)
      (== na nb)
      (= (some-> a str) (some-> b str)))))

(defn- numeric-compare
  "Apply numeric comparator `cmp` to `a` and `b`; false when either is non-numeric."
  [cmp a b]
  (let [na (->number a) nb (->number b)]
    (boolean (and na nb (cmp na nb)))))

(declare ->row-predicate)

(defn- combine-predicate
  [op result-columns clauses]
  (let [preds (mapv #(->row-predicate result-columns %) clauses)]
    (case op
      "and" (fn [row] (every? #(% row) preds))
      "or"  (fn [row] (boolean (some #(% row) preds))))))

(defn- leaf-predicate
  [result-columns op col-name args]
  (let [idx (find-column-index result-columns col-name)]
    (when (nil? idx)
      (throw (ex-info (str "Unknown column in selection filter: " (pr-str col-name)
                           ". Available columns: ["
                           (str/join ", " (keep column-label result-columns)) "].")
                      {:agent-error? true :status-code 400})))
    (let [cell #(nth % idx nil)]
      (case op
        "="        (let [v (first args)] (fn [row] (values-equal? (cell row) v)))
        "!="       (let [v (first args)] (fn [row] (not (values-equal? (cell row) v))))
        "<"        (let [v (first args)] (fn [row] (numeric-compare < (cell row) v)))
        "<="       (let [v (first args)] (fn [row] (numeric-compare <= (cell row) v)))
        ">"        (let [v (first args)] (fn [row] (numeric-compare > (cell row) v)))
        ">="       (let [v (first args)] (fn [row] (numeric-compare >= (cell row) v)))
        "between"  (let [[lo hi] args]
                     (fn [row] (and (numeric-compare >= (cell row) lo)
                                    (numeric-compare <= (cell row) hi))))
        "in"       (let [vs (first args)] (fn [row] (boolean (some #(values-equal? (cell row) %) vs))))
        "not-in"   (let [vs (first args)] (fn [row] (not (some #(values-equal? (cell row) %) vs))))
        "is-null"  (fn [row] (nil? (cell row)))
        "not-null" (fn [row] (some? (cell row)))
        (throw (ex-info (str "Unsupported selection operator: " (pr-str op))
                        {:agent-error? true :status-code 400}))))))

(defn- ->row-predicate
  "Compile a selection `filter` clause into a predicate over a result row.

  Leaf clauses are `[op column-name & args]` where `op` is one of `=`, `!=`, `<`, `<=`, `>`, `>=`,
  `between`, `in`, `not-in`, `is-null`, `not-null`. Boolean clauses are `[\"and\"|\"or\" & clauses]`
  and `[\"not\" clause]`."
  [result-columns clause]
  (when-not (sequential? clause)
    (throw (ex-info (str "Selection filter clause must be an array, got: " (pr-str clause))
                    {:agent-error? true :status-code 400})))
  (let [op (some-> (first clause) name)]
    (case op
      ("and" "or") (combine-predicate op result-columns (rest clause))
      "not"        (let [p (->row-predicate result-columns (second clause))]
                     (fn [row] (not (p row))))
      (leaf-predicate result-columns op (second clause) (drop 2 clause)))))

;;; ---------------------------------------- Selection targets ----------------------------------------

(defn select-targets
  "Return up to `max-selection-points` data-point targets for the rows of `summary` that match
  `filter-clause`. Each target mirrors the data-point target shape so the frontend matches it
  against the chart's rendered rows."
  [{:keys [result_columns rows]} filter-clause]
  (let [predicate          (->row-predicate result_columns filter-clause)
        columns            (mapv column-label result_columns)
        value-column-index (max 0 (dec (count result_columns)))]
    (into []
          (comp (filter predicate)
                (map (fn [row]
                       {:columns            columns
                        :row                row
                        :value_column_index value-column-index}))
                (take max-selection-points))
          rows)))

;;; ---------------------------------------- Result formatting ----------------------------------------

(defn- selection-link
  [selection-id]
  (str "metabase://data-selection/" selection-id))

(defn format-selection-result
  "Build the tool result map for a resolved selection: a `<data_selection>` block for the LLM and a
  `:data-selections` structured-output entry the agent loop merges into streamed state."
  [{:keys [selection-id targets label]}]
  (let [point-count (count targets)
        link        (selection-link selection-id)]
    {:output (te/lines
              "<result>"
              (str "<data_selection id=\"" selection-id "\" points=\"" point-count "\">")
              (str "Selected " point-count " point" (when (not= 1 point-count) "s")
                   " from the chart that match the filter.")
              "</data_selection>"
              "</result>"
              "<instructions>"
              (str "Reference this selection with a single link: [your natural label](" link "). "
                   "Clicking it highlights all " point-count " selected point"
                   (when (not= 1 point-count) "s") " on the chart the user sees. "
                   "Use it wherever you would otherwise mention several individual points at once.")
              "</instructions>")
     :structured-output {:data-selections
                         {selection-id (cond-> {:targets targets
                                                :count   point-count}
                                         (not (str/blank? label)) (assoc :label label))}}}))
