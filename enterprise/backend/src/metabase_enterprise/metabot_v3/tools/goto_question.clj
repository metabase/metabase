(ns metabase-enterprise.metabot-v3.tools.goto-question
  (:require
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/goto-question :- [:map
                                                                                       [:reactions [:sequential ::metabot-v3.reactions/reaction]]
                                                                                       [:output :string]]
  [_tool-name _arg-map]
  {:reactions [{:type :metabot.reaction/goto-question
                :question_id (t2/select-one-pk :model/Card :name "Sales Over Time")}]
   :output "Navigated to question."})
