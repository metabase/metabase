(ns metabase.transforms.inspector.core
  "Public API for Transform Inspector utilities."
  (:require
   [metabase.transforms.inspector.card-result :as card-result]
   [metabase.transforms.inspector.degeneracy :as degeneracy]
   [metabase.transforms.inspector.interestingness :as interestingness]
   [metabase.transforms.inspector.triggers :as triggers]))

;;; -------------------------------------------------- Card Results --------------------------------------------------

(defn compute-card-result
  "Compute derived fields from first row of query result for a card.
   Dispatches on [lens-id card-type]. Returns a map of field-name -> value, or nil."
  [lens-id card row]
  (card-result/compute-card-result lens-id card row))

;;; -------------------------------------------------- Triggers --------------------------------------------------

(defn triggered-alerts
  "Return alerts whose conditions are met."
  [card-results alert-triggers]
  (filterv #(triggers/evaluate-condition (:condition %) card-results) alert-triggers))

(defn triggered-drill-lenses
  "Return full drill lens trigger objects whose conditions are met."
  [card-results drill-lens-triggers]
  (filterv #(triggers/evaluate-condition (:condition %) card-results) drill-lens-triggers))

(defn evaluate-triggers
  "Evaluate all triggers for a lens against card results.
   Returns {:alerts [...] :drill_lenses [...]}."
  [lens card-results]
  {:alerts       (triggered-alerts card-results (:alert_triggers lens))
   :drill_lenses (triggered-drill-lenses card-results (:drill_lens_triggers lens))})

;;; -------------------------------------------------- Interestingness --------------------------------------------------

(defn interesting-fields
  "Filter and sort fields by interestingness.
   Returns fields with score above threshold, sorted by score descending.

   Options:
   - :threshold - minimum score to include (default 0.3)
   - :limit     - maximum number of fields to return (default nil = all)"
  [fields & opts]
  (interestingness/interesting-fields fields opts))

;;; -------------------------------------------------- Degeneracy --------------------------------------------------

(defn degenerate?
  "Check if a card result is degenerate and shouldn't be displayed.

   Arguments:
   - card-id: the card's ID string
   - display-type: keyword like :bar, :line, :scalar, etc.
   - card-results: map of all card results (card-id -> result map)

   Returns {:degenerate? bool, :reason keyword-or-nil}."
  [card-id display-type card-results]
  (degeneracy/degenerate-for-display? card-id display-type card-results))
