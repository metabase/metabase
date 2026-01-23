;; NOTE: This file is new; ensure this comment remains minimal and purposeful.
(ns metabase-enterprise.metabot-v3.agent.tool-results
  "Format structured tool results for LLM consumption."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.tools.instructions :as instructions]
   [metabase-enterprise.metabot-v3.tools.llm-representations :as llm-rep]))

(set! *warn-on-reflection* true)

(defn- format-with-instructions
  "Wrap data with instructions in InstructionResultSchema format."
  [data instruction-text]
  (str "<result>\n" data "\n</result>\n"
       "<instructions>\n" instruction-text "\n</instructions>"))

(defn- format-query-result
  [{:keys [type query-id database_id query-content result]}]
  (let [query-xml (llm-rep/query->xml {:query-type type
                                       :query-id query-id
                                       :database_id database_id
                                       :query-content query-content
                                       :result result})]
    (format-with-instructions query-xml instructions/query-created-instructions)))

(defn- format-chart-result
  [{:keys [chart-id query-id chart-type]}]
  (let [chart-xml (llm-rep/chart->xml {:chart-id chart-id
                                       :query-id query-id
                                       :chart-type chart-type})]
    (format-with-instructions chart-xml (instructions/chart-created-instructions chart-id))))

(defn- format-search-result
  [{:keys [data total_count]}]
  (let [results-xml (llm-rep/search-results->xml data)]
    (format-with-instructions
     (str results-xml "\n\nTotal results: " total_count)
     instructions/search-result-instructions)))

(defn- format-entity-result
  [{:keys [type] :as structured}]
  (let [entity-xml (llm-rep/entity->xml (assoc structured :type type))]
    (format-with-instructions entity-xml instructions/entity-metadata-instructions)))

(defn- format-metadata-result
  [structured]
  (llm-rep/get-metadata-result->xml structured))

(defn- format-field-metadata-result
  [{:keys [field_id value_metadata]}]
  (format-with-instructions
   (llm-rep/field-metadata->xml {:field_id field_id
                                 :value_metadata value_metadata})
   instructions/field-metadata-instructions))

(defn- format-answer-sources-result
  [{:keys [metrics models]}]
  (let [content (str (when (seq metrics)
                       (str "<metrics>\n"
                            (str/join "\n" (map llm-rep/metric->xml metrics))
                            "\n</metrics>\n"))
                     (when (seq models)
                       (str "<metabase-models>\n"
                            (str/join "\n" (map llm-rep/model->xml models))
                            "\n</metabase-models>")))]
    (format-with-instructions content instructions/answer-sources-instructions)))

(defn- normalize-entity-type
  [type-val]
  (cond
    (keyword? type-val) type-val
    (string? type-val) (keyword type-val)
    :else nil))

(defn- normalize-result-type
  [type-val]
  (cond
    (keyword? type-val) type-val
    (string? type-val) (keyword type-val)
    :else nil))

(defn- infer-result-type
  [structured]
  (cond
    (and (:data structured) (:total_count structured)) :search
    (or (contains? structured :tables) (contains? structured :errors)) :metadata
    (and (contains? structured :metrics) (contains? structured :models)) :answer-sources
    (and (:field_id structured) (contains? structured :value_metadata)) :field-metadata
    (and (:query-id structured) (:query structured)) :query
    (:chart-id structured) :chart
    (#{:table :model :metric :question :user :dashboard} (normalize-entity-type (:type structured))) :entity
    (:instructions structured) :instructions
    :else nil))

(def ^:private formatters
  {:search format-search-result
   :metadata format-metadata-result
   :answer-sources format-answer-sources-result
   :field-metadata format-field-metadata-result
   :query format-query-result
   :chart format-chart-result
   :entity format-entity-result
   :instructions (fn [structured]
                   (format-with-instructions (pr-str (dissoc structured :instructions))
                                             (:instructions structured)))})

(defn format-structured-result
  "Format a structured tool result using declared or inferred result type."
  [structured]
  (let [result-type (or (normalize-result-type (:result-type structured))
                        (infer-result-type structured))]
    (if-let [formatter (get formatters result-type)]
      (formatter (cond-> structured
                   (= result-type :entity) (assoc :type (normalize-entity-type (:type structured)))))
      (pr-str structured))))
