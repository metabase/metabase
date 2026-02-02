(ns metabase.transforms.inspector.card-result
  "Compute derived fields from raw query results for inspector cards.

   This is a cljc namespace so it can be used by both:
   - Backend: to compute card results after query execution
   - Frontend: to compute results client-side

   The multimethod dispatches on [lens-id card-type] to allow
   lens-specific result computation for different card types.")

;;; -------------------------------------------------- Card Result Computation --------------------------------------------------

(defmulti compute-card-result
  "Compute derived fields from raw query result for a card.
   Dispatches on [lens-id card-type]. Returns a map of field-name -> value, or nil.

   Arguments:
   - lens-id: keyword like :join-analysis
   - card: the card map with :id, :metadata, etc.
   - rows: the raw query result rows (vector of vectors)"
  {:arglists '([lens-id card rows])}
  (fn [lens-id card _rows]
    [lens-id (keyword (get-in card [:metadata :card-type]))]))

(defmethod compute-card-result :default
  [_ _ _]
  nil)

(defmethod compute-card-result [:join-analysis :join-step]
  [_ _card rows]
  (let [row (first rows)
        output-count (nth row 0 nil)
        matched-count (nth row 1 nil)
        null-count (when (and output-count matched-count)
                     (- output-count matched-count))
        null-rate (when (and null-count output-count (pos? output-count))
                    (/ null-count output-count))]
    {"output-count"  output-count
     "matched-count" matched-count
     "null-count"    null-count
     "null-rate"     null-rate}))
