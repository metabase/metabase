(ns metabase.transforms-inspector.degeneracy
  "Multimethod for detecting degenerate card results.
   A degenerate result is one that doesn't provide useful information
   and should be hidden or deprioritized in the UI.")

;;; -------------------------------------------------- Basic Checks --------------------------------------------------

(defn- no-data?
  "Check if the result has no data at all."
  [card-result]
  (or (get card-result "no_data")
      (= 0 (get card-result "row_count"))))

;;; -------------------------------------------------- Display-specific Checks --------------------------------------------------

(defmulti degenerate-for-display?
  "Check if a card result is degenerate for a given display type.

   Arguments:
   - card-id: the card's ID (for looking up in card-results)
   - display-type: keyword like :bar, :line, etc.
   - card-results: map of all card results (card-id -> result map)

   Returns {:degenerate? bool :reason keyword}."
  {:arglists '([card-id display-type card-results])}
  (fn [_card-id display-type _card-results] display-type))

(defmethod degenerate-for-display? :default
  [card-id _display-type card-results]
  (cond
    (no-data? (get card-results card-id))
    {:degenerate? true :reason :no-data}

    :else
    {:degenerate? false}))

(defmethod degenerate-for-display? :hidden
  [_card-id _display-type _card-results]
  {:degenerate? true})
