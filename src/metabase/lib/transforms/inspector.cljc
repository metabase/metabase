(ns metabase.lib.transforms.inspector
  "Transform Inspector utilities - portable logic for FE.

   This namespace provides cross-platform functions for:
   - Scoring column interestingness
   - Detecting degenerate card results
   - Evaluating heuristic triggers for alerts and drill-lenses

   The actual inspector implementation (lens discovery, card generation, query building)
   lives in metabase-enterprise.transforms.inspector (BE only).

   For ClojureScript/JS usage, use the ^:export functions which handle
   JS<->CLJS data conversion automatically:
   - evaluateTriggers: Evaluate alert/drill-lens triggers after card execution
   - checkDegenerate: Check if card results are degenerate
   - scoreField: Score a field for visualization worthiness"
  (:require
   #?(:cljs [clojure.set :as set])
   [metabase.lib.transforms.inspector.degeneracy :as degeneracy]
   [metabase.lib.transforms.inspector.heuristics :as heuristics]
   [metabase.lib.transforms.inspector.interestingness :as interestingness]))

;;; -------------------------------------------------- Re-exports --------------------------------------------------

;; Interestingness
(def dominated-column? interestingness/dominated-column?)
(def score-field interestingness/score-field)
(def interesting-fields interestingness/interesting-fields)

;; Degeneracy
(def degenerate? degeneracy/degenerate?)
(def filter-degenerate-cards degeneracy/filter-degenerate-cards)

;; Heuristics
(def evaluate-triggers heuristics/evaluate-triggers)

;;; -------------------------------------------------- JS Interop --------------------------------------------------

#?(:cljs
   (defn- normalize-card-summary
     "Normalize JS camelCase keys to Clojure kebab-case."
     [m]
     (set/rename-keys m {:rowCount     :row-count
                         :firstRow     :first-row
                         :nullRate     :null-rate
                         :isDegenerate :is-degenerate})))

#?(:cljs
   (defn ^:export checkDegenerate
     "Check if a card result is degenerate.

      Arguments (JS):
      - cardId: string - the card's ID (for companion card lookup)
      - cardSummary: {rowCount: number, firstRow: any[], isDegenerate?: boolean}
      - displayType: string like 'bar', 'line', 'scalar'
      - cardSummaries: (optional) {cardId: {rowCount, firstRow, ...}, ...} for companion card lookup

      Returns (JS):
      - {degenerate: boolean, reason: string|null}"
     ([card-id-js card-summary-js display-type-js]
      (checkDegenerate card-id-js card-summary-js display-type-js nil))
     ([card-id-js card-summary-js display-type-js card-summaries-js]
      (let [card-id        (str card-id-js)
            card-summary   (-> card-summary-js
                               (js->clj :keywordize-keys true)
                               normalize-card-summary)
            display-type   (keyword display-type-js)
            card-summaries (when card-summaries-js
                             (->> (js->clj card-summaries-js :keywordize-keys true)
                                  (map (fn [[k v]]
                                         [(name k) (normalize-card-summary v)]))
                                  (into {})))
            result         (degeneracy/degenerate? card-id card-summary display-type card-summaries)]
        (clj->js {:degenerate (:degenerate? result)
                  :reason     (some-> (:reason result) name)})))))

#?(:cljs
   (defn ^:export scoreField
     "Score a field for visualization worthiness.

      Arguments (JS):
      - field: {name: string, baseType: string, semanticType?: string, stats?: {...}}

      Returns (JS):
      - {score: number, dominated: boolean, reasons: string[]}"
     [field-js]
     (let [field  (-> field-js
                      (js->clj :keywordize-keys true)
                      (set/rename-keys {:baseType     :base-type
                                        :semanticType :semantic-type
                                        :displayName  :display-name})
                      ;; Convert type strings to keywords
                      (update :base-type keyword)
                      (update :semantic-type #(some-> % keyword)))
           result (interestingness/score-field field)]
       (clj->js {:score     (:score result)
                 :dominated (:dominated? result)
                 :reasons   (mapv name (:reasons result))}))))

#?(:cljs
   (defn ^:export evaluateTriggers
     "Evaluate all triggers against card summaries.

      Arguments (JS):
      - lens: the lens response from BE API, containing {alertTriggers: [...], drillLensTriggers: [...]}
      - cardSummaries: {cardId: {rowCount: number, firstRow: any[], ...}, ...}

      Returns (JS):
      - {alerts: [...], activatedDrillLenses: [...], degenerateCards: [...]}"
     [lens-js card-summaries-js]
     (let [;; Convert lens definition
           lens (-> lens-js
                    (js->clj :keywordize-keys true)
                    (set/rename-keys {:alertTriggers     :alert-triggers
                                      :drillLensTriggers :drill-lens-triggers}))
           ;; Convert card summaries map
           card-summaries (->> (js->clj card-summaries-js :keywordize-keys true)
                               (map (fn [[k v]]
                                      [(name k) (normalize-card-summary v)]))
                               (into {}))
           result (heuristics/evaluate-triggers lens card-summaries)]
       ;; Convert back to JS with camelCase
       (clj->js {:alerts               (:alerts result)
                 :activatedDrillLenses (:activated-drill-lenses result)
                 :degenerateCards      (:degenerate-cards result)}))))
