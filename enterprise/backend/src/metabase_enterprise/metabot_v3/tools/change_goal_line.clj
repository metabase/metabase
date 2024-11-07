(ns metabase-enterprise.metabot-v3.tools.change-goal-line
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-goal-line
  [_tool-name {goal-value :goal-value, show-goal :show-goal, goal-label :goal-label}]
  {:reactions [{:type :metabot.reaction/change-goal-line
                "graph.goal_value" goal-value
                "graph.show_goal" show-goal
                "graph.goal_label" goal-label}]
   :output "success"})
