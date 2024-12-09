(ns metabase-enterprise.metabot-v3.tools.change-table-visualization-settings-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.metabot-v3.tools.interface :as tools.interface]))

(deftest it-generates-a-reaction
  (is (= {:output "success",
          :reactions [{:visible-columns ["meow" "mix"]
                       :type :metabot.reaction/change-table-visualization-settings}]}
         (tools.interface/*invoke-tool* :metabot.tool/change-table-visualization-settings {:visible-columns ["meow" "mix"]} {}))))

(deftest it-is-only-applicable-for-tables
  (is (tools.interface/*tool-applicable?* :metabot.tool/change-table-visualization-settings
                                          {:current_visualization_settings {:current_display_type "table"}}))
  (is (not (tools.interface/*tool-applicable?* :metabot.tool/change-table-visualization-settings
                                               {:current_visualization_settings {:current_display_type "bar"}})))
  (is (not (tools.interface/*tool-applicable?* :metabot.tool/change-table-visualization-settings
                                               {:current_visualization_settings nil})))
  (is (not (tools.interface/*tool-applicable?* :metabot.tool/change-table-visualization-settings
                                               nil))))
