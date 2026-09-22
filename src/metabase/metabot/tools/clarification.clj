(ns metabase.metabot.tools.clarification
  "Clarification tool wrappers."
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn ask-for-sql-clarification
  "Ask the user for clarification about their SQL query request.

  This tool is used when the agent needs more information from the user
  to properly complete their SQL request. Profiles that list
  `ask_for_sql_clarification` in their `:terminal-tools` (e.g. `:sql`) end the
  turn on a successful call and wait for user input.

  Parameters:
  - question: The clarification question to ask the user
  - options: Optional list of suggested answers/choices

  Returns map with:
  - :structured-output - The question and options for the LLM
  - :instructions - Instructions for the LLM"
  [{:keys [question options]}]
  (log/info "Asking for SQL clarification" {:option-count (count options)})
  {:structured-output {:question question
                       :options (or options [])}
   :instructions "The clarification question has been presented to the user. Stop and wait for their response before continuing."})

(defn- format-clarification-output
  [{:keys [question options]}]
  (str question
       (when (seq options)
         (str "\n\nOptions:\n" (str/join "\n" (map #(str "- " %) options))))))

(mu/defn ^{:tool-name "ask_for_sql_clarification"
           :scope     scope/agent-sql-read}
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

(mu/defn ^{:tool-name "ask_user"}
  ask-user-tool
  "Ask the user a clarifying question and stop until they answer. Use this instead of guessing when
  the request is ambiguous or you are missing something only the user can supply (which database, which
  metric definition, a date range). `question` is what to ask; `options` optionally offers a few
  suggested answers. Prefer answering directly when you can — only ask when a wrong guess would waste
  work. The question and options are shown to the user as your message, so don't also write them out
  yourself; put choices in `options` rather than in the question. Options appear as a numbered list, so
  the user may reply with a number. In a profile that lists ask_user as terminal, a successful call ends
  the turn and waits for the reply."
  [{:keys [question options]} :- [:map {:closed true}
                                  [:question :string]
                                  [:options {:optional true} [:maybe [:sequential :string]]]]]
  (let [user-question {:question question :options (or options [])}]
    {:structured-output user-question
     ;; tool results aren't rendered to the user, so `:user-question` is how the question reaches them
     :user-question     user-question
     :instructions      "The question has been presented to the user. Stop and wait for their response before continuing."
     :output            (format-clarification-output user-question)}))
