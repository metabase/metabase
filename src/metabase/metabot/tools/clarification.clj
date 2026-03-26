(ns metabase.metabot.tools.clarification
  "Clarification tool wrappers."
  (:require
   [clojure.string :as str]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn ask-for-sql-clarification
  "Ask the user for clarification about their SQL query request.

  This tool is used when the agent needs more information from the user
  to properly complete their SQL request. It returns a final response
  that stops the agent loop and waits for user input.

  Parameters:
  - question: The clarification question to ask the user
  - options: Optional list of suggested answers/choices

  Returns map with:
  - :structured-output - The question and options for the LLM
  - :final-response? - Signals that the agent should stop and wait for user input
  - :instructions - Instructions for the LLM"
  [{:keys [question options]}]
  (log/info "Asking for SQL clarification" {:question question
                                            :option-count (count options)})
  {:structured-output {:question question
                       :options (or options [])}
   :final-response? true
   :instructions "The clarification question has been presented to the user. Stop and wait for their response before continuing."})

(defn- format-clarification-output
  [{:keys [question options]}]
  (str question
       (when (seq options)
         (str "\n\nOptions:\n" (str/join "\n" (map #(str "- " %) options))))))

(mu/defn ^{:tool-name "ask_for_sql_clarification"}
  ask-for-sql-clarification-tool
  "Ask the user for clarification about their SQL query request.

  Use this tool when you need more information from the user to properly
  complete their SQL request. The agent will stop and wait for the user's response."
  [{:keys [question options]} :- [:map {:closed true}
                                  [:question :string]
                                  [:options {:optional true} [:maybe [:sequential :string]]]]]
  (try
    (let [result (ask-for-sql-clarification {:question question
                                             :options options})]
      (assoc result :output (format-clarification-output (:structured-output result))))
    (catch Exception e
      {:output (str "Failed to ask clarification: " (or (ex-message e) "Unknown error"))})))
