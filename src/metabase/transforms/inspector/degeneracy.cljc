(ns metabase.transforms.inspector.degeneracy
  "Multimethod for detecting degenerate card results.
   A degenerate result is one that doesn't provide useful information
   and should be hidden or deprioritized in the UI.

   Examples of degenerate results:
   - Bar chart with only 1 bar (no comparison possible)
   - Pie chart with only 1 slice (100% of one value)
   - Line chart with only 1 point (no trend visible)
   - Any chart with 0 rows (no data)
   - Scalar with null value
   - Bar chart where all bars have the same height

   Card results use string keys from compute-card-result:
   - \"row-count\" - number of rows
   - \"output-count\" - output count (for joins)
   - \"matched-count\" - matched count (for joins)
   - \"null-count\" - null count
   - \"null-rate\" - null rate (0.0-1.0)
   - \"first-row\" - first row of data")

;;; -------------------------------------------------- Basic Checks --------------------------------------------------

(defn- no-data?
  "Check if the result has no data at all."
  [card-result]
  (let [row-count (or (get card-result "row-count")
                      (get card-result "output-count"))]
    (or (nil? row-count) (zero? row-count))))

(defn- single-value?
  "Check if the result has only a single value (1 row for breakout queries)."
  [card-result]
  (let [row-count (or (get card-result "row-count")
                      (get card-result "output-count"))]
    (= row-count 1)))

(defn- null-scalar?
  "Check if a scalar result is null."
  [card-result]
  (let [first-row (get card-result "first-row")]
    (or (nil? first-row)
        (empty? first-row)
        (nil? (first first-row)))))

(defn- all-same-value?
  "Check if all values in the result are the same (for breakout queries).
   Looks for a companion stats card with ID '{card-id}-stats' that returns
   distinct-count. If distinct-count = 1, all values are same."
  [card-id card-results]
  (when card-results
    (when-let [stats-result (get card-results (str card-id "-stats"))]
      (= 1 (or (get stats-result "distinct-count")
               (-> (get stats-result "first-row") first))))))

;;; -------------------------------------------------- Display-specific Checks --------------------------------------------------

(defmulti degenerate-for-display?
  "Check if a card result is degenerate for a given display type.

   Arguments:
   - card-id: the card's ID (for looking up companion cards)
   - card-result: the card's computed result (string keys)
   - display-type: keyword like :bar, :line, etc.
   - card-results: map of all card results (for companion card lookup)

   Returns {:degenerate? bool :reason keyword}."
  {:arglists '([card-id card-result display-type card-results])}
  (fn [_card-id _card-result display-type _card-results] display-type))

(defmethod degenerate-for-display? :default
  [_card-id card-result _display-type _card-results]
  (cond
    (no-data? card-result)
    {:degenerate? true :reason :no-data}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :bar
  [card-id card-result _ card-results]
  (cond
    (no-data? card-result)
    {:degenerate? true :reason :no-data}

    (single-value? card-result)
    {:degenerate? true :reason :single-value}

    (all-same-value? card-id card-results)
    {:degenerate? true :reason :all-same-value}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :row
  [card-id card-result _ card-results]
  (degenerate-for-display? card-id card-result :bar card-results))

(defmethod degenerate-for-display? :pie
  [_card-id card-result _ _card-results]
  (cond
    (no-data? card-result)
    {:degenerate? true :reason :no-data}

    (single-value? card-result)
    {:degenerate? true :reason :single-slice}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :line
  [_card-id card-result _ _card-results]
  (cond
    (no-data? card-result)
    {:degenerate? true :reason :no-data}

    (single-value? card-result)
    {:degenerate? true :reason :single-point}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :area
  [card-id card-result _ card-results]
  (degenerate-for-display? card-id card-result :line card-results))

(defmethod degenerate-for-display? :scalar
  [_card-id card-result _ _card-results]
  (cond
    (no-data? card-result)
    {:degenerate? true :reason :no-data}

    (null-scalar? card-result)
    {:degenerate? true :reason :null-value}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :gauge
  [card-id card-result _ card-results]
  (degenerate-for-display? card-id card-result :scalar card-results))

(defmethod degenerate-for-display? :progress
  [card-id card-result _ card-results]
  (degenerate-for-display? card-id card-result :scalar card-results))

(defmethod degenerate-for-display? :table
  [_card-id card-result _ _card-results]
  (if (no-data? card-result)
    {:degenerate? true :reason :no-data}
    {:degenerate? false}))

(defmethod degenerate-for-display? :hidden
  [_card-id _card-result _ _card-results]
  {:degenerate? false})
