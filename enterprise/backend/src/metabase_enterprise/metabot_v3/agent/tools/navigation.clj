(ns metabase-enterprise.metabot-v3.agent.tools.navigation
  "Navigation tool wrappers."
  (:require
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.tools.navigate :as navigate-tools]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "navigate_user"} navigate-user-tool
  "Navigate the user to a specific page or entity in Metabase.

  Use this tool to direct users to:
  - Pages: notebook_editor, metrics_browser, model_browser, database_browser, sql_editor
  - Entities: table, model, question, metric, dashboard
  - Query results or charts from the current conversation"
  [{:keys [destination]}
   :- [:map {:closed true}
       [:destination [:or
                      [:map {:closed true}
                       [:page [:enum "notebook_editor" "metrics_browser" "model_browser" "database_browser"]]]
                      [:map {:closed true}
                       [:page [:enum "sql_editor"]]
                       [:database_id :int]]
                      [:map {:closed true}
                       [:entity_type [:enum "table" "model" "question" "metric" "dashboard"]]
                       [:entity_id :int]]
                      [:map {:closed true}
                       [:query_id :string]]
                      [:map {:closed true}
                       [:chart_id :string]]]]]]
  (navigate-tools/navigate-tool {:destination destination
                                 :memory-atom shared/*memory-atom*}))
