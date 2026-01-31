(ns metabase.lib.transforms.inspector-v2
  "Simple utilities for Transform Inspector v2 trigger evaluation."
  (:require
   [clojure.set :as set]
   [metabase.lib.transforms.inspector.interestingness :as interestingness]))

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
   card-results: map of card-id (string) -> result map (string keys)
   condition: {:card-id \"x\" :field \"some-field\" :comparator :> :threshold 0.5}"
  [card-results {:keys [card-id field comparator threshold]}]
  (when-let [result (get card-results card-id)]
    (let [field-key (if (keyword? field) (name field) field)
          value (if field-key (get result field-key) result)]
      (compare-values comparator value threshold))))

(defn triggered-alerts
  "Return alerts whose conditions are met."
  [card-results alert-triggers]
  (filterv #(evaluate-condition card-results (:condition %)) alert-triggers))

(defn triggered-drill-lenses
  "Return full drill lens trigger objects whose conditions are met."
  [card-results drill-lens-triggers]
  (filterv #(evaluate-condition card-results (:condition %)) drill-lens-triggers))

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
     (let [lens-raw (js->clj lens-js :keywordize-keys true)
           lens (-> lens-raw
                    (set/rename-keys {:alert_triggers :alert-triggers
                                      :drill_lens_triggers :drill-lens-triggers})
                    (update :alert-triggers #(mapv (fn [t]
                                                     (-> t
                                                         (update :condition (fn [c]
                                                                              (-> c
                                                                                  (set/rename-keys {:card_id :card-id})
                                                                                  (update :comparator keyword))))))
                                                   %))
                    (update :drill-lens-triggers #(mapv (fn [t]
                                                          (-> t
                                                              (set/rename-keys {:lens_id :lens-id})
                                                              (update :condition (fn [c]
                                                                                   (-> c
                                                                                       (set/rename-keys {:card_id :card-id})
                                                                                       (update :comparator keyword))))))
                                                        %)))
           card-results (js->clj card-results-js)
           result (evaluate-triggers lens card-results)
           drill-lenses-out (mapv #(set/rename-keys % {:lens-id :lens_id}) (:drill-lenses result))]
       (clj->js {:alerts (:alerts result)
                 :drillLenses drill-lenses-out}))))

#?(:cljs
   (defn ^:export interestingFields
     "Filter and sort fields by interestingness.
      Returns fields with score above threshold, sorted by score descending.
      Options: threshold (default 0.3), limit (default nil = all)."
     [fields-js & {:keys [threshold limit]}]
     (let [fields (-> (js->clj fields-js :keywordize-keys true)
                      ;; Convert snake_case keys to kebab-case
                      (->> (mapv (fn [f]
                                   (-> f
                                       (set/rename-keys {:base_type     :base-type
                                                         :semantic_type :semantic-type
                                                         :display_name  :display-name})
                                       (update :stats #(set/rename-keys % {:distinct_count :distinct-count
                                                                            :nil_percent    :nil-percent})))))))]
       (clj->js (interestingness/interesting-fields fields
                                                     :threshold (or threshold 0.3)
                                                     :limit limit)))))
