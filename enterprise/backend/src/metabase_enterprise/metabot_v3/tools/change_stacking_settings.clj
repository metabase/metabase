(ns metabase-enterprise.metabot-v3.tools.change-stacking-settings
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-stacking-settings
  [_tool-name {stack-type :stack-type}]
  {:reactions [{:type :metabot.reaction/change-stacking-settings
                "stackable.stack_type" stack-type}]
   :output "success"})
