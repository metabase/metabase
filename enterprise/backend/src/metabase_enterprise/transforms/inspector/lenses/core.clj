(ns metabase-enterprise.transforms.inspector.lenses.core
  "Lens orchestration for Transform Inspector.

   A lens is a 'view' into the transform data with:
   - Metadata (id, display-name, description)
   - Layout hint (:flat or :comparison)
   - Sections grouping cards
   - Summary with highlights
   - Alert triggers and drill-lens triggers
   - Cards (generated queries)

   Each lens type is implemented in its own namespace and registers
   itself via defmethod. Adding a new lens requires a clj file with
   defmethods for lens-applicable?, lens-metadata, make-lens-definition,
   and generate-cards."
  (:require
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Multimethods --------------------------------------------------

(defmulti lens-applicable?
  "Check if a lens applies to the given context.
   Should be a cheap check - no query execution.

   Arguments:
   - lens-type: keyword like :generic-summary, :join-analysis
   - ctx: context map with :has-joins?, :column-matches, etc.

   Returns true if the lens can be generated for this transform."
  (fn [lens-type _ctx] lens-type))

(defmethod lens-applicable? :default
  [_lens-type _ctx]
  ;; Unknown lens types are not applicable
  false)

(defmulti lens-metadata
  "Return lens metadata for discovery (Phase 1).
   This is the minimal info shown in the lens selector.

   Returns:
   {:id \"lens-id\"
    :display-name \"Human Name\"
    :description \"Optional description\"}"
  (fn [lens-type _ctx] lens-type))

(defmethod lens-metadata :default
  [lens-type _ctx]
  {:id           (name lens-type)
   :display-name (str lens-type)
   :description  nil})

(defmulti make-lens-definition
  "Generate lens definition WITHOUT cards.

   Returns:
   {:id \"lens-id\"
    :display-name \"Human Name\"
    :layout :flat | :comparison
    :summary {:text \"...\" :highlights [...] :alerts []}
    :sections [{:id :title :description} ...]
    :drill-lenses [{:id :display-name :description} ...]
    :alert-triggers [{:id :type :severity :condition ...} ...]
    :drill-lens-triggers [{:id :display-name :condition ...} ...]}"
  (fn [lens-type _ctx] lens-type))

(defmethod make-lens-definition :default
  [lens-type _ctx]
  {:id                  (name lens-type)
   :display-name        (str lens-type)
   :layout              :flat
   :summary             {:text nil :highlights [] :alerts []}
   :sections            []
   :drill-lenses        []
   :alert-triggers      []
   :drill-lens-triggers []})

(defmulti generate-cards
  "Generate cards for a lens.

   Returns a vector of card maps with :id, :title, :dataset-query, etc."
  (fn [lens-type _ctx] lens-type))

(defmethod generate-cards :default
  [lens-type _ctx]
  (log/warnf "No card generation implementation for lens type: %s" lens-type)
  [])

;;; -------------------------------------------------- Lens Registries --------------------------------------------------

(def top-level-lens-registry
  "Top-level lenses shown in Phase 1 discovery.
   Order matters - first applicable lens is the default."
  [:generic-summary :join-analysis :column-comparison])

(def drill-lens-registry
  "Drill-down lenses discovered via Phase 2 responses.
   These are only shown when triggered by parent lens alerts."
  [:unmatched-analysis :join-key-distribution])

;;; -------------------------------------------------- Public API --------------------------------------------------

(defn available-lenses
  "Return metadata for applicable TOP-LEVEL lenses (Phase 1).
   Filters to only lenses that apply to the given context.
   Order is preserved - first lens is the default."
  [ctx]
  (->> top-level-lens-registry
       (filter #(lens-applicable? % ctx))
       (mapv #(lens-metadata % ctx))))

(defn available-drill-lenses
  "Return metadata for applicable drill-down lenses (Phase 2).
   Called by parent lens during generation to include potential drill-lenses."
  [ctx]
  (->> drill-lens-registry
       (filter #(lens-applicable? % ctx))
       (mapv #(lens-metadata % ctx))))

(defn lens-id->type
  "Map lens ID string to lens type keyword."
  [lens-id]
  (keyword lens-id))

;;; -------------------------------------------------- Lens Generation --------------------------------------------------

(defn generate-lens
  "Generate full lens contents (Phase 2).

   Combines lens definition with generated cards.
   Returns the complete lens definition ready for API response."
  [lens-type ctx]
  (let [definition (make-lens-definition lens-type ctx)
        cards (generate-cards lens-type ctx)]
    (assoc definition :cards cards)))

(defn get-lens
  "Generate a lens by ID.
   Returns the full lens definition with cards."
  [ctx lens-id]
  (let [lens-type (lens-id->type lens-id)]
    (if (lens-applicable? lens-type ctx)
      (generate-lens lens-type ctx)
      (throw (ex-info (str "Lens not applicable: " lens-id)
                      {:lens-id lens-id
                       :lens-type lens-type})))))
