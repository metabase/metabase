(ns metabase.lib.transforms.inspector-v2
  "Simple utilities for Transform Inspector v2 trigger evaluation."
  (:require
   [clojure.set :as set]))

(defn- compare-values
  [comparator actual threshold]
  (when (some? actual)
    (case comparator
      :>  (> actual threshold)
      :>= (>= actual threshold)
      :<  (< actual threshold)
      :<= (<= actual threshold)
      :=  (= actual threshold)
      :!= (not= actual threshold)
      false)))

(defn evaluate-condition
  "Evaluate a trigger condition against card results.
   card-results: map of card-id -> result map
   condition: {:card-id \"x\" :field :some-field :comparator :> :threshold 0.5}"
  [card-results {:keys [card-id field comparator threshold]}]
  (when-let [result (get card-results card-id)]
    (let [value (if field (get result field) result)]
      (compare-values comparator value threshold))))

(defn triggered-alerts
  "Return alerts whose conditions are met."
  [card-results alert-triggers]
  (filterv #(evaluate-condition card-results (:condition %)) alert-triggers))

(defn triggered-drill-lenses
  "Return drill lens IDs whose conditions are met."
  [card-results drill-lens-triggers]
  (->> drill-lens-triggers
       (filter #(evaluate-condition card-results (:condition %)))
       (mapv :lens-id)
       distinct
       vec))

(defn evaluate-triggers
  "Evaluate all triggers for a lens against card results.
   Returns {:alerts [...] :drill-lenses [...]}."
  [lens card-results]
  {:alerts      (triggered-alerts card-results (:alert-triggers lens))
   :drill-lenses (triggered-drill-lenses card-results (:drill-lens-triggers lens))})

#?(:cljs
   (defn ^:export evaluateTriggers
     "Evaluate all triggers. Returns {alerts: [...], drillLenses: [...]}."
     [lens-js card-results-js]
     (let [lens (-> (js->clj lens-js :keywordize-keys true)
                    (set/rename-keys {:alertTriggers :alert-triggers
                                      :drillLensTriggers :drill-lens-triggers})
                    (update :alert-triggers #(mapv (fn [t] (update t :condition (fn [c] (update c :comparator keyword)))) %))
                    (update :drill-lens-triggers #(mapv (fn [t] (update t :condition (fn [c] (update c :comparator keyword)))) %)))
           card-results (js->clj card-results-js :keywordize-keys true)]
       (clj->js (evaluate-triggers lens card-results)))))
