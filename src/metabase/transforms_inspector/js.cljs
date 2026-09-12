(ns metabase.transforms-inspector.js
  "Javascript-facing interface for transform inspector. Wraps functions in metabase.transforms-inspector.core"
  (:require
   [metabase.transforms-inspector.core :as inspector]
   [metabase.util.malli :as mu]))

(def ^:private empty-triggers #js {:alerts #js [] :drill_lenses #js []})

(mu/defn ^:export evaluateTriggers :- [:any {:ts/object-of [:map
                                                            [:alerts [:any {:ts/array-of [:map
                                                                                          [:id :string]
                                                                                          [:condition [:map
                                                                                                       [:name :string]
                                                                                                       [:card_id :string]]]
                                                                                          [:severity [:enum "info" "warning" "error"]]
                                                                                          [:message :string]]}]]
                                                            [:drill_lenses [:any {:ts/array-of [:map
                                                                                                [:lens_id :string]
                                                                                                [:condition [:map
                                                                                                             [:name :string]
                                                                                                             [:card_id :string]]]
                                                                                                [:params {:optional true} [:map-of :string [:or :string :int]]]
                                                                                                [:reason {:optional true} :string]]}]]]}]
  "Evaluate all triggers. Returns {alerts: [...], drill_lenses: [...]}."
  [lens-js card-results-js]
  (if (and (empty? (unchecked-get lens-js "alert_triggers"))
           (empty? (unchecked-get lens-js "drill_lens_triggers")))
    empty-triggers
    (let [lens (-> (js->clj lens-js :keywordize-keys true)
                   (update :alert_triggers #(mapv (fn [t] (update t :condition (fn [c] (update c :name keyword)))) %))
                   (update :drill_lens_triggers #(mapv (fn [t] (update t :condition (fn [c] (update c :name keyword)))) %)))
          card-results (js->clj card-results-js)
          result (inspector/evaluate-triggers lens card-results)]
      (clj->js result))))

(mu/defn ^:export computeCardResult :- [:maybe [:any {:ts/object-of [:map-of :string :any]}]]
  "Compute derived fields from first row of query result for a card.
   Returns a JS object with computed fields, or null if no computation needed."
  [lens-id card-js rows-js]
  (let [lens-kw (keyword lens-id)
        card (js->clj card-js :keywordize-keys true)
        row (js->clj (aget rows-js 0))]
    (when-let [result (inspector/compute-card-result lens-kw card row)]
      (clj->js result))))

(mu/defn ^:export interestingFields :- [:any {:ts/array-of [:map
                                                            [:name :string]
                                                            [:id {:optional true} :int]
                                                            [:display_name {:optional true} :string]
                                                            [:base_type {:optional true} :string]
                                                            [:semantic_type {:optional true} :string]
                                                            [:stats {:optional true} :map]
                                                            [:interestingness [:map [:score :double]]]]}]
  "Filter and sort fields by interestingness.
   Returns fields with score above threshold, sorted by score descending.
   Options: visited_fields (ignored for now), threshold (default 0.3), limit (default nil = all)."
  [fields-js visited-fields-js threshold limit]
  (let [fields (js->clj fields-js :keywordize-keys true)
        visited-fields (js->clj visited-fields-js :keywordize-keys true)]
    (clj->js (inspector/interesting-fields fields
                                           {:visited_fields visited-fields
                                            :threshold      (or threshold 0.3)
                                            :limit          limit}))))

(mu/defn ^:export isDegenerate :- [:any {:ts/object-of [:map
                                                        [:degenerate :boolean]
                                                        [:reason [:maybe :string]]]}]
  "Check if a card result is degenerate and shouldn't be displayed.
   Returns {degenerate: bool, reason: string|null}."
  [card-id display-type card-results-js]
  (let [card-results (js->clj card-results-js)
        display-kw (keyword display-type)
        result (inspector/degenerate? card-id display-kw card-results)]
    (clj->js {:degenerate (:degenerate? result)
              :reason (some-> (:reason result) name)})))
