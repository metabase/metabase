(ns metabase.metabot.tools.explorations-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.explorations.core :as explorations]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.messages :as messages]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.core :as metabot.self]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.explorations :as tools.explorations]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(def ^:private research-scopes
  "The scopes of a user granted Metabot and NLQ, the users that the Research profile is offered to."
  (scope/user-metabot-perms->scopes {:permission/metabot     :yes
                                     :permission/metabot-nlq :yes}))

(deftest tools-declare-registered-scopes-granted-to-nlq-users-test
  (testing "every exploration tool declares a registered :scope, so the per-tool scope check applies
            (a tool with no :scope skips the runtime's scope check entirely), AND an NLQ-yes user is
            granted that scope — so adding the gate does not filter the tools away from the
            NLQ-gated :explorations profile that offers them"
    (doseq [tool [tools.explorations/list-research-metrics-tool
                  tools.explorations/get-research-candidates-tool
                  tools.explorations/add-research-groups-tool
                  tools.explorations/remove-from-research-plan-tool
                  tools.explorations/set-exploration-name-tool
                  tools.explorations/select-exploration-timelines-tool]]
      (let [{tool-name :name required-scope :scope} (tools.core/declaration tool)]
        (testing tool-name
          (is (some? required-scope) "declares a :scope")
          (when required-scope
            (is (api-scope/registered-scope? required-scope) "scope is registered")
            (is (api-scope/scope-matches? research-scopes required-scope)
                "scope is granted to an NLQ-yes user")))))))

(defn- research-call
  "Call `tool-name` the way that the Research profile's agent does, and return the outcome.
  The call runs as a user with `research-scopes`. The outcome is the `:output` that the model reads,
  plus `:error` when the call failed."
  [tool-name args]
  (binding [scope/*current-user-scope* research-scopes]
    (let [entries (metabot.tools/->entries (:tools (profiles/get-profile :explorations))
                                           (atom {}) nil :explorations)]
      ((:fn (get entries tool-name)) args))))

(defn- decoded-output
  "The exploration tools return `{:output <json-string>}` (only `:output` survives onto the
   `tool-output-available` stream event the FE consumes); decode it back to a map."
  [result]
  (json/decode+kw (:output result)))

(deftest ^:parallel get-research-candidates-requires-a-filter-test
  (testing "a call with neither metric_ids nor q is the model's to fix (the unfiltered catalog is the
            unbounded payload this tool's contract exists to prevent), and says where ids come from"
    (doseq [args [{} {:q nil} {:q ""} {:metric_ids nil} {:metric_ids []} {:q "  " :metric_ids []}]]
      (testing (pr-str args)
        (is (= {:output (str "Pass `metric_ids`, `q`, or both. This tool reports the candidate"
                             " dimensions of metrics that you have already chosen.\n"
                             "Call `list_research_metrics` to choose metric ids.\n"
                             "Call `search` with `entity_types` [\"metric\"] to find metrics by topic.")
                :error  {:class :recoverable :code ::tools.explorations/needs-metric-ids-or-q}}
               (research-call "get_research_candidates" args)))))))

(deftest ^:parallel get-research-candidates-caps-metric-ids-test
  (testing "more metric_ids than one call details is an argument error"
    (is (= {:output (str "Invalid tool arguments: `metric_ids` should have at most 20 elements;"
                         " received an array.")
            :error  {:class :validation :code :invalid-arguments}}
           (research-call "get_research_candidates" {:metric_ids (vec (range 1 22))})))))

(deftest ^:parallel empty-plan-edits-are-argument-errors-test
  (testing "a call that would change nothing, or blank the plan's name, is rejected"
    (doseq [[tool-name args expected] [["add_research_groups" {:groups []}
                                        "`groups` must list at least one group; received an array."]
                                       ["select_research_timelines" {:timeline_ids []}
                                        "`timeline_ids` must list at least one timeline id; received an array."]
                                       ["set_research_name" {:name ""}
                                        "`name` should be at least 1 character; received a string."]]]
      (testing tool-name
        (is (= {:output (str "Invalid tool arguments: " expected)
                :error  {:class :validation :code :invalid-arguments}}
               (research-call tool-name args)))))))

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
        (let [{:keys [output data-parts]} (research-call "add_research_groups"
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
  (testing (str "the summary skips a dimension id that no group in the payload holds, rather than "
                "throwing away the whole tool call")
    (let [payload (assoc (picker-payload 1)
                         :groups [{:metric_id 0 :dimension_ids ["d0" "unresolved"]}])]
      (mt/with-dynamic-fn-redefs [tools.explorations/research-groups-payload (fn [_] payload)]
        (is (= (str "Added 1 group(s) to the research plan:\n"
                    "- Metric 0, by: Orders - Region, plus the automatic selection")
               (:output (research-call "add_research_groups" {:groups (:groups payload)}))))))))

(deftest add-research-groups-summary-is-bounded-test
  (testing "a metric can be sliced by a long dimension list, so the summary counts the tail
            instead of listing it — :output is the agent's context, not a report"
    (let [summary-for (fn [n-dims]
                        (let [payload (wide-metric-payload n-dims)]
                          (mt/with-dynamic-fn-redefs [tools.explorations/research-groups-payload (fn [_] payload)]
                            (:output (research-call "add_research_groups"
                                                    {:groups (:groups payload)})))))
          fifty       (summary-for 50)]
      (testing "the tail past the first `summary-max-names` members is counted, not listed"
        (is (str/includes? fifty "and 35 more")))
      (testing "so a 10x longer dimension list costs only the extra digits in that count"
        (is (> 5 (- (count (summary-for 500)) (count fifty))))))))

(defn- add-groups-rejected-with
  "What the model reads when `research-groups` rejects an `add_research_groups` call with
  `problems` as its ex-data."
  [problems]
  (mt/with-dynamic-fn-redefs [explorations/research-groups
                              (fn [_] (throw (ex-info "Invalid research groups" problems)))]
    (research-call "add_research_groups" {:groups [{:metric_id 1}]})))

(deftest add-research-groups-reports-every-problem-at-once-test
  (testing "every problem in one error, so the model fixes them all in one retry"
    (is (= {:output (str "None of the groups were added:\n"
                         "- Metrics 999, 1000 were not found. They may not exist, or you may not have"
                         " access to them.\n"
                         "- The group for metric 2 sets `replace_default_dimensions` with no"
                         " `dimension_ids`.\n"
                         "- Dimensions \"region-2\", \"nope\" are not candidates of metric 1"
                         " (Revenue).\n"
                         "- Dimension \"plan-1\" is not a candidate of metric 3 (Churn).\n"
                         "Call `list_research_metrics` to find metrics that are available for"
                         " research, and take their ids from `get_research_candidates`.\n"
                         "Pass the dimension ids to slice by, or drop `replace_default_dimensions` to"
                         " keep the automatic selection.\n"
                         "A dimension id belongs to one metric, so the same dimension has a different"
                         " id under each metric. Take each group's ids from its own metric's"
                         " candidates.\n"
                         "Call `get_research_candidates` with `metric_ids` [1, 3] to see every"
                         " candidate.\n"
                         "Candidate dimensions by metric:\n"
                         "- Metric 1 (Revenue): \"region-1\" (Region), \"plan-1\" (Plan)\n"
                         "- Metric 3 (Churn): none")
            :error  {:class :recoverable :code ::tools.explorations/invalid-research-groups}}
           (add-groups-rejected-with
            {:unknown-metric-ids         [999 1000]
             :replace-without-dimensions [2]
             :invalid-dimensions         [{:metric-id     1
                                           :metric-name   "Revenue"
                                           :dimension-ids ["region-2" "nope"]
                                           :candidates    [{:id "region-1" :name "Region"}
                                                           {:id "plan-1" :name "Plan"}]}
                                          {:metric-id     3
                                           :metric-name   "Churn"
                                           :dimension-ids ["plan-1"]
                                           :candidates    []}]}))))
  (testing "anything else that fails in validation still ends the turn"
    (is (= {:class :unrecoverable :code :internal}
           (:error (add-groups-rejected-with {:something "else"}))))))

(deftest add-research-groups-cuts-candidates-to-fit-test
  (testing "a long candidate list is counted rather than spelled out"
    (is (str/includes? (:output (add-groups-rejected-with
                                 {:invalid-dimensions
                                  [{:metric-id     1
                                    :metric-name   "Revenue"
                                    :dimension-ids ["nope"]
                                    :candidates    (vec (for [i (range 20)]
                                                          {:id (str "d" i) :name (str "D" i)}))}]}))
                       "\"d14\" (D14) and 5 more")))
  (testing "candidates come last and are cut short, so the bad ids and the next steps fit"
    (let [candidates (vec (for [i (range 15)]
                            {:id   (format "00000000-0000-4000-8000-%012d" i)
                             :name (str "Customer acquisition channel " i)}))
          {:keys [output]} (add-groups-rejected-with
                            {:invalid-dimensions (vec (for [m (range 1 6)]
                                                        {:metric-id     m
                                                         :metric-name   (str "Metric " m)
                                                         :dimension-ids [(str "wrong-" m)]
                                                         :candidates    candidates}))})]
      (is (> 4000 (count output)) "the runtime cuts a failure at 4,000 characters")
      (doseq [m (range 1 6)]
        (is (str/includes? output (str "Dimension \"wrong-" m "\" is not a candidate of metric " m))))
      (is (str/includes? output "Call `get_research_candidates` with `metric_ids` [1, 2, 3, 4, 5]"))
      (is (str/includes? output "Candidate dimensions by metric:\n- Metric 1 (Metric 1): ")))))

(defn- uuids
  "Dimension ids in UUID form, numbered from `from` (inclusive) to `to` (exclusive)."
  [from to]
  (mapv #(format "00000000-0000-4000-8000-%012d" %) (range from to)))

(deftest add-research-groups-cuts-long-failure-lists-test
  (testing "more bad ids than fit are cut short and counted, and the steps survive"
    (let [output   (:output (add-groups-rejected-with
                             {:invalid-dimensions (vec (for [m (range 1 21)]
                                                         {:metric-id     m
                                                          :metric-name   (str "Metric " m)
                                                          :dimension-ids (uuids 1 6)
                                                          :candidates    []}))}))
          listed   (count (re-seq #"\"00000000-0000-4000-8000-\d{12}\"" output))
          [_ more] (re-find #"\n- …and (\d+) more invalid dimension ids on metrics [\d, ]+20\.\n" output)]
      (is (>= 3000 (count output)))
      (is (= 100 (+ listed (parse-long more))))
      (is (str/includes? output "\nA dimension id belongs to one metric"))
      (is (str/includes? output (str "\nCall `get_research_candidates` with `metric_ids` "
                                     "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,"
                                     " 20] to see every candidate.")))))
  (testing "a metric whose bad ids don't all fit gets a line with the ones that do"
    (let [output   (:output (add-groups-rejected-with
                             {:invalid-dimensions [{:metric-id     1
                                                    :metric-name   "Metric 1"
                                                    :dimension-ids (uuids 1 61)
                                                    :candidates    []}
                                                   {:metric-id     2
                                                    :metric-name   "Metric 2"
                                                    :dimension-ids (uuids 61 121)
                                                    :candidates    []}]}))
          listed   (count (re-seq #"\"00000000-0000-4000-8000-\d{12}\"" output))
          [_ more] (re-find #"\n- …and (\d+) more invalid dimension ids on metric 2\.\n" output)]
      (is (>= 3000 (count output)))
      (is (= 120 (+ listed (parse-long more))))
      (is (str/includes? output " are not candidates of metric 2 (Metric 2).\n- …and "))
      (is (str/includes? output "\nCall `get_research_candidates` with `metric_ids` [1, 2] to see every candidate.")))))

(deftest add-research-groups-suggests-lookups-within-the-limit-test
  (testing "the lookup that it suggests asks for no more metric_ids per call than the tool takes"
    (let [output  (:output (add-groups-rejected-with
                            {:invalid-dimensions (vec (for [m (range 1 22)]
                                                        {:metric-id     m
                                                         :metric-name   (str "Metric " m)
                                                         :dimension-ids ["wrong"]
                                                         :candidates    []}))}))
          lookup  (re-find #"Call `get_research_candidates`[^\n]*" output)
          batches (for [[_ ids] (re-seq #"\[([\d, ]+)\]" lookup)]
                    (mapv parse-long (str/split ids #", ")))]
      (is (= [(range 1 21) [21]] batches))
      (mt/with-test-user :crowberto
        (doseq [batch batches]
          (is (nil? (:error (research-call "get_research_candidates" {:metric_ids batch}))))))))
  (testing "and names at most two batches, so that the step stays short"
    (let [output (:output (add-groups-rejected-with
                           {:invalid-dimensions (vec (for [m (range 1 61)]
                                                       {:metric-id     m
                                                        :metric-name   (str "Metric " m)
                                                        :dimension-ids ["wrong"]
                                                        :candidates    []}))}))]
      (is (>= 3000 (count output)))
      (is (str/includes? output (str "\nCall `get_research_candidates` with `metric_ids` ["
                                     (str/join ", " (range 1 21)) "], then with ["
                                     (str/join ", " (range 21 41)) "], and so on for the other"
                                     " metrics, 20 at a time, to see every candidate."))))))

(defn- orders-count
  "The query of a minimal metric: a count of orders."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/aggregate (lib/count)))))

(deftest research-workflow-against-the-real-catalog-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Card {metric-id :id} {:name          "Order count"
                                                :type          :metric
                                                :dataset_query (orders-count)}]
      (let [listed     (:metrics (decoded-output (research-call "list_research_metrics"
                                                                {:q "Order count"})))
            candidates (-> (research-call "get_research_candidates" {:metric_ids [metric-id]})
                           decoded-output :metrics first :dimensions)]
        (testing "the metric is listed, with candidate dimensions"
          (is (some #(= metric-id (:id %)) listed))
          (is (seq candidates)))
        (testing "every dimension that get_research_candidates offers is accepted"
          (let [outcome (research-call "add_research_groups"
                                       {:groups [{:metric_id     metric-id
                                                  :dimension_ids (mapv :id candidates)}]})]
            (is (nil? (:error outcome)))
            (is (str/starts-with? (:output outcome)
                                  "Added 1 group(s) to the research plan:\n- Order count, by: "))))
        (testing "a bad metric and a bad dimension are the model's to fix, both in one error"
          (let [{:keys [output error]} (research-call "add_research_groups"
                                                      {:groups [{:metric_id Integer/MAX_VALUE}
                                                                {:metric_id     metric-id
                                                                 :dimension_ids ["not-a-dimension"]}]})]
            (is (= {:class :recoverable :code ::tools.explorations/invalid-research-groups} error))
            (is (str/includes? output (str "Metric " Integer/MAX_VALUE " was not found.")))
            (is (str/includes? output (str "Dimension \"not-a-dimension\" is not a candidate of metric "
                                           metric-id " (Order count).")))))))))

;;; ------------------------------------ plan edits the client applies ------------------------------------

(deftest ^:parallel remove-from-research-plan-tool-test
  (testing "echoes the block ids the agent asked to remove (pure-echo; the FE applies them)"
    (is (= {:block_ids ["metric:42" "metric:43"] :members nil :timeline_ids nil}
           (decoded-output
            (research-call "remove_from_research_plan" {:block_ids ["metric:42" "metric:43"]})))))
  (testing "echoes member-level removals (deselect dimensions within a group)"
    (is (= {:block_ids    nil
            :members      [{:block_id "metric:42" :dimension_ids ["d1"]}
                           {:block_id "metric:43" :dimension_ids ["d2" "d3"]}]
            :timeline_ids nil}
           (decoded-output
            (research-call "remove_from_research_plan"
                           {:members [{:block_id "metric:42" :dimension_ids ["d1"]}
                                      {:block_id "metric:43" :dimension_ids ["d2" "d3"]}]})))))
  (testing "echoes timeline removals"
    (is (= {:block_ids nil :members nil :timeline_ids [7 9]}
           (decoded-output
            (research-call "remove_from_research_plan" {:timeline_ids [7 9]})))))
  (testing "an empty list is valid (a no-op removal)"
    (is (= {:block_ids [] :members nil :timeline_ids nil}
           (decoded-output
            (research-call "remove_from_research_plan" {:block_ids []}))))))

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
              (research-call "set_research_name" {:name "Quarterly revenue"})))))
    (testing "remove_from_research_plan"
      (is (= {:block_ids ["metric:42"] :members nil :timeline_ids nil}
             (streamed-tool-output
              (research-call "remove_from_research_plan" {:block_ids ["metric:42"]})))))))

(deftest select-research-timelines-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Collection {coll-id :id}  {:name "Research timelines"}
                   :model/Timeline   {releases :id} {:name "Releases" :collection_id coll-id}
                   :model/Timeline   {launches :id} {:name "Launches" :collection_id coll-id}
                   :model/Timeline   {archived :id} {:name          "Old launches"
                                                     :collection_id coll-id
                                                     :archived      true}]
      (testing "streams the ids for the FE to add, the same way as the other plan edits"
        (is (= {:timeline_ids [releases launches]}
               (streamed-tool-output
                (research-call "select_research_timelines" {:timeline_ids [releases launches]})))))
      (testing "names every id that isn't a timeline that the user can list, which the FE would skip"
        (is (= {:output (str "Timelines " archived ", " Integer/MAX_VALUE " were not found. They may"
                             " not exist, or you may not have access to them.\n"
                             "Call `list_timelines` and use ids from its result.")
                :error  {:class :recoverable :code ::tools.explorations/unknown-timeline}}
               (research-call "select_research_timelines"
                              {:timeline_ids [releases archived Integer/MAX_VALUE archived]})))))))

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
