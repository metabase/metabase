(ns metabase-enterprise.metabot-v3.tools.apply-visualizations
  (:require
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/apply-visualizations :- [:sequential ::metabot-v3.reactions/reaction]
  [_tool-name args]
  {:reactions [(merge {:type :metabot.reaction/apply-visualizations}
                      (select-keys args [:display :filters :summarizations :groups]))]
   :output "The visualizations will be applied."})
