(ns metabase.metabot.tools.clarification
  "Clarification tool wrappers."
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- format-clarification-output
  [{:keys [question options]}]
  (str question
       (when (seq options)
         (str "\n\nOptions:\n" (str/join "\n" (map #(str "- " %) options))))))

(defrecord AskForSqlClarificationTool []
  tools/Tool
  (declaration [_]
    {:name "ask_for_sql_clarification"
     :description (str "Ask the user for clarification about their SQL query request.\n\n"
                       "Use this tool when you need more information from the user to properly "
                       "complete their SQL request. The agent will stop and wait for the user's response.")
     :scope scope/agent-sql-read
     :args [:map {:closed true}
            [:question :string]
            [:options {:optional true} [:maybe [:sequential :string]]]]})
  (handle [_ args _ctx]
    (log/info "Asking for SQL clarification" {:option-count (count (:options args))})
    {:output (format-clarification-output args)}))

(def ask-for-sql-clarification-tool
  "The tool that asks the user to clarify their SQL request."
  (->AskForSqlClarificationTool))
