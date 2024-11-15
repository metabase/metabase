(ns metabase-enterprise.metabot-v3.tools.change-chart-appearance
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-chart-appearance
  [_tool-name {goal :goal, trend-line :trend-line, data-labels :data-labels, total :total, stack-type :stack-type, max-series-count :max-series-count, axes-labels :axes-labels, y-axis-range :y-axis-range}]
  {:reactions [{:type :metabot.reaction/change-chart-appearance
                :goal (when goal
                        {:goal_value (:goal_value goal)
                         :show_goal (:show_goal goal)
                         :goal_label (:goal_label goal)})
                :trend_line trend-line
                :data_labels (when data-labels
                               {:show_data_labels (:show_data_labels data-labels)
                                :data_label_format (:data_label_format data-labels)
                                :pie_chart_percent_visibility (:pie_chart_percent_visibility data-labels)})
                :total total
                :stack_type stack-type
                :max_series_count max-series-count
                :axes_labels (when axes-labels
                               {:x_axis_label (:x_axis_label axes-labels)
                                :y_axis_label (:y_axis_label axes-labels)})
                :y_axis_range (when y-axis-range
                                {:auto_range (:auto_range y-axis-range)
                                 :min (:min y-axis-range)
                                 :max (:max y-axis-range)})}]
   :output "success"})
