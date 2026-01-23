(ns metabase-enterprise.metabot-v3.agent.tools.clarification
  "Clarification tool wrappers."
  (:require
   [metabase-enterprise.metabot-v3.tools.ask-clarification :as ask-clarification-tools]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "ask_for_sql_clarification"} ask-for-sql-clarification-tool
  "Ask the user for clarification about their SQL query request.

  Use this tool when you need more information from the user to properly
  complete their SQL request. The agent will stop and wait for the user's response."
  [{:keys [question options]}
   :- [:map {:closed true}
       [:question :string]
       [:options {:optional true} [:maybe [:sequential :string]]]]]
  (ask-clarification-tools/ask-for-sql-clarification-tool {:question question
                                                           :options options}))
