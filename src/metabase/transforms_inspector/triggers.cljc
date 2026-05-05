(ns metabase.transforms-inspector.triggers
  "Multimethod for evaluating trigger conditions against inspector card results.

   Triggers control when alerts and drill-down lenses appear
   based on computed card results (e.g., high null rate).")

(defmulti evaluate-condition
  "Evaluate a named condition against card results.
   Dispatches on condition name. Returns truthy if condition is met.

   Arguments:
   - condition: map with :name and any other keys the condition needs
   - card-results: map of card-id (string) -> result map (string keys)"
  {:arglists '([condition card-results])}
  (fn [condition _card-results] (:name condition)))

(defmethod evaluate-condition :default
  [_ _]
  false)

(defmethod evaluate-condition :high-null-rate
  [{:keys [card_id]} card-results]
  (when-let [result (get card-results card_id)]
    (> (get result "null_rate" 0) 0.2)))

(defmethod evaluate-condition :has-unmatched-rows
  [{:keys [card_id]} card-results]
  (when-let [result (get card-results card_id)]
    (> (get result "null_rate" 0) 0.05)))
