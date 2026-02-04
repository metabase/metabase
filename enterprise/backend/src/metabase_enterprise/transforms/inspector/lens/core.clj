(ns metabase-enterprise.transforms.inspector.lens.core
  "Lens orchestration for Transform Inspector.

   A lens is a 'view' into the transform data with:
   - Metadata (id, display-name, description)
   - Sections grouping cards
   - Summary with highlights
   - Cards (generated queries)
   - Alert and drill-lens triggers

   Each lens type is implemented via multimethods. Adding a new lens
   requires implementing: lens-applicable?, lens-metadata, make-lens."
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
  {:arglists '([lens-type ctx])}
  (fn [lens-type _ctx] lens-type))

(defmethod lens-applicable? :default
  [_lens-type _ctx]
  false)

(defmulti lens-metadata
  "Return lens metadata for discovery (Phase 1).
   This is the minimal info shown in the lens selector.

   Returns:
   {:id \"lens-id\"
    :display-name \"Human Name\"
    :description \"Optional description\"}"
  {:arglists '([lens-type ctx])}
  (fn [lens-type _ctx] lens-type))

(defmethod lens-metadata :default
  [lens-type _ctx]
  {:id           (name lens-type)
   :display-name (str lens-type)
   :description  nil})

(defmulti make-lens
  "Generate full lens contents (Phase 2).

   Arguments:
   - lens-type: keyword like :generic-summary, :join-analysis
   - ctx: context map with sources, target, joins, etc.
   - params: optional map with drill lens parameters (e.g., {:join-step 1})

   Returns a complete lens map with sections, cards, triggers, etc.

   Returns:
   {:id \"lens-id\"
    :display-name \"Human Name\"
    :summary {:text \"...\" :highlights [...] :alerts []}
    :sections [{:id :title :description :layout} ...]
    :cards [{:id :title :display :dataset-query :metadata {...}} ...]
    :drill-lenses [{:id :display-name :description} ...]
    :alert-triggers [...]
    :drill-lens-triggers [...]}"
  {:arglists '([lens-type ctx params])}
  (fn [lens-type _ctx _params] lens-type))

(defmethod make-lens :default
  [lens-type _ctx _params]
  (log/warnf "No lens implementation for type: %s" lens-type)
  {:id           (name lens-type)
   :display-name (str lens-type)
   :summary      {:text nil :highlights [] :alerts []}
   :sections     []
   :cards        []})

;;; -------------------------------------------------- Lens Registry --------------------------------------------------

(defonce ^:private ^{:doc "Atom containing registered lens types.
   Each entry is {:lens-type keyword :priority number :drill? boolean}.
   Lower priority = shown first in discovery."} registry
  (atom []))

(defn register-lens!
  "Register a lens type. Call this at namespace load time.
   Priority controls ordering - lower numbers appear first.
   Set drill? true for lenses only available via triggers."
  ([lens-type priority]
   (register-lens! lens-type priority false))
  ([lens-type priority drill?]
   (swap! registry (fn [lenses]
                     (-> (remove #(= (:lens-type %) lens-type) lenses)
                         (concat [{:lens-type lens-type :priority priority :drill? drill?}])
                         vec)))
   nil))

(defn- registered-lens-types
  "Return registered lens types in priority order, optionally filtering drill lenses."
  ([]
   (registered-lens-types false))
  ([include-drill?]
   (->> @registry
        (filter #(or include-drill? (not (:drill? %))))
        (sort-by :priority)
        (mapv :lens-type))))

;;; -------------------------------------------------- Public API --------------------------------------------------

(defn available-lenses
  "Return metadata for applicable lenses (Phase 1).
   Filters to only lenses that apply to the given context.
   Order is by priority - first lens is the default."
  [ctx]
  (->> (registered-lens-types)
       (filter #(lens-applicable? % ctx))
       (mapv #(lens-metadata % ctx))))

(defn lens-id->type
  "Map lens ID string to lens type keyword."
  [lens-id]
  (keyword lens-id))

(defn get-lens
  "Generate a lens by ID (Phase 2).
   Returns the full lens with sections, cards, and triggers.
   Optional params can filter/customize drill lens output."
  ([ctx lens-id]
   (get-lens ctx lens-id nil))
  ([ctx lens-id params]
   (let [lens-type (lens-id->type lens-id)]
     (if (lens-applicable? lens-type ctx)
       (make-lens lens-type ctx params)
       (throw (ex-info "Lens data not available"
                       {:lens-id   lens-id
                        :lens-type lens-type}))))))
