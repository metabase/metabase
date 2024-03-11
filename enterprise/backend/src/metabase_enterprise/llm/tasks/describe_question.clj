(ns metabase-enterprise.llm.tasks.describe-question
  "LLM task(s) for generating question descriptions"
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
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
  (let [{:keys [visualization_settings] :as description}
        (question->prompt-data question)
        summary-with-prompts (merge description
                                    {:friendly_title   "%%FILL_THIS_TITLE_IN%%"
                                     :friendly_summary "%%FILL_THIS_SUMMARY_IN%%"})
        json-str             (json/generate-string summary-with-prompts)
        client               (-> (llm-client/create-chat-completion)
                                 (llm-client/wrap-parse-json
                                  (fn [rsp] (rename-keys rsp {:friendly_title   :title
                                                              :friendly_summary :description}))))
        prompt               (read-string (slurp (io/resource "prompt.edn")))
        display-message      {:role    "assistant"
                              :content (cond-> "The \"display\" key is how I intend to present the final data."
                                         (seq visualization_settings)
                                         (str " The \"visualization_settings\" key has chart settings."))}
        summary-message      {:role    "user"
                              :content json-str}
        messages             (mapv (fn [message]
                                     (case message
                                       :display-message display-message
                                       :summary-message summary-message
                                       message)) prompt)]
    (client
     {:messages messages})))
