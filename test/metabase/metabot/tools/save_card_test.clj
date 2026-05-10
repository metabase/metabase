(ns metabase.metabot.tools.save-card-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.test-util :as mut]
   [metabase.metabot.tools.save-card :as save-card]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- legacy-native-query [db-id sql]
  (let [mp    (mt/metadata-provider)
        query (lib/native-query mp sql)]
    ;; lib/native-query returns MBQL5; create-card! expects legacy MBQL
    (-> query lib/->legacy-MBQL (assoc :database db-id))))

(defn- memory-atom-with [opts]
  (atom {:state (merge {:queries {} :charts {}} opts)}))

(deftest save-card-tool-metadata-test
  (let [m (meta #'save-card/save-card-tool)]
    (testing "tool name is save_card"
      (is (= "save_card" (:tool-name m))))
    (testing "scope is agent:card:create"
      (is (= "agent:card:create" (:scope m))))))

(deftest save-card-happy-path-test
  (testing "save_card persists the in-memory query as a real Card row in the chosen collection"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database   {db-id :id}   {:engine :h2}
                       :model/Collection {coll-id :id} {:name "POC Marketing"}]
          (let [query-id "Q1"
                memory   (memory-atom-with {:queries {query-id (legacy-native-query db-id "SELECT 1")}})
                result   (binding [shared/*memory-atom* memory]
                           (save-card/save-card-tool
                            {:query_id      query-id
                             :name          "POC monthly revenue"
                             :collection_id coll-id
                             :display       "table"}))
                card-id  (get-in result [:structured-output :id])]
            (is (some? card-id))
            (testing "card row has the right collection and display"
              (let [row (t2/select-one :model/Card :id card-id)]
                (is (= coll-id (:collection_id row)))
                (is (= :table (:display row)))
                (is (= "POC monthly revenue" (:name row)))))
            (testing "structured output is the LLM-relevant subset"
              (is (= #{:id :name :collection_id :display :description}
                     (set (keys (:structured-output result))))))
            (testing "navigate_to data part lands the user on the new question"
              (let [data-parts (:data-parts result)]
                (is (seq data-parts))
                (is (= "navigate_to" (:data-type (first data-parts))))
                (is (= (str "/question/" card-id) (:data (first data-parts))))))
            (testing "instructions reference both the question and collection links"
              (is (str/includes? (:instructions result) (str "metabase://question/" card-id)))
              (is (str/includes? (:instructions result) (str "metabase://collection/" coll-id))))))))))

(defn- in-memory-chart
  "Mirror the canonical chart shape produced by `extract-charts` in
  `metabase.metabot.agent.core` — chart type lives under
  `[:visualization_settings :chart_type]`, **not** at the top level."
  [chart-id query chart-type]
  {:chart_id               chart-id
   :queries                [query]
   :visualization_settings {:chart_type chart-type}})

(deftest save-card-inherits-display-from-chart-test
  (testing "when chart_id is provided, display defaults to the chart's chart-type"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database   {db-id :id}   {:engine :h2}
                       :model/Collection {coll-id :id} {:name "POC Charts"}]
          (let [query-id "Q1"
                chart-id "C1"
                query    (legacy-native-query db-id "SELECT 1")
                memory   (memory-atom-with
                          {:queries {query-id query}
                           :charts  {chart-id (in-memory-chart chart-id query :bar)}})
                result   (binding [shared/*memory-atom* memory]
                           (save-card/save-card-tool
                            {:query_id      query-id
                             :chart_id      chart-id
                             :name          "Bar of one"
                             :collection_id coll-id}))]
            (is (= :bar (get-in result [:structured-output :display])))))))))

(deftest save-card-inherits-display-from-chart-via-extract-charts-test
  (testing "chart stored via agent.core/extract-charts resolves :display to its chart-type"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database   {db-id :id}   {:engine :h2}
                       :model/Collection {coll-id :id} {:name "POC Extract Charts"}]
          (let [query-id   "Q1"
                chart-id   "C1"
                query      (legacy-native-query db-id "SELECT 1")
                ;; Build the chart map the same way agent.core/extract-charts does
                ;; from the structured-output of construct_notebook_query / create_chart.
                chart-parts [{:type   :tool-output
                              :result {:structured-output {:chart-id   chart-id
                                                           :chart-type :line
                                                           :query-id   query-id
                                                           :query      query}}}]
                seeded     (#'agent/extract-charts {:state {:queries {query-id query}
                                                            :charts  {}}}
                                                   chart-parts)
                memory     (atom seeded)
                result     (binding [shared/*memory-atom* memory]
                             (save-card/save-card-tool
                              {:query_id      query-id
                               :chart_id      chart-id
                               :name          "Line of one"
                               :collection_id coll-id}))]
            (is (= :line (get-in result [:structured-output :display]))
                "display should follow the chart's chart-type, not silently fall back to :table")))))))

(deftest save-card-missing-query-test
  (testing "missing query_id surfaces a readable, agent-error-shaped message"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [memory (memory-atom-with {})
            result (binding [shared/*memory-atom* memory]
                     (save-card/save-card-tool
                      {:query_id "not-in-memory"
                       :name     "doomed"}))]
        (is (str/includes? (:output result) "not found"))
        (is (nil? (:structured-output result)))
        (is (nil? (:data-parts result)))))))

(deftest save-card-defaults-display-to-table-test
  (testing "no chart, no display, defaults to :table"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database   {db-id :id}   {:engine :h2}
                       :model/Collection {coll-id :id} {:name "POC Default"}]
          (let [query-id "Q1"
                memory   (memory-atom-with {:queries {query-id (legacy-native-query db-id "SELECT 1")}})
                result   (binding [shared/*memory-atom* memory]
                           (save-card/save-card-tool
                            {:query_id      query-id
                             :name          "untitled"
                             :collection_id coll-id}))]
            (is (= :table (get-in result [:structured-output :display])))))))))

;;; ===================== Integration test =====================
;;;
;;; Drives `run-agent-loop` end-to-end with a scripted LLM that exercises the seam
;;; between the bridge-backed `list_collections` tool and the var-backed `save_card`
;;; tool, asserting:
;;;   1. The bridge actually resolves and runs the collection endpoint, returning the
;;;      seeded collection.
;;;   2. The card row exists in the app DB with the expected `collection_id`.
;;;   3. The streamed `data-parts` include a `navigate_to` to `/question/<id>`.
;;;
;;; A real query is seeded via `:state` rather than constructed mid-loop because the
;;; runtime-generated query-id can't be threaded into a script that's fixed up front.

(def ^:private test-provider "openrouter/anthropic/claude-haiku-4-5")

(deftest integration-list-collections-then-save-card-test
  (mt/as-admin
    (mt/with-temporary-setting-values [llm-metabot-provider test-provider]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Bridge Integration Marketing"}]
          (let [query-id      "Q1"
                seeded-query  (legacy-native-query (mt/id) "SELECT 1")
                llm-calls     (atom 0)
                llm-responses [;; Iteration 1: discover the collection via the bridge.
                               [{:type :start :id "msg-1"}
                                {:type      :tool-input
                                 :id        "call-list-1"
                                 :function  "list_collections"
                                 :arguments {:q "bridge integration marketing"
                                             :limit 5}}
                                {:type :usage :usage {:promptTokens 100 :completionTokens 10}
                                 :model "test" :id "msg-1"}]
                               ;; Iteration 2: save the seeded query into that collection.
                               [{:type :start :id "msg-2"}
                                {:type      :tool-input
                                 :id        "call-save-1"
                                 :function  "save_card"
                                 :arguments {:query_id      query-id
                                             :name          "Integration POC card"
                                             :collection_id coll-id
                                             :display       "table"}}
                                {:type :usage :usage {:promptTokens 200 :completionTokens 20}
                                 :model "test" :id "msg-2"}]
                               ;; Iteration 3: final assistant text (terminates the loop).
                               [{:type :start :id "msg-3"}
                                {:type :text
                                 :text "Saved the question to Bridge Integration Marketing."}
                                {:type :usage :usage {:promptTokens 300 :completionTokens 5}
                                 :model "test" :id "msg-3"}]]]
            (with-redefs [openrouter/openrouter (fn [_opts]
                                                  (let [n (swap! llm-calls inc)]
                                                    (mut/mock-llm-response
                                                     (get llm-responses (dec n) []))))]
              (let [result      (mt/with-log-level [metabase.metabot.agent.core :warn]
                                  (into [] (agent/run-agent-loop
                                            {:messages   [{:role    :user
                                                           :content "Save this query to the Bridge Integration Marketing collection."}]
                                             :state      {:queries {query-id seeded-query}}
                                             :profile-id :internal
                                             :context    {}})))
                    list-output (->> result
                                     (filter #(and (= :tool-output (:type %))
                                                   (= "list_collections" (:function %))))
                                     first)
                    save-output (->> result
                                     (filter #(and (= :tool-output (:type %))
                                                   (= "save_card" (:function %))))
                                     first)
                    nav-parts   (->> result
                                     (filter #(and (= :data (:type %))
                                                   (= "navigate_to" (:data-type %))))
                                     vec)]
                (testing "the loop completed all three scripted iterations"
                  (is (= 3 @llm-calls)))

                (testing "list_collections dispatched through the bridge to the real handler"
                  (is (some? list-output)
                      "expected a tool-output for list_collections")
                  (let [body (get-in list-output [:result :structured-output])]
                    (is (sequential? body))
                    (is (some #(= "Bridge Integration Marketing" (:name %)) body)
                        "the seeded collection should be in the bridge response")))

                (testing "save_card created a real card row in the chosen collection"
                  (is (some? save-output)
                      "expected a tool-output for save_card")
                  (let [card-id (get-in save-output [:result :structured-output :id])
                        card    (t2/select-one :model/Card :id card-id)]
                    (is (some? card-id))
                    (is (= coll-id (:collection_id card)))
                    (is (= :table (:display card)))
                    (is (= "Integration POC card" (:name card)))

                    (testing "the stream emits a navigate_to data-part to the new question"
                      (is (some #(= (str "/question/" card-id) (:data %)) nav-parts)
                          "expected a navigate_to /question/<id> data part"))))))))))))
