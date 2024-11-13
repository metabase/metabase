(ns metabase-enterprise.metabot-v3.tools.change-table-cells-style
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-table-cells-style
  [_tool-name context]
  (contains? #{"table" "pivot"}
              (some-> context :current_visualization_settings :current_display_type)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-table-cells-style
  [_tool-name {:keys [single-color-cell-styles numeric-gradient-cell-styles removed-styles], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/change-table-cells-style
                :single_color_cell_styles single-color-cell-styles
                :numeric_gradient_cell_styles numeric-gradient-cell-styles
                :removed_styles removed-styles}]
   :output "success"})
