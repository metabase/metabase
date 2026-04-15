(ns metabase.metabot.suggested-prompts
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.metabot.example-question-generator :as native-generator]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.tools.entity-details :as metabot.tools.entity-details]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- column-input
  [{:keys [base_type effective_type] :as answer-source-column}]
  (some-> answer-source-column
          (select-keys [:name :description :table-reference])
          (assoc :type (or effective_type base_type))))

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

(defn- record-usage!
  "Record LLM token usage from example question generation in MetabotMessage.
  Creates a synthetic conversation so that metabot-stats can pick up the usage."
  [user-id usage]
  (when (seq usage)
    (let [conversation-id (str (random-uuid))
          total-tokens    (->> (vals usage)
                               (map #(+ (:prompt % 0) (:completion % 0)))
                               (reduce + 0))]
      (t2/insert! :model/MetabotConversation
                  {:id      conversation-id
                   :user_id user-id})
      (t2/insert! :model/MetabotMessage
                  {:conversation_id conversation-id
                   :data            []
                   :usage           usage
                   :role            :assistant
                   :profile_id      "example-question-generation"
                   :total_tokens    total-tokens
                   :ai_proxied      (provider-util/metabase-provider?
                                     (metabot.settings/llm-metabot-provider))}))))

(def ^:private default-opts
  {:limit 20})

(defn- generate-questions-with-fallback
  "Generate example questions using the configured path."
  [payload user-id]
  (let [result (native-generator/generate-example-questions payload)]
    (log/info "Native example question generation succeeded"
              {:table-results  (count (:table_questions result))
               :metric-results (count (:metric_questions result))})
    (record-usage! user-id (:usage result))
    result))

(defn generate-sample-prompts
  "Generate suggested prompts for instance of Metabot."
  [metabot-id & {:keys [user-id] :as opts}]
  (let [user-id (or user-id api/*current-user-id*)
        opts    (merge default-opts (dissoc opts :user-id))]
    (lib-be/with-metadata-provider-cache
      (let [{metrics :metric models :model} (->> (metabot.tools.u/get-metrics-and-models metabot-id opts)
                                                 (sort-by :view_count >)
                                                 (group-by :type))
            ;; Limit to 5 metrics and 5 models
            limited-cards (concat (take 5 metrics) (take 5 models))
            {metrics :metric, models :model}
            (->> (for [[[card-type database-id] group-cards] (group-by (juxt :type :database_id) limited-cards)
                       detail (map (fn [detail card] (assoc detail ::origin card))
                                   (metabot.tools.entity-details/cards-details card-type database-id group-cards nil)
                                   group-cards)]
                   detail)
                 (group-by :type))
            metric-inputs (map metric-input metrics)
            model-inputs (map model-input models)
            {:keys [table_questions metric_questions]}
            (generate-questions-with-fallback {:metrics metric-inputs, :tables model-inputs} user-id)
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
