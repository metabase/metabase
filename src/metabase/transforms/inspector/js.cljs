(ns metabase.transforms.inspector.js
  "Javascript-facing interface for transform inspector. Wraps functions in metabase.transforms.inspector.core"
  (:require
   [clojure.set :as set]
   [metabase.transforms.inspector.core :as inspector]))

(defn ^:export evaluateTriggers
  "Evaluate all triggers. Returns {alerts: [...], drillLenses: [...]}."
  [lens-js card-results-js]
  (let [lens-raw (js->clj lens-js :keywordize-keys true)
        convert-condition (fn [c] (update c :name keyword))
        lens (-> lens-raw
                 (set/rename-keys {:alert_triggers :alert-triggers
                                   :drill_lens_triggers :drill-lens-triggers})
                 (update :alert-triggers #(mapv (fn [t] (update t :condition convert-condition)) %))
                 (update :drill-lens-triggers #(mapv (fn [t]
                                                       (-> t
                                                           (set/rename-keys {:lens_id :lens-id})
                                                           (update :condition convert-condition)))
                                                     %)))
        card-results (js->clj card-results-js)
        result (inspector/evaluate-triggers lens card-results)
        drill-lenses-out (mapv #(set/rename-keys % {:lens-id :lens_id}) (:drill-lenses result))]
    (clj->js {:alerts (:alerts result)
              :drillLenses drill-lenses-out})))

(defn ^:export computeCardResult
  "Compute derived fields from first row of query result for a card.
   Returns a JS object with computed fields, or null if no computation needed."
  [lens-id card-js rows-js]
  (let [lens-kw (keyword lens-id)
        card (-> (js->clj card-js :keywordize-keys true)
                 (update :metadata #(set/rename-keys % {:card_type :card-type})))
        row (js->clj (aget rows-js 0))]
    (when-let [result (inspector/compute-card-result lens-kw card row)]
      (clj->js result))))

(defn ^:export interestingFields
  "Filter and sort fields by interestingness.
   Returns fields with score above threshold, sorted by score descending.
   Options: threshold (default 0.3), limit (default nil = all)."
  [fields-js & {:keys [threshold limit]}]
  (let [fields (-> (js->clj fields-js :keywordize-keys true)
                   (->> (mapv (fn [f]
                                (-> f
                                    (set/rename-keys {:base_type     :base-type
                                                      :semantic_type :semantic-type
                                                      :display_name  :display-name})
                                    (update :stats #(set/rename-keys % {:distinct_count :distinct-count
                                                                        :nil_percent    :nil-percent})))))))]
    (clj->js (inspector/interesting-fields fields
                                           :threshold (or threshold 0.3)
                                           :limit limit))))
