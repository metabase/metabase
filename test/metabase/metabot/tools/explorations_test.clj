(ns metabase.metabot.tools.explorations-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.explorations :as tools.explorations]))

(deftest ^:parallel remove-from-research-plan-tool-test
  (testing "echoes the block ids the agent asked to remove (pure-echo; the FE applies them)"
    (is (= {:block_ids ["metric:42" "dim:7"] :members nil :timeline_ids nil}
           (tools.explorations/remove-from-research-plan-tool
            {:block_ids ["metric:42" "dim:7"]}))))
  (testing "echoes member-level removals (deselect dimensions/metrics within a group)"
    (is (= {:block_ids    nil
            :members      [{:block_id "metric:42" :dimension_ids ["d1"]}
                           {:block_id "dim:7" :metric_ids [43]}]
            :timeline_ids nil}
           (tools.explorations/remove-from-research-plan-tool
            {:members [{:block_id "metric:42" :dimension_ids ["d1"]}
                       {:block_id "dim:7" :metric_ids [43]}]}))))
  (testing "echoes timeline removals"
    (is (= {:block_ids nil :members nil :timeline_ids [7 9]}
           (tools.explorations/remove-from-research-plan-tool
            {:timeline_ids [7 9]}))))
  (testing "an empty list is valid (a no-op removal)"
    (is (= {:block_ids [] :members nil :timeline_ids nil}
           (tools.explorations/remove-from-research-plan-tool {:block_ids []})))))
