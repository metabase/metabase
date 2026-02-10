(ns metabase.transforms-inspector.core
  "Public API for Transform Inspector utilities."
  (:require
   #?@(:clj [[metabase.transforms-inspector.context :as context]
             [metabase.transforms-inspector.lens.column-comparison]
             [metabase.transforms-inspector.lens.core :as lens.core]
             [metabase.transforms-inspector.lens.generic]
             [metabase.transforms-inspector.lens.join-analysis]
             [metabase.transforms-inspector.lens.unmatched-rows]
             [metabase.transforms-inspector.schema]
             [metabase.util.i18n :refer [tru]]
             [metabase.util.malli :as mu]])
   [metabase.transforms-inspector.card-result :as card-result]
   [metabase.transforms-inspector.degeneracy :as degeneracy]
   [metabase.transforms-inspector.interestingness :as interestingness]
   [metabase.transforms-inspector.triggers :as triggers]))

#?(:clj
   (comment
     metabase.transforms-inspector.lens.generic/keep-me
     metabase.transforms-inspector.lens.column-comparison/keep-me
     metabase.transforms-inspector.lens.join-analysis/keep-me
     metabase.transforms-inspector.lens.unmatched-rows/keep-me))

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
   - :visited_fields - map of field sets used in query clauses (ignored for now)
   - :threshold      - minimum score to include (default 0.3)
   - :limit          - maximum number of fields to return (default nil = all)"
  [fields opts]
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

;;; -------------------------------------------------- Lens Discovery API  --------------------------------------------------

#?(:clj
   (mu/defn discover-lenses :- :metabase.transforms-inspector.schema/discovery-response
     "Discover available lenses for a transform.
      Returns structural metadata and available lens types.
      This is a cheap operation - no query execution."
     [transform :- :map]
     (let [{:keys [sources target] :as ctx} (context/build-context transform)]
       (if-not target
         {:name             (str "Transform Inspector: " (:name transform))
          :description      (tru "Transform has not been run yet.")
          :status           :not-run
          :sources          sources
          :target           nil
          :available_lenses []}
         {:name             (str "Transform Inspector: " (:name transform))
          :description      (tru "Analysis of transform inputs, outputs, and joins")
          :status           :ready
          :sources          sources
          :target           target
          :visited_fields   (:visited-fields ctx)
          :available_lenses (lens.core/available-lenses ctx)}))))

#?(:clj
   (mu/defn get-lens :- :metabase.transforms-inspector.schema/lens
     "Get full lens contents for a transform.
      Returns sections, cards, and trigger definitions.
      Optional params can filter/customize drill lens output."
     [transform :- :map
      lens-id :- :string
      params :- [:maybe :map]]
     (let [ctx (context/build-context transform)]
       (lens.core/get-lens ctx lens-id params))))
