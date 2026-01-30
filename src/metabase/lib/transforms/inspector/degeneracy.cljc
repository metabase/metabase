(ns metabase.lib.transforms.inspector.degeneracy
  "Detection of degenerate card results.
   A degenerate result is one that doesn't provide useful information
   and should be hidden or deprioritized in the UI.

   Examples of degenerate results:
   - Bar chart with only 1 bar (no comparison possible)
   - Pie chart with only 1 slice (100% of one value)
   - Line chart with only 1 point (no trend visible)
   - Any chart with 0 rows (no data)
   - Scalar with null value
   - Bar chart where all bars have the same height")

;;; -------------------------------------------------- Basic Checks --------------------------------------------------

(defn- no-data?
  "Check if the result has no data at all."
  [{:keys [row-count]}]
  (or (nil? row-count) (zero? row-count)))

(defn- single-value?
  "Check if the result has only a single value (1 row for breakout queries)."
  [{:keys [row-count]}]
  (= row-count 1))

(defn- null-scalar?
  "Check if a scalar result is null."
  [{:keys [first-row]}]
  (or (nil? first-row)
      (empty? first-row)
      (nil? (first first-row))))

;; TODO: mo more resilient
(defn- all-same-value?
  "Check if all values in the result are the same (for breakout queries).
   Looks for a companion stats card with ID '{card-id}-stats' that returns
   [distinct-count, total-count]. If distinct-count = 1, all values are same."
  [card-id card-summaries]
  (when card-summaries
    (when-let [stats-summary (get card-summaries (str card-id "-stats"))]
      (= 1 (-> stats-summary :first-row first)))))

;;; -------------------------------------------------- Display-specific Checks --------------------------------------------------

(defmulti degenerate-for-display?
  "Check if a card result is degenerate for a given display type.

   Arguments:
   - card-id: the card's ID (for looking up companion cards)
   - card-summary: the card's execution summary
   - display-type: keyword like :bar, :line, etc.
   - card-summaries: map of all card summaries (for companion card lookup)

   Returns {:degenerate? bool :reason keyword}."
  (fn [_card-id _card-summary display-type _card-summaries] display-type))

(defmethod degenerate-for-display? :default
  [_card-id card-summary _display-type _card-summaries]
  (cond
    (no-data? card-summary)
    {:degenerate? true :reason :no-data}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :bar
  [card-id card-summary _ card-summaries]
  (cond
    (no-data? card-summary)
    {:degenerate? true :reason :no-data}

    (single-value? card-summary)
    {:degenerate? true :reason :single-value}

    (all-same-value? card-id card-summaries)
    {:degenerate? true :reason :all-same-value}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :row
  [card-id card-summary _ card-summaries]
  ;; Same as bar chart
  (degenerate-for-display? card-id card-summary :bar card-summaries))

(defmethod degenerate-for-display? :pie
  [_card-id card-summary _ _card-summaries]
  (cond
    (no-data? card-summary)
    {:degenerate? true :reason :no-data}

    (single-value? card-summary)
    {:degenerate? true :reason :single-slice}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :line
  [_card-id card-summary _ _card-summaries]
  (cond
    (no-data? card-summary)
    {:degenerate? true :reason :no-data}

    (single-value? card-summary)
    {:degenerate? true :reason :single-point}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :area
  [card-id card-summary _ card-summaries]
  ;; Same as line chart
  (degenerate-for-display? card-id card-summary :line card-summaries))

(defmethod degenerate-for-display? :scalar
  [_card-id card-summary _ _card-summaries]
  (cond
    (no-data? card-summary)
    {:degenerate? true :reason :no-data}

    (null-scalar? card-summary)
    {:degenerate? true :reason :null-value}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :gauge
  [card-id card-summary _ card-summaries]
  ;; Same as scalar
  (degenerate-for-display? card-id card-summary :scalar card-summaries))

(defmethod degenerate-for-display? :progress
  [card-id card-summary _ card-summaries]
  ;; Same as scalar
  (degenerate-for-display? card-id card-summary :scalar card-summaries))

(defmethod degenerate-for-display? :table
  [_card-id card-summary _ _card-summaries]
  ;; Tables are rarely degenerate - even 0 rows can be informative
  (if (no-data? card-summary)
    {:degenerate? true :reason :no-data}
    {:degenerate? false}))

(defmethod degenerate-for-display? :hidden
  [_card-id _card-summary _ _card-summaries]
  ;; Hidden cards are never degenerate - they're for data collection only
  {:degenerate? false})

;;; -------------------------------------------------- Public API --------------------------------------------------

(defn degenerate?
  "Check if a card result is degenerate and shouldn't be displayed.

   Arguments:
   - card-id: the card's ID string
   - card-summary: map with :row-count, :first-row
   - display-type: keyword like :bar, :line, :scalar, etc.
   - card-summaries: (optional) map of all card summaries for companion card lookup

   Returns:
   - {:degenerate? true :reason :no-data|:single-value|:null-value|:all-same-value|...}
   - {:degenerate? false}"
  ([card-id card-summary display-type]
   (degenerate? card-id card-summary display-type nil))
  ([card-id card-summary display-type card-summaries]
   (degenerate-for-display? card-id card-summary (or display-type :default) card-summaries)))

(defn filter-degenerate-cards
  "Given a seq of cards with their summaries and a map of all summaries,
   return only non-degenerate cards.

   Each card should have:
   - :id - the card ID
   - :display - the display type
   - :summary - the card summary from execution

   Returns the cards that are not degenerate."
  [cards-with-summaries card-summaries]
  (remove (fn [{:keys [id display summary]}]
            (:degenerate? (degenerate? id summary display card-summaries)))
          cards-with-summaries))
