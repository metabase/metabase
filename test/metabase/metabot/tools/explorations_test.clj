(ns metabase.metabot.tools.explorations-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.agent.messages :as messages]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.self.core :as metabot.self]
   [metabase.metabot.tools.explorations :as tools.explorations]
   [metabase.util.json :as json]))

(defn- decoded-output
  "The exploration tools return `{:output <json-string>}` (only `:output` survives onto the
   `tool-output-available` stream event the FE consumes); decode it back to a map."
  [result]
  (json/decode+kw (:output result)))

(deftest ^:parallel remove-from-research-plan-tool-test
  (testing "echoes the block ids the agent asked to remove (pure-echo; the FE applies them)"
    (is (= {:block_ids ["metric:42" "dim:7"] :members nil :timeline_ids nil}
           (decoded-output
            (tools.explorations/remove-from-research-plan-tool
             {:block_ids ["metric:42" "dim:7"]})))))
  (testing "echoes member-level removals (deselect dimensions/metrics within a group)"
    (is (= {:block_ids    nil
            :members      [{:block_id "metric:42" :dimension_ids ["d1"]}
                           {:block_id "dim:7" :metric_ids [43]}]
            :timeline_ids nil}
           (decoded-output
            (tools.explorations/remove-from-research-plan-tool
             {:members [{:block_id "metric:42" :dimension_ids ["d1"]}
                        {:block_id "dim:7" :metric_ids [43]}]})))))
  (testing "echoes timeline removals"
    (is (= {:block_ids nil :members nil :timeline_ids [7 9]}
           (decoded-output
            (tools.explorations/remove-from-research-plan-tool
             {:timeline_ids [7 9]})))))
  (testing "an empty list is valid (a no-op removal)"
    (is (= {:block_ids [] :members nil :timeline_ids nil}
           (decoded-output
            (tools.explorations/remove-from-research-plan-tool {:block_ids []}))))))

(defn- streamed-tool-output
  "Run a tool `result` through the SSE serializer and return the decoded payload the FE would
   see: the `tool-output-available` event's `:output` string, JSON-parsed."
  [result]
  (let [events (into [] (metabot.self/parts->aisdk-sse-xf)
                     [{:type :start :id "s1"}
                      {:type :tool-output :id "tc1" :result result}])
        event  (some #(when (str/includes? % "\"tool-output-available\"")
                        (json/decode+kw (str/replace-first % "data: " "")))
                     events)]
    (some-> (:output event) json/decode+kw)))

(deftest ^:parallel plan-tool-results-reach-the-wire-test
  (testing (str "the exploration chat FE applies plan edits by parsing the streamed tool result; "
                "only a result's :output string makes it onto tool-output-available, so a bare-map "
                "result would stream as \"\" and the plan would silently never update")
    (testing "set_research_name"
      (is (= {:name "Quarterly revenue"}
             (streamed-tool-output
              (tools.explorations/set-exploration-name-tool {:name "Quarterly revenue"})))))
    (testing "select_research_timelines"
      (is (= {:timeline_ids [3 5]}
             (streamed-tool-output
              (tools.explorations/select-exploration-timelines-tool {:timeline_ids [3 5]})))))
    (testing "remove_from_research_plan"
      (is (= {:block_ids ["metric:42"] :members nil :timeline_ids nil}
             (streamed-tool-output
              (tools.explorations/remove-from-research-plan-tool {:block_ids ["metric:42"]})))))))

;;; ----------------------------------------- Research plan → system prompt -----------------------------------------

(deftest ^:parallel format-research-plan-test
  (let [plan {:name      "Why was revenue down?"
              :groups    [{:block_id   "metric:42"
                           :anchor     "metric"
                           :metric     {:id 42 :name "Revenue"}
                           :dimensions [{:id "d1" :name "Region"}
                                        {:id "d2" :name "Plan"}]}
                          {:block_id "dim:7"
                           :anchor   "dimension"
                           :dimension {:id "d7" :name "Plan"}
                           :metrics  [{:id 42 :name "Revenue"}
                                      {:id 43 :name "Churn"}]}]
              :timelines [{:id 1 :name "Releases"}]}]
    (testing "renders groups with block ids, name, and timelines"
      (let [result (tools.explorations/format-research-plan {:research_plan plan})]
        (is (string? result))
        (is (str/includes? result "Why was revenue down?"))
        ;; metric-anchored group surfaces its block id and selected dimensions with their ids
        (is (str/includes? result "[metric:42] Revenue, broken out by: Region (d1), Plan (d2)"))
        ;; dimension-anchored group surfaces its block id and the metrics it slices with their ids
        (is (str/includes? result "[dim:7] by Plan, slicing: Revenue (42), Churn (43)"))
        (is (str/includes? result "Selected timelines: Releases (1)"))))
    (testing "returns nil when there is no plan in context"
      (is (nil? (tools.explorations/format-research-plan {}))))
    (testing "returns nil for an empty plan so the template guard stays false"
      (is (nil? (tools.explorations/format-research-plan
                 {:research_plan {:name "" :groups [] :timelines []}}))))
    (testing "renders a name-only plan (empty groups/timelines)"
      (is (str/includes? (tools.explorations/format-research-plan
                          {:research_plan {:name "Draft" :groups [] :timelines []}})
                         "Draft")))))

(deftest explorations-profile-renders-research-plan-in-system-prompt-test
  (testing "the registered :explorations profile wires research-plan-system-context, so a draft plan
            reaches the LLM's system prompt (the feature the generic agent no longer knows about)"
    (let [profile (profiles/get-profile :explorations)
          plan    {:name   "Why was revenue down?"
                   :groups [{:block_id   "metric:42"
                             :anchor     "metric"
                             :metric     {:id 42 :name "Revenue"}
                             :dimensions [{:id "d1" :name "Region"}]}]}
          content (:content (messages/build-system-message {:research_plan plan} profile {}))]
      (is (str/includes? content "Current research plan"))
      (is (str/includes? content "Why was revenue down?"))
      (is (str/includes? content "[metric:42] Revenue, broken out by: Region (d1)")))
    (testing "and omits the plan section entirely when there is no plan"
      (let [content (:content (messages/build-system-message
                               {} (profiles/get-profile :explorations) {}))]
        (is (not (str/includes? content "Current research plan")))))))
