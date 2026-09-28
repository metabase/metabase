(ns metabase.metabot.tools.explorations-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.agent.messages :as messages]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.core :as metabot.self]
   [metabase.metabot.tools.explorations :as tools.explorations]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(def ^:private exploration-tool-vars
  [#'tools.explorations/list-research-metrics-tool
   #'tools.explorations/get-research-candidates-tool
   #'tools.explorations/add-research-groups-tool
   #'tools.explorations/remove-from-research-plan-tool
   #'tools.explorations/set-exploration-name-tool
   #'tools.explorations/select-exploration-timelines-tool])

(deftest tools-declare-registered-scopes-granted-to-nlq-users-test
  (testing "every exploration tool declares a registered :scope, so the per-tool scope check applies
            (a tool with no :scope skips wrap-with-scope-check entirely), AND an NLQ-yes user is
            granted that scope — so adding the gate does not filter the tools away from the
            NLQ-gated :explorations profile that offers them"
    (let [nlq-scopes (scope/user-metabot-perms->scopes {:permission/metabot     :yes
                                                        :permission/metabot-nlq :yes})]
      (doseq [tool-var exploration-tool-vars]
        (let [{tool-name :tool-name required-scope :scope} (meta tool-var)]
          (testing tool-name
            (is (some? required-scope) "declares a :scope")
            (when required-scope
              (is (api-scope/registered-scope? required-scope) "scope is registered")
              (is (api-scope/scope-matches? nlq-scopes required-scope)
                  "scope is granted to an NLQ-yes user"))))))))

(defn- decoded-output
  "The exploration tools return `{:output <json-string>}` (only `:output` survives onto the
   `tool-output-available` stream event the FE consumes); decode it back to a map."
  [result]
  (json/decode+kw (:output result)))

(deftest ^:parallel get-research-candidates-requires-a-filter-test
  (testing "an argument-less call is rejected with an instructive error (the unfiltered catalog is
            the unbounded payload this tool's contract exists to prevent)"
    (doseq [args [{} {:q nil} {:q ""} {:metric_ids nil} {:metric_ids []} {:q "  " :metric_ids []}]]
      (testing (pr-str args)
        (let [{:keys [output]} (tools.explorations/get-research-candidates-tool args)]
          (is (str/starts-with? output "Error:"))
          (is (str/includes? output "list_research_metrics")))))))

(deftest ^:parallel get-research-candidates-caps-metric-ids-test
  (testing "more than the per-call cap of metric_ids is rejected, naming the cap and the count"
    (let [{:keys [output]} (tools.explorations/get-research-candidates-tool
                            {:metric_ids (vec (range 21))})]
      (is (str/starts-with? output "Error:"))
      (is (str/includes? output "at most 20"))
      (is (str/includes? output "got 21")))))

;;; ------------------------------------ add_research_groups ------------------------------------

(defn- picker-payload
  "An `add_research_groups` result: `n-metrics` metrics, all sliceable by one dimension group."
  [n-metrics]
  {:metrics (vec (for [i (range n-metrics)]
                   {:id i :name (str "Metric " i) :dimension_ids [(str "d" i)]}))
   :dimension_groups [{:name "Orders - Region"
                       :dimensions (vec (for [i (range n-metrics)] {:id (str "d" i)}))}]
   :groups []})

(defn- wide-metric-payload
  "An `add_research_groups` result: one metric sliced by `n-dims` distinct dimension groups."
  [n-dims]
  (let [ids (vec (for [i (range n-dims)] (str "d" i)))]
    {:metrics          [{:id 0 :name "Metric 0" :dimension_ids ids}]
     :dimension_groups (vec (for [i (range n-dims)]
                              {:name (str "Group " i) :dimensions [{:id (str "d" i)}]}))
     :groups           [{:metric_id 0 :dimension_ids ids}]}))

(deftest add-research-groups-keeps-the-payload-off-the-llm-wire-test
  (testing "the picker hydration rides a data part the FE consumes; the LLM only sees a summary"
    (let [payload (assoc (picker-payload 3)
                         :groups [{:metric_id 0 :dimension_ids ["d0"]}
                                  {:metric_id 1 :dimension_ids ["d1"] :replace_default_dimensions true}
                                  {:metric_id 2}])]
      (mt/with-dynamic-fn-redefs [tools.explorations/research-groups-payload (fn [_] payload)]
        (let [{:keys [output data-parts]} (tools.explorations/add-research-groups-tool
                                           {:groups (:groups payload)})]
          (testing "the payload is on the data part, not in :output"
            (is (= [{:type :data :data-type "research_plan_update" :data payload}] data-parts)))
          (testing ":output is prose naming what the user got, not the payload"
            (is (= (str "Added 3 group(s) to the research plan:\n"
                        "- Metric 0, by: Orders - Region, plus the automatic selection\n"
                        "- Metric 1, by exactly: Orders - Region\n"
                        "- Metric 2, by the automatically-selected dimensions")
                   output))))))))

(deftest add-research-groups-summary-tolerates-unnamed-dimensions-test
  (testing (str "groups are validated against the unresolved catalog, so a dimension can pass "
                "validation and still be absent from the hydrated payload (its metric's query "
                "can't break out on it) — the summary skips what it can't name rather than "
                "throwing away the whole tool call")
    (let [payload (assoc (picker-payload 1)
                         :groups [{:metric_id 0 :dimension_ids ["d0" "unresolved"]}])]
      (mt/with-dynamic-fn-redefs [tools.explorations/research-groups-payload (fn [_] payload)]
        (is (= (str "Added 1 group(s) to the research plan:\n"
                    "- Metric 0, by: Orders - Region, plus the automatic selection")
               (:output (tools.explorations/add-research-groups-tool
                         {:groups (:groups payload)}))))))))

(deftest add-research-groups-summary-is-bounded-test
  (testing "a metric can be sliced by a long dimension list, so the summary counts the tail
            instead of listing it — :output is the agent's context, not a report"
    (let [summary-for (fn [n-dims]
                        (let [payload (wide-metric-payload n-dims)]
                          (mt/with-dynamic-fn-redefs [tools.explorations/research-groups-payload (fn [_] payload)]
                            (:output (tools.explorations/add-research-groups-tool
                                      {:groups (:groups payload)})))))
          fifty       (summary-for 50)]
      (testing "the tail past the first `summary-max-names` members is counted, not listed"
        (is (str/includes? fifty "and 35 more")))
      (testing "so a 10x longer dimension list costs only the extra digits in that count"
        (is (> 5 (- (count (summary-for 500)) (count fifty))))))))

(deftest ^:parallel remove-from-research-plan-tool-test
  (testing "echoes the block ids the agent asked to remove (pure-echo; the FE applies them)"
    (is (= {:block_ids ["metric:42" "metric:43"] :members nil :timeline_ids nil}
           (decoded-output
            (tools.explorations/remove-from-research-plan-tool
             {:block_ids ["metric:42" "metric:43"]})))))
  (testing "echoes member-level removals (deselect dimensions within a group)"
    (is (= {:block_ids    nil
            :members      [{:block_id "metric:42" :dimension_ids ["d1"]}
                           {:block_id "metric:43" :dimension_ids ["d2" "d3"]}]
            :timeline_ids nil}
           (decoded-output
            (tools.explorations/remove-from-research-plan-tool
             {:members [{:block_id "metric:42" :dimension_ids ["d1"]}
                        {:block_id "metric:43" :dimension_ids ["d2" "d3"]}]})))))
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

(deftest ^:parallel research-plan-update-part-reaches-the-wire-test
  (testing (str "add_research_groups' picker payload is the plan edit, and it now travels as a "
                "data part rather than in :output — if it never reached the client the plan would "
                "silently never update, the same failure the :output tools guard against below")
    (let [payload {:metrics [{:id 1}] :dimension_groups [] :groups []}
          events  (into [] (comp streaming/expand-data-parts-xf (metabot.self/parts->aisdk-sse-xf))
                        [{:type :start :id "s1"}
                         {:type   :tool-output :id "tc1"
                          :result {:output     "Added 1 group(s) to the research plan:"
                                   :data-parts [(streaming/research-plan-update-part payload)]}}])
          event   (some #(when (str/includes? % "\"data-research_plan_update\"")
                           (json/decode+kw (str/replace-first % "data: " "")))
                        events)]
      (is (some? event) "a data-research_plan_update event is streamed")
      (is (= [{:id 1}] (get-in event [:data :metrics])))
      (testing "stamped with the tool call it came from, so the client can attribute it"
        (is (= "tc1" (get-in event [:data :tool_call_id])))))))

(deftest ^:parallel plan-tool-results-reach-the-wire-test
  (testing (str "the exploration chat FE applies the smaller plan edits by parsing the streamed "
                "tool result; only a result's :output string makes it onto tool-output-available, "
                "so a bare-map result would stream as \"\" and the plan would silently never update")
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
                           :metric     {:id 42 :name "Revenue"}
                           :dimensions [{:id "d1" :name "Region"}
                                        {:id "d2" :name "Plan"}]}
                          {:block_id   "metric:43"
                           :metric     {:id 43 :name "Churn"}
                           :dimensions [{:id "d7" :name "Plan"}]}]
              :timelines [{:id 1 :name "Releases"}]}]
    (testing "renders groups with block ids, name, and timelines"
      (let [result (tools.explorations/format-research-plan {:research_plan plan})]
        (is (string? result))
        (is (str/includes? result "Why was revenue down?"))
        ;; each group surfaces its block id and selected dimensions with their ids
        (is (str/includes? result "[metric:42] Revenue, broken out by: Region (d1), Plan (d2)"))
        (is (str/includes? result "[metric:43] Churn, broken out by: Plan (d7)"))
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
