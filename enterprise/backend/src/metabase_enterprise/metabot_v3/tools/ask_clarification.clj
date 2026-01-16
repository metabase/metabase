(ns metabase-enterprise.metabot-v3.tools.ask-clarification
  "Tool for asking users clarification questions about SQL query requests.
  This is an 'external' tool that signals the agent should stop and wait for user input."
  (:require
   [metabase.util.log :as log]))

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

(defn ask-for-sql-clarification-tool
  "Tool handler for ask_for_sql_clarification tool."
  [args]
  (try
    (ask-for-sql-clarification args)
    (catch Exception e
      (log/error e "Error asking for clarification")
      {:output (str "Failed to ask clarification: " (or (ex-message e) "Unknown error"))})))
