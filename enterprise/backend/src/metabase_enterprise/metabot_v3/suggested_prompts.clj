(ns metabase-enterprise.metabot-v3.suggested-prompts
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.tools.entity-details :as metabot-v3.tools.entity-details]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.lib-be.core :as lib-be]
   [toucan2.core :as t2]))

(defn- column-input
  [answer-source-column]
  (some-> answer-source-column (select-keys [:name :type :description :table-reference])))

(defn- metric-input
  [{:keys [queryable-dimensions default-time-dimension-field-id] :as answer-source-metric}]
  (let [default-time-dimension (when default-time-dimension-field-id
                                 (-> (m/find-first (comp #{default-time-dimension-field-id} :field-id)
                                                   queryable-dimensions)
                                     column-input))]
    (-> answer-source-metric
        (select-keys [:name :description])
        (assoc :queryable-dimensions (map column-input queryable-dimensions))
        (m/assoc-some :default-time-dimension default-time-dimension))))

(defn- model-input
  [answer-source-model]
  (-> answer-source-model
      (select-keys [:name :description :fields])
      (update :fields #(map column-input %))))

(def ^:private default-opts
  {:limit 20})

(defn generate-sample-prompts
  "Generate suggested prompts for instance of Metabot."
  [metabot-id & {:as opts}]
  (let [opts (merge default-opts opts)]
    (lib-be/with-metadata-provider-cache
      (let [{metrics :metric models :model} (->> (metabot-v3.tools.u/get-metrics-and-models metabot-id opts)
                                                 (sort-by :view_count >)
                                                 (group-by :type))
            ;; Limit to 5 metrics and 5 models
            limited-cards (concat (take 5 metrics) (take 5 models))
            {metrics :metric, models :model}
            (->> (for [[[card-type database-id] group-cards] (group-by (juxt :type :database_id) limited-cards)
                       detail (map (fn [detail card] (assoc detail ::origin card))
                                   (metabot-v3.tools.entity-details/cards-details card-type database-id group-cards nil)
                                   group-cards)]
                   detail)
                 (group-by :type))
            metric-inputs (map metric-input metrics)
            model-inputs (map model-input models)
            {:keys [table_questions metric_questions]}
            (metabot-v3.client/generate-example-questions {:metrics metric-inputs, :tables model-inputs})
            ->prompt (fn [{:keys [questions]} {::keys [origin]}]
                       (let [base {:metabot_id metabot-id
                                   :model      (:type origin)
                                   :card_id    (:id origin)}]
                         (map #(assoc base :prompt %) questions)))
            metric-prompts (mapcat ->prompt metric_questions metrics)
            model-prompts (mapcat ->prompt table_questions models)]
        (when (seq metric-prompts)
          (t2/insert! :model/MetabotPrompt metric-prompts))
        (when (seq model-prompts)
          (t2/insert! :model/MetabotPrompt model-prompts))))))

(defn delete-all-metabot-prompts
  "Drop suggested prompts for instance of Metabot."
  [metabot-id]
  (t2/delete! :model/MetabotPrompt {:where [:= :metabot_id metabot-id]}))
