(ns metabase.metabot.tools.explorations-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.core :as metabot.self]
   [metabase.metabot.tools.explorations :as tools.explorations]
   [metabase.util.json :as json]))

(def ^:private exploration-tool-vars
  [#'tools.explorations/get-research-candidates-tool
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
