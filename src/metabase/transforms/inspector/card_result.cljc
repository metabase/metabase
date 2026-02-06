(ns metabase.transforms.inspector.card-result
  "Compute derived fields from raw query results for inspector cards.

   This is a cljc namespace so it can be used by both:
   - Backend: to compute card results after query execution
   - Frontend: to compute results client-side

   The multimethod dispatches on [lens-id card-type] to allow
   lens-specific result computation for different card types.")

;;; -------------------------------------------------- Card Result Computation --------------------------------------------------

(defmulti compute-card-result
  "Compute derived fields from first row of query result for a card.
   Dispatches on [lens-id card-type]. Returns a map of field-name -> value, or nil.

   Arguments:
   - lens-id: keyword like :join-analysis
   - card: the card map with :id, :metadata, etc.
   - row: the first row of query result (vector)"
  {:arglists '([lens-id card row])}
  (fn [lens-id card _row]
    [lens-id (get-in card [:metadata :card_type])]))

(defmethod compute-card-result :default
  [_ _ row]
  (when (nil? row)
    {"no_data" true}))

(defmethod compute-card-result [:join-analysis "join_step"]
  [_ _card row]
  (if (nil? row)
    {"no_data"       true
     "output_count"  0
     "matched_count" 0
     "null_count"    0
     "null_rate"     nil}
    (let [output-count (nth row 0 nil)
          matched-count (nth row 1 nil)
          null-count (when (and output-count matched-count)
                       (- output-count matched-count))
          null-rate (when (and null-count output-count (pos? output-count))
                      (/ null-count output-count))]
      {"output_count"  output-count
       "matched_count" matched-count
       "null_count"    null-count
       "null_rate"     null-rate})))
