(ns metabase-enterprise.llm.tasks.describe-question
  "LLM task(s) for generating question descriptions"
  (:require
   [cheshire.core :as json]
   [clojure.set :refer [rename-keys]]
   [metabase-enterprise.llm.client :as llm-client]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util :as u]))

(defn- question->prompt-data
  "Create a data-oriented summary of a question as input to an LLM for summarization."
  [{:keys [display visualization_settings dataset_query result_metadata]}]
  (let [visualization_settings (u/remove-nils visualization_settings)
        {:keys [query]} (qp.compile/compile-and-splice-parameters dataset_query)]
    (cond->
      {:sql_query           query
       :display_type        display
       :column_descriptions (zipmap
                              (map (some-fn :display_name :name) result_metadata)
                              (map (some-fn :semantic_type :effective_type) result_metadata))}
      (seq visualization_settings)
      (assoc :visualization_settings visualization_settings))))

(defn describe-question
  "Create a human-friendly summary of a card. Returns a map of the form:
  {:title \"Some inferred title\"
   :description \"Some inferred description\"}"
  [question]
  (let [{:keys [visualization_settings] :as description} (question->prompt-data question)
        summary-with-prompts (merge description
                                    {:friendly_title   "%%FILL_THIS_TITLE_IN%%"
                                     :friendly_summary "%%FILL_THIS_SUMMARY_IN%%"})
        json-str             (json/generate-string summary-with-prompts)
        client               (-> (llm-client/create-chat-completion)
                                 (llm-client/wrap-parse-json
                                   (fn [rsp] (rename-keys rsp {:friendly_title   :title
                                                               :friendly_summary :description}))))]
    (client
     {:messages
      [{:role "system"
        :content
        "You are a helpful assistant that fills in the missing \"friendly_title\" and
         \"friendly_summary\" keys in a json fragment.

         Your summary and title should:
          - be concise
          - be informative
          - be easy to understand by a non-technical audience from a variety of backgrounds
          - be discoverable by search engines
          - include caveats and limitations from filters (the query clauses) if applicable
          - not have caveats stated as fact but rather as suggestions
          - not explicitly talk about the visualization type
          - not provide any conclusions about the data

         You like to occasionally use emojis to express yourself but are otherwise very serious and professional."}
       {:role    "assistant"
        :content (cond-> "The \"display\" key is how I intend to present the final data."
                   (seq visualization_settings)
                   (str " The \"visualization_settings\" key has chart settings."))}
       {:role    "assistant"
        :content "The parts you replace are \"%%FILL_THIS_TITLE_IN%%\" and \"%%FILL_THIS_SUMMARY_IN%%\"."}
       {:role    "assistant"
        :content "Return only a json object with the \"friendly_title\" and \"friendly_summary\" fields and nothing else."}
       {:role    "assistant"
        :content "The \"friendly_title\" must be no more than 64 characters long."}
       {:role    "user"
        :content json-str}]})))
