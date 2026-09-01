(ns metabase.metabot.agent.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.ai-tracing.core :as ait]
   [metabase.ai-tracing.log :as ait.log]
   [metabase.ai-tracing.settings :as ai-tracing.settings]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.llm.test-util :as llm.tu]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.test-util :as mut]
   [metabase.metabot.tools.search :as metabot-search]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private test-provider "openrouter/anthropic/claude-haiku-4-5")

;; Pin eval-capture OFF for the whole namespace so the exact stream-shape assertions below are
;; deterministic regardless of the ambient MB_AI_EVAL_CAPTURE — a dedicated eval instance sets it,
;; which would otherwise append an extra `eval_session` data part to every agent stream and break
;; every `=?` on `run-agent-loop` output. The capture-ON path is covered by `eval-tracing-nesting-test`,
;; which forces capture via `capture-reducible` (independent of this gate) and is unaffected here.
(use-fixtures :each (fn [thunk]
                      (mt/with-dynamic-fn-redefs [ai-tracing.settings/ai-eval-capture (constantly false)]
                        (thunk))))

(defn- run-agent-loop!
  "run-agent-loop for side effects, discarding results.
  Runs as admin so the base metabot permission check passes."
  [opts]
  (mt/as-admin
    (reduce (fn [_ _]) nil (agent/run-agent-loop opts))))

(deftest has-tool-calls-test
  (testing "detects tool calls in parts"
    (is (#'agent/has-tool-calls? [{:type :tool-input :id "t1"}]))
    (is (not (#'agent/has-tool-calls? [{:type :text :text "hello"}])))
    (is (#'agent/has-tool-calls? [{:type :text :text "hi"}
                                  {:type :tool-input :id "t1"}]))))

(deftest should-continue-test
  (let [max-iter 3
        no-term  #{}]
    (testing "continues when iteration < max and has tool calls"
      (is (#'agent/should-continue? 0 max-iter no-term [{:type :tool-input}]))
      (is (#'agent/should-continue? 1 max-iter no-term [{:type :tool-input}])))
    (testing "continues when text AND tool calls present (LLM thinking aloud)"
      (is (#'agent/should-continue? 0 max-iter no-term [{:type :tool-input}
                                                        {:type :text}]))
      (is (#'agent/should-continue? 0 max-iter no-term [{:type :text}
                                                        {:type :tool-input}])))
    (testing "stops at max iterations (1-based: iteration >= max means done)"
      (is (not (#'agent/should-continue? 3 max-iter no-term [{:type :tool-input}])))
      (is (not (#'agent/should-continue? 4 max-iter no-term [{:type :tool-input}]))))
    (testing "stops when no tool calls (text-only is final answer)"
      (is (not (#'agent/should-continue? 0 max-iter no-term [{:type :text}])))
      (is (not (#'agent/should-continue? 0 max-iter no-term [{:type :usage}])))
      (is (not (#'agent/should-continue? 0 max-iter no-term []))))))

(deftest truncated-iteration-test
  (let [truncated [{:type :tool-input :id "t1"}
                   {:type :usage :finish-reason "length" :raw-finish-reason "max_tokens"}]
        complete  [{:type :tool-input :id "t1"}
                   {:type :usage :finish-reason "tool-calls" :raw-finish-reason "tool_use"}]]
    (testing "a provider-truncated iteration does not continue, even with a tool call present"
      (is (not (#'agent/should-continue? 0 20 #{} truncated)))
      (is (#'agent/should-continue? 0 20 #{} complete)))
    (testing "finish-reason reports :length ahead of everything else"
      (is (= :length (#'agent/finish-reason 0 20 #{} truncated)))
      (is (= :length (#'agent/finish-reason 20 20 #{} truncated))
          ":length wins over :max-iterations — it is the more specific cause"))
    (testing "a usage part without a finish reason (older adapters) is not truncation"
      (is (= :stop (#'agent/finish-reason 0 20 #{} [{:type :text} {:type :usage}]))))))

(deftest terminal-tool-call-test
  (let [terminal #{"edit_sql_query" "create_sql_query" "replace_sql_query"}
        success  [{:type :tool-input :id "a" :function "edit_sql_query"}
                  {:type :tool-output :id "a" :result {:output "ok"
                                                       :structured-output {:result-type :query
                                                                           :query-id "q1"}}}]
        failure  [{:type :tool-input :id "b" :function "edit_sql_query"}
                  {:type :tool-output :id "b" :result {:output "validation error"
                                                       :instructions "fix it"}}]
        read     [{:type :tool-input :id "c" :function "read_resource"}
                  {:type :tool-output :id "c" :result {:output "<fields/>"}}]]
    (testing "a successful terminal-tool call ends the turn"
      (is (#'agent/terminal-tool-call? terminal success))
      (is (not (#'agent/should-continue? 0 20 terminal success))
          "should-continue? is false right after a successful edit (the 10402 fix)"))
    (testing "a FAILED terminal-tool call does not end the turn (model can self-correct)"
      (is (not (#'agent/terminal-tool-call? terminal failure)))
      (is (#'agent/should-continue? 0 20 terminal failure)))
    (testing "a non-terminal tool (read_resource) does not end the turn"
      (is (not (#'agent/terminal-tool-call? terminal read))))
    (testing "terminality is per-profile: an empty terminal set never ends the turn"
      (is (not (#'agent/terminal-tool-call? #{} success))))
    (testing "finish-reason reports :terminal-tool"
      (is (= :terminal-tool (#'agent/finish-reason 0 20 terminal success))))))

(defn- tools-registered-for-request!
  ([capabilities] (tools-registered-for-request! :internal capabilities))
  ([profile-id capabilities]
   (let [captured (atom nil)]
     (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                        llm-metabot-provider test-provider]
       (mt/with-dynamic-fn-redefs [self/call-llm (fn [_model _system _parts tools _tracking-opts _llm-opts]
                                                   (reset! captured (set (keys tools)))
                                                   (mut/mock-llm-response [{:type :text :text "Hello"}]))]
         (into [] (agent/run-agent-loop
                   {:messages   [{:role :user :content "Open the SQL editor"}]
                    :state      {}
                    :profile-id profile-id
                    :context    {:capabilities capabilities}}))))
     @captured)))

(deftest client-claimed-sql-capability-is-clamped-to-actual-permissions-test
  (mt/with-no-data-perms-for-all-users!
    (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
    (testing "a query-builder-only user gets no SQL tools even when the request claims the capability"
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
      (mt/with-current-user (mt/user->id :rasta)
        (let [tools (tools-registered-for-request! ["permission:write_sql_queries"])]
          (is (contains? tools "construct_notebook_query"))
          (is (not (contains? tools "create_sql_query")))
          (is (not (contains? tools "edit_sql_query")))
          (is (not (contains? tools "replace_sql_query"))))))
    (testing "a user with native permission gets the SQL tools for the same request"
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
      (mt/with-current-user (mt/user->id :rasta)
        (let [tools (tools-registered-for-request! ["permission:write_sql_queries"])]
          (is (contains? tools "create_sql_query"))
          (is (contains? tools "edit_sql_query"))
          (is (contains? tools "replace_sql_query")))))))

(deftest document-sql-chart-tool-requires-native-permission-test
  (mt/with-no-data-perms-for-all-users!
    (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
    (testing "a query-builder-only user is offered neither half of the document SQL path"
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
      (mt/with-current-user (mt/user->id :rasta)
        (let [tools (tools-registered-for-request! :document-generate-content ["permission:write_sql_queries"])]
          (is (contains? tools "document_construct_model_chart"))
          (is (not (contains? tools "document_construct_sql_chart")))
          ;; leaving this one registered strands the model: its output tells it to call
          ;; document_construct_sql_chart, which is not in its tool set, under :required-tool-call?
          (is (not (contains? tools "document_schema_collect"))))))
    (testing "a user with native permission is offered both document chart tools"
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
      (mt/with-current-user (mt/user->id :rasta)
        (let [tools (tools-registered-for-request! :document-generate-content ["permission:write_sql_queries"])]
          (is (contains? tools "document_construct_model_chart"))
          (is (contains? tools "document_construct_sql_chart"))
          (is (contains? tools "document_schema_collect")))))))

(deftest terminal-error-message-test
  (let [denial [{:type :tool-input :id "a" :function "create_sql_query"}
                {:type :tool-output :id "a" :result {:output "No native permission."
                                                     :terminal-error? true}}]]
    (testing "reads the message off a tool result marked terminal"
      (is (= "No native permission." (#'agent/terminal-error-message denial))))
    (testing "an ordinary tool failure is not terminal"
      (is (nil? (#'agent/terminal-error-message
                 [{:type :tool-output :id "b" :result {:output "syntax error"}}]))))
    (testing "a terminal marker with no message yields nil so no empty text part is emitted"
      (is (nil? (#'agent/terminal-error-message
                 [{:type :tool-output :id "c" :result {:output "" :terminal-error? true}}]))))
    (testing "the first denial wins when an iteration produces several"
      (is (= "first" (#'agent/terminal-error-message
                      [{:type :tool-output :id "a" :result {:output "first" :terminal-error? true}}
                       {:type :tool-output :id "b" :result {:output "second" :terminal-error? true}}]))))
    (testing "should-continue? is unaffected — the gate lives in loop-step, per profile"
      (is (#'agent/should-continue? 0 20 #{} denial)))))

(defn- run-sql-denial-turn!
  "Run one turn whose first LLM response calls `create_sql_query` against `database-id`."
  [profile-id database-id]
  (let [call-count (atom 0)]
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider test-provider]
      ;; the tool executor lives inside `call-llm`, so redef the transport to let the tool run
      (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                          (if (= 1 (swap! call-count inc))
                                                            (mut/mock-llm-response
                                                             [{:type      :tool-input
                                                               :id        "t1"
                                                               :function  "create_sql_query"
                                                               :arguments {:database_id database-id
                                                                           :sql_query   "SELECT 1"
                                                                           :title       "Results"}}])
                                                            (mut/mock-llm-response [{:type :text :text "Sorry."}])))]
        (let [parts (into [] (agent/run-agent-loop
                              {:messages   [{:role :user :content "Query that database"}]
                               :state      {}
                               :profile-id profile-id
                               :context    {:capabilities    ["permission:write_sql_queries"]
                                            :user_is_viewing [{:type    "code_editor"
                                                               :buffers [{:id "buf-1"}]}]}}))]
          {:llm-calls @call-count :parts parts})))))

(deftest permission-denial-ends-a-forced-tool-call-turn-test
  (mt/with-temp [:model/Database {native-db :id}     {:engine :h2}
                 :model/Database {builder-db :id}    {:engine :h2}
                 :model/Database {unreadable-db :id} {:engine :h2}]
    (mt/with-no-data-perms-for-all-users!
      (doseq [db-id [native-db builder-db unreadable-db]]
        (perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted))
      ;; native on one database keeps the capability, so the denial can only happen per call
      (perms/set-database-permission! (perms-group/all-users) native-db :perms/create-queries :query-builder-and-native)
      (perms/set-database-permission! (perms-group/all-users) builder-db :perms/create-queries :query-builder)
      (perms/set-database-permission! (perms-group/all-users) unreadable-db :perms/create-queries :no)
      (mt/with-current-user (mt/user->id :rasta)
        (testing ":sql forbids the model from answering in text, so the loop stops on the denial"
          (let [{:keys [llm-calls parts]} (run-sql-denial-turn! :sql builder-db)]
            (is (= 1 llm-calls)
                "one call, not the profile's 20 iterations")
            (is (= :terminal-error (:finish-reason (last parts))))
            (is (some #(and (= :text (:type %))
                            (str/includes? (:text %) "do not have permission"))
                      parts)
                "the refusal is emitted as assistant text — a tool result is not rendered to the user")
            (is (some #(= :data (:type %)) parts)
                "state data part still closes the turn")))
        (testing ":internal lets the model explain the denial itself, so the loop continues"
          (let [{:keys [llm-calls parts]} (run-sql-denial-turn! :internal builder-db)]
            (is (= 2 llm-calls))
            (is (= :stop (:finish-reason (last parts))))
            (is (not-any? #(and (= :text (:type %))
                                (str/includes? (str (:text %)) "do not have permission"))
                          parts)
                "no canned text — the model's own wording is used")))
        (testing "a database the user cannot read at all stops the turn the same way"
          (let [{:keys [llm-calls parts]} (run-sql-denial-turn! :sql unreadable-db)]
            (is (= 1 llm-calls)
                "the read-check denial is terminal too -- otherwise the stricter permission loops")
            (is (= :terminal-error (:finish-reason (last parts))))
            (is (some #(and (= :text (:type %))
                            (str/includes? (:text %) "do not have access to this database"))
                      parts))))
        (testing "a database the user can query natively is not denied"
          (let [{:keys [parts]} (run-sql-denial-turn! :sql native-db)]
            (is (= :terminal-tool (:finish-reason (last parts))))))))))

(deftest run-agent-loop-with-mock-test
  (mt/as-admin
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider test-provider]
      (testing "runs agent loop with mocked LLM returning text"
        (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                            (mut/mock-llm-response
                                                             [{:type :text :text "Hello"}]))]
          (let [result (into [] (agent/run-agent-loop
                                 {:messages   [{:role :user :content "Hi"}]
                                  :state      {}
                                  :profile-id :embedding_next
                                  :context    {}}))]
            ;; Should get parts + state data
            (is (pos? (count result)))
            ;; Should have state data
            (is (some #(= :data (:type %)) result))
            (is (= {:type :finish :finish-reason :stop} (last result))))))
      (testing "sql profile requests required tool choice"
        (let [captured (atom nil)]
          (mt/with-dynamic-fn-redefs [self/call-llm (fn [_model _system _parts _tools _tracking-opts llm-opts]
                                                      (reset! captured llm-opts)
                                                      (mut/mock-llm-response
                                                       [{:type :text :text "Hello"}]))]
            (into [] (agent/run-agent-loop
                      {:messages   [{:role :user :content "Hi"}]
                       :state      {}
                       :profile-id :sql
                       :context    {}}))
            (is (= {:tool-choice "required"} @captured)))))
      (testing "runs agent loop with tool execution"
        (let [call-count (atom 0)]
          (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                              ;; First call returns tool-input, second returns text
                                                              (let [n (swap! call-count inc)]
                                                                (if (= 1 n)
                                                                  (mut/mock-llm-response
                                                                   [{:type      :tool-input
                                                                     :id        "t1"
                                                                     :function  "search"
                                                                     :arguments {:query "test"}}])
                                                                  (mut/mock-llm-response
                                                                   [{:type :text :text "Found results"}]))))]
            (let [result (into [] (agent/run-agent-loop
                                   {:messages   [{:role :user :content "Search for test"}]
                                    :state      {}
                                    :profile-id :embedding_next
                                    :context    {}}))]
              ;; Should complete successfully
              (is (pos? (count result)))
              ;; Should have state data (final part)
              (is (some #(= :data (:type %)) result))
              ;; Should have tool-related parts
              (is (some #(= :tool-input (:type %)) result))))))
      (testing "a provider-truncated turn stops the loop WITHOUT an error part (truncation is not an error;
                the partial turn must stay replayable so the user can continue from it)"
        (let [call-count (atom 0)]
          (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                              (swap! call-count inc)
                                                              (mut/mock-llm-response
                                                               [{:type      :tool-input
                                                                 :id        "t1"
                                                                 :function  "search"
                                                                 :arguments {:query "test"}}
                                                                {:type :usage :model "m"
                                                                 :usage {:promptTokens 1 :completionTokens 64 :totalTokens 65}
                                                                 :finish-reason "length" :raw-finish-reason "max_tokens"}]))]
            (let [result (into [] (agent/run-agent-loop
                                   {:messages   [{:role :user :content "Hi"}]
                                    :state      {}
                                    :profile-id :embedding_next
                                    :context    {}}))]
              (is (= 1 @call-count)
                  "does not iterate on a truncated turn despite the tool call")
              (is (not-any? #(= :error (:type %)) result)
                  "no error part — the client learns of the truncation via finishReason \"length\"")
              (is (some #(and (= :usage (:type %)) (= "length" (:finish-reason %))) result))
              (is (some #(= :data (:type %)) result)
                  "state data part still closes the turn")))))
      (testing "handles errors gracefully"
        (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                            (throw (ex-info "Mock error" {})))]
          (let [result (mt/with-log-level [metabase.metabot.agent.core :fatal]
                         (into [] (agent/run-agent-loop
                                   {:messages   [{:role :user :content "Hi"}]
                                    :state      {}
                                    :profile-id :embedding_next
                                    :context    {}})))]
            ;; Should get error message
            (is (some #(= :error (:type %)) result))))))))

(deftest max-iterations-finish-reason-test
  (mt/as-admin
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider test-provider]
      (let [get-profile profiles/get-profile
            call-count  (atom 0)
            tool-call   (fn [n]
                          [{:type      :tool-input
                            :id        (str "t" n)
                            :function  "search"
                            :arguments {}}])
            run-loop    (fn [responses]
                          (reset! call-count 0)
                          (mt/with-dynamic-fn-redefs [profiles/get-profile  (comp #(assoc % :max-iterations 2) get-profile)
                                                      openrouter/openrouter (fn [_]
                                                                              (let [n (swap! call-count inc)]
                                                                                (mut/mock-llm-response
                                                                                 ((nth responses (dec n)) n))))
                                                      metabot-search/search (constantly [])]
                            (mt/with-log-level [metabase.metabot.agent.core :warn]
                              (->> (agent/run-agent-loop {:messages [{:role :user :content "Hi"}]
                                                          :profile-id :embedding_next})
                                   (into [])
                                   last))))]
        (testing "still calling tools at the cap"
          (let [finish (run-loop [tool-call tool-call])]
            (is (= 2 @call-count)
                "stops calling the LLM once the iteration cap is reached")
            (is (= {:type :finish :finish-reason :max-iterations} finish))))
        (testing "plain answer on the last allowed iteration is a normal stop"
          (let [finish (run-loop [tool-call (constantly [{:type :text :text "Done"}])])]
            (is (= 2 @call-count))
            (is (= {:type :finish :finish-reason :stop} finish))))))))

;; Note: build-messages-for-llm is now internal to call-llm
;; Message building is tested via messages_test.clj

(deftest seed-state-test
  (testing "seeds queries from user_is_viewing context"
    (let [context {:user_is_viewing [{:type "native"
                                      :id "query-123"
                                      :query {:database 1 :type :query :query {:source-table 1}}}]}
          seeded (#'agent/seed-state {} context)]
      (is (contains? (get seeded :queries) "query-123"))))
  (testing "does not seed native SQL string queries"
    (let [context {:user_is_viewing [{:type "native"
                                      :id "query-456"
                                      :query "SELECT * FROM users"}]}
          seeded (#'agent/seed-state {} context)]
      (is (empty? (get seeded :queries)))))
  (testing "ignores viewing items without ids or queries"
    (let [context {:user_is_viewing [{:type "native" :query {:database 1}}
                                     {:type "adhoc" :id "no-query"}]}
          seeded (#'agent/seed-state {} context)]
      (is (empty? (get seeded :queries))))))

;; Note: stream-parts! and finalize-stream! are now internal to run-agent-loop.
;; Link resolution is tested via streaming/post-process-xf in streaming_test.clj.
;; Here we test the full agent loop behavior.

(deftest integration-run-agent-loop-test
  (mt/as-admin
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider test-provider]
      (testing "runs full agent loop without external calls"
        (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                            (mut/mock-llm-response
                                                             [{:type :text :text "Test response"}]))]
          (let [result (into [] (agent/run-agent-loop
                                 {:messages   [{:role :user :content "Hello"}]
                                  :state      {}
                                  :profile-id :embedding_next
                                  :context    {}}))]
            ;; Verify basic structure
            (is (pos? (count result)))
            ;; Should have text part
            (is (some #(= :text (:type %)) result))
            ;; Should have state data part
            (is (some #(and (= :data (:type %))
                            (map? (:data %)))
                      result))))))))

;;; Query and Chart extraction tests

(deftest extract-queries-test
  (testing "extracts queries from tool output parts"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :tool-output
                  :id "t1"
                  :function "query_model"
                  :result {:structured-output {:query-id "q-123"
                                               :query query
                                               :result-columns []}}}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-queries memory parts)]
      (is (= query (get-in (memory/get-state updated) [:queries "q-123"])))))
  (testing "ignores parts without structured-output"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :function "search"
                  :result {:output "no results"}}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-queries memory parts)]
      (is (empty? (:queries (memory/get-state updated))))))
  (testing "ignores non-tool-output parts"
    (let [parts [{:type :text :text "hello"}
                 {:type :tool-input :id "t1" :function "search"}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-queries memory parts)]
      (is (empty? (:queries (memory/get-state updated)))))))

(deftest extract-charts-test
  (testing "extracts charts from tool output parts"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))
          chart-data {:chart-id "c-456"
                      :query-id "q-123"
                      :query query
                      :chart-type :bar}
          parts [{:type :tool-output
                  :id "t1"
                  :function "create_chart"
                  :result {:structured-output chart-data}}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-charts memory parts)]
      (is (= {:chart_id "c-456"
              :query_id "q-123"
              :queries [query]
              :visualization_settings {:chart_type :bar}} (get-in (memory/get-state updated) [:charts "c-456"])))))
  (testing "ignores parts without chart-id"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :function "search"
                  :result {:structured-output {:data []}}}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-charts memory parts)]
      (is (empty? (:charts (memory/get-state updated))))))
  (testing "merges onto an existing chart entry instead of replacing it"
    ;; Regression: edit-chart-tool writes the full edited chart (including
    ;; :image_base_64/:timeline_events/:chart_config carried over from the source
    ;; chart) into memory before update-memory runs extract-charts over the same
    ;; tool's structured-output. A full replace here would wipe those fields back
    ;; out even though the tool-output never claimed to know about them.
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))
          chart-data {:chart-id "c-456"
                      :query-id "q-123"
                      :query query
                      :chart-type :bar}
          parts [{:type :tool-output
                  :id "t1"
                  :function "edit_chart"
                  :result {:structured-output chart-data}}]
          memory {:state {:queries {}
                          :charts {"c-456" {:chart_id "c-456"
                                            :query_id "q-123"
                                            :queries [query]
                                            :image_base_64 "abc123"
                                            :timeline_events []
                                            :chart_config {:some "config"}
                                            :visualization_settings {:chart_type :pie}}}}}
          updated (#'agent/extract-charts memory parts)]
      (is (= {:chart_id "c-456"
              :query_id "q-123"
              :queries [query]
              :image_base_64 "abc123"
              :timeline_events []
              :chart_config {:some "config"}
              :visualization_settings {:chart_type :bar}}
             (get-in (memory/get-state updated) [:charts "c-456"]))))))

;;; ===================== Integration Tests =====================
;;;
;;; These tests exercise the full agent loop across multiple iterations
;;; with tool calls, state management, and realistic scenarios.

(defn scripted-claude
  "Create a mock claude fn that returns responses in sequence.
  Each response is a vector of parts (e.g., [{:type :text :text \"Hi\"}]).

  Usage:
    (with-redefs [openrouter/openrouter (scripted-claude
                                [[{:type :tool-input :function \"search\" ...}]
                                 [{:type :text :text \"Found it\"}]])]
      ...)"
  [responses]
  (let [idx (atom 0)]
    (fn [_opts]
      (let [i        @idx
            response (get responses i)]
        (swap! idx inc)
        (if response
          (mut/mock-llm-response response)
          ;; Fallback: return empty text to terminate loop
          (mut/mock-llm-response [{:type :text :text ""}]))))))

(deftest integration-search-query-chart-flow-test
  (mt/as-admin
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider test-provider]
      (testing "Scenario 1: Search → Query → Chart (multi-turn happy path)"
        ;; User asks: "Show me the first 10 orders"
        ;; - Iteration 1: LLM calls search tool to find orders table
        ;; - Iteration 2: LLM calls construct_notebook_query to create a raw query
        ;; - Iteration 3: LLM returns text with chart link
        ;;
        ;; We use real tools with only the search backend and LLM mocked.
        ;; The construct_notebook_query tool runs real query construction against test DB.
        ;; We use a simple "raw" query type that doesn't require field IDs.
        (mt/with-current-user (mt/user->id :crowberto)
          (let [orders-table-id (mt/id :orders)
                ;; Look up database + schema + table name so we can write the portable FK
                ;; that the representations-format construct_notebook_query expects.
                orders-table    (t2/select-one :model/Table 'id orders-table-id)
                db-name         (t2/select-one-fn :name :model/Database 'id (mt/id))
                orders-fk        [db-name (:schema orders-table) (:name orders-table)]
                external-query  {:lib/type "mbql/query"
                                 :database db-name
                                 :stages   [{:lib/type     "mbql.stage/mbql"
                                             :source-table orders-fk
                                             :limit        10}]}
                ;; Track LLM calls
                llm-call-count  (atom 0)
                ;; Scripted LLM responses - uses real table ID from test DB
                llm-responses
                [;; Iteration 1: Search for orders table
                 [{:type :start :id "msg-1"}
                  {:type      :tool-input
                   :id        "call-search-1"
                   :function  "search"
                   :arguments {:semantic_queries ["orders table"]
                               :keyword_queries  ["orders"]
                               :entity_types     ["table"]}}
                  {:type :usage :usage {:promptTokens 100 :completionTokens 20} :model "test" :id "msg-1"}]
                 ;; Iteration 2: Construct a simple query via the representations YAML format
                 [{:type :start :id "msg-2"}
                  {:type      :tool-input
                   :id        "call-construct-1"
                   :function  "construct_notebook_query"
                   :arguments {:reasoning     "User wants to see orders"
                               :query         external-query
                               :title         "First 10 orders"
                               :description   "The first 10 orders."
                               :visualization {:chart_type "table"}}}
                  {:type :usage :usage {:promptTokens 200 :completionTokens 30} :model "test" :id "msg-2"}]
                 ;; Iteration 3: Final text response
                 [{:type :start :id "msg-3"}
                  {:type :text
                   :text "Here are the first 10 orders from the orders table."}
                  {:type :usage :usage {:promptTokens 300 :completionTokens 10} :model "test" :id "msg-3"}]]]
            ;; Mock only openrouter/openrouter (LLM) and metabot-search/search (search backend)
            ;; Everything else runs real code
            (mt/with-dynamic-fn-redefs [openrouter/openrouter           (fn [_opts]
                                                                          (let [n (swap! llm-call-count inc)]
                                                                            (mut/mock-llm-response (get llm-responses (dec n) []))))
                                        metabot-search/search (fn [_args]
                                                                [{:id           orders-table-id
                                                                  :type         "table"
                                                                  :name         "orders"
                                                                  :display_name "Orders"
                                                                  :description  "This is a confirmed order for a product from a user."
                                                                  :database_id  (mt/id)}])]
              (testing "Should successfully go through 3 iterations"
                (is (=? [{:type :start}
                         {:type :tool-input :function "search"}
                         ;; Cumulative usage after iteration 1: 100 prompt, 20 completion
                         {:type :usage :usage {:promptTokens 100 :completionTokens 20}}
                         {:type     :tool-output
                          :function "search"
                          :result   {:structured-output {:total_count 1}}}
                         {:type :data :data-type "search_results"}
                         {:type :start}
                         {:type :tool-input :function "construct_notebook_query"}
                         ;; Cumulative usage after iteration 2: 100+200=300 prompt, 20+30=50 completion
                         {:type :usage :usage {:promptTokens 300 :completionTokens 50}}
                         ;; references real db id
                         {:type     :tool-output
                          :function "construct_notebook_query"
                          :result   {:structured-output {:query {:database (mt/id)}}}}
                         {:type :data :data-type "generated_entity"}
                         {:type :start}
                         ;; has final text part
                         {:type :text}
                         ;; Cumulative usage after iteration 3: 300+300=600 prompt, 50+10=60 completion
                         {:type :usage :usage {:promptTokens 600 :completionTokens 60}}
                         {:type      :data
                          :data-type "state"
                          :data      {:queries map?
                                      :charts  map?}}
                         {:type :finish :finish-reason :stop}]
                        (mt/with-log-level [metabase.metabot.agent.core :warn]
                          (into [] (metabot.persistence/combine-text-parts-xf)
                                (agent/run-agent-loop
                                 {:messages   [{:role    :user
                                                :content "Show me the first 10 orders"}]
                                  :state      {}
                                  :profile-id :internal
                                  :context    {}}))))))
              (testing "should complete 3 LLM iterations"
                (is (= 3 @llm-call-count)
                    "Should have exactly 3 LLM calls (search, construct, final text)")))))))))

(deftest eval-tracing-nesting-test
  (testing "capture-reducible over the real agent loop builds a turn -> llm -> tool span tree"
    ;; This exercises the cross-module wiring the ai-tracing docstrings promise: the turn/llm spans
    ;; are opened in metabase.metabot.agent.core, the tool span in metabase.metabot.self.core, and
    ;; the tool runs on the virtual-thread executor — so this also proves *parent* is conveyed across
    ;; `bound-fn*` into the tool thread. Only the LLM + search backend are mocked; everything else is
    ;; real. `capture-reducible` binds the capture unconditionally (ignores MB_AI_EVAL_CAPTURE), and
    ;; we redef `emit!` to a no-op so the test never writes a per-session JSONL file.
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                         llm-metabot-provider test-provider]
        (let [llm-call-count (atom 0)
              llm-responses  [;; Iteration 1: call the search tool (produces a real tool span)
                              [{:type :start :id "msg-1"}
                               {:type      :tool-input
                                :id        "call-search-1"
                                :function  "search"
                                :arguments {:semantic_queries ["orders table"]
                                            :keyword_queries  ["orders"]
                                            :entity_types     ["table"]}}
                               {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                                :model "test" :id "msg-1"}]
                              ;; Iteration 2: final text (no tool)
                              [{:type :start :id "msg-2"}
                               {:type :text :text "Here are your orders."}
                               {:type :usage :usage {:promptTokens 200 :completionTokens 10}
                                :model "test" :id "msg-2"}]]]
          (mt/with-dynamic-fn-redefs [ait.log/emit!         (fn [& _] nil)
                                      openrouter/openrouter (fn [_opts]
                                                              (let [n (swap! llm-call-count inc)]
                                                                (mut/mock-llm-response (get llm-responses (dec n) []))))
                                      metabot-search/search (fn [_args]
                                                              [{:id           (mt/id :orders)
                                                                :type         "table"
                                                                :name         "orders"
                                                                :display_name "Orders"
                                                                :description  "Confirmed orders."
                                                                :database_id  (mt/id)}])]
            (let [{:keys [trace result]} (mt/with-log-level [metabase.metabot.agent.core :warn]
                                           (ait/capture-reducible
                                            (agent/run-agent-loop
                                             {:messages   [{:role :user :content "Show me orders"}]
                                              :state      {}
                                              :profile-id :internal
                                              :context    {}})))]
              (is (= 2 @llm-call-count) "search iteration + final text iteration")
              (is (= 1 (count trace)) "single root span")
              (testing "the in-process (file-less) path emits no eval_session pointer into the stream"
                ;; capture-reducible leaves *session-id* nil (trace comes back as :trace, no file), so
                ;; a pointer here would name a <nil>.jsonl that never exists.
                (is (empty? (filter #(= "eval_session" (:data-type %)) result))))
              (let [turn       (first trace)
                    llms       (:children turn)
                    tool-spans (mapcat :children llms)
                    search     (first (filter #(= "tool.search" (:name %)) tool-spans))]
                (testing "root is the agent turn"
                  (is (= :turn (:type turn)))
                  (is (= "agent.turn" (:name turn)))
                  (is (nil? (:parent-id turn))))
                (testing "each iteration is an llm.call child of the turn"
                  (is (= 2 (count llms)))
                  (is (every? #(= :llm (:type %)) llms))
                  (is (every? #(= (:id turn) (:parent-id %)) llms)))
                (testing "the search tool span nests under the llm.call it ran in"
                  (is (= :tool (:type search)))
                  ;; the decoded tool arguments are recorded on the span (metabase.metabot.self.core)
                  (is (= {:semantic_queries ["orders table"]
                          :keyword_queries  ["orders"]
                          :entity_types     ["table"]}
                         (get-in search [:attributes :ai/tool-args])))
                  (let [parent-llm (first (filter #(= (:parent-id search) (:id %)) llms))]
                    (is (some? parent-llm) "tool's parent-id resolves to an llm.call in the tree")))))))))))

(deftest cumulative-usage-test
  (mt/as-admin
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider test-provider]
      (testing "usage parts are cumulative across agent loop iterations"
        (let [call-count (atom 0)]
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (fn [_]
                                        (let [n (swap! call-count inc)]
                                          (case (int n)
                                            ;; Iteration 1: tool call with usage
                                            1 (mut/mock-llm-response
                                               [{:type :start :id "msg-1"}
                                                {:type      :tool-input
                                                 :id        "t1"
                                                 :function  "search"
                                                 :arguments {:query "test"}}
                                                {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                                                 :model "gpt-4" :id "msg-1"}])
                                            ;; Iteration 2: text response with usage
                                            (mut/mock-llm-response
                                             [{:type :start :id "msg-2"}
                                              {:type :text :text "Done"}
                                              {:type :usage :usage {:promptTokens 150 :completionTokens 30}
                                               :model "gpt-4" :id "msg-2"}]))))]
            (let [result (mt/with-log-level [metabase.metabot.agent.core :warn]
                           (into [] (agent/run-agent-loop
                                     {:messages   [{:role :user :content "test"}]
                                      :state      {}
                                      :profile-id :embedding_next
                                      :context    {}})))
                  usages (filterv #(= :usage (:type %)) result)]
              (testing "should have two usage parts (one per iteration)"
                (is (= 2 (count usages))))
              (testing "first usage is from iteration 1 only"
                (is (= {:promptTokens 100 :completionTokens 20}
                       (:usage (first usages)))))
              (testing "second usage is cumulative (iteration 1 + 2)"
                (is (= {:promptTokens 250 :completionTokens 50}
                       (:usage (second usages)))))))))
      (testing "cumulative usage works across multiple models"
        (let [call-count (atom 0)]
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (fn [_]
                                        (let [n (swap! call-count inc)]
                                          (case (int n)
                                            1 (mut/mock-llm-response
                                               [{:type :start :id "msg-1"}
                                                {:type      :tool-input
                                                 :id        "t1"
                                                 :function  "search"
                                                 :arguments {:query "test"}}
                                                {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                                                 :model "model-a" :id "msg-1"}])
                                            (mut/mock-llm-response
                                             [{:type :start :id "msg-2"}
                                              {:type :text :text "Done"}
                                              {:type :usage :usage {:promptTokens 200 :completionTokens 40}
                                               :model "model-b" :id "msg-2"}]))))]
            (let [result (mt/with-log-level [metabase.metabot.agent.core :warn]
                           (into [] (agent/run-agent-loop
                                     {:messages   [{:role :user :content "test"}]
                                      :state      {}
                                      :profile-id :embedding_next
                                      :context    {}})))
                  usages (filterv #(= :usage (:type %)) result)]
              (testing "model is always the canonical provider-and-model from the profile"
                (is (= test-provider (:model (first usages))))
                (is (= test-provider (:model (second usages)))))
              (testing "usage accumulates under the single provider key"
                (is (= {:promptTokens 100 :completionTokens 20}
                       (:usage (first usages))))
                (is (= {:promptTokens 300 :completionTokens 60}
                       (:usage (second usages))))))))))))

(deftest run-agent-loop-retries-on-rate-limit-test
  (mt/as-admin
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider test-provider]
      (testing "agent loop retries when LLM returns 429 and then succeeds"
        (let [call-count (atom 0)]
          (mt/with-dynamic-fn-redefs [self/retry-delay-ms   (constantly 0)
                                      openrouter/openrouter (fn [_]
                                                              (if (< (swap! call-count inc) 2)
                                                                (throw (ex-info "Anthropic API has rate limited us"
                                                                                {:status 429 :api-error true}))
                                                                (mut/mock-llm-response
                                                                 [{:type :text :text "Hello after retry"}])))]
            (is (=? [{:type :text :text "Hello after retry"}
                     {:type :data :data-type "state"}
                     {:type :finish :finish-reason :stop}]
                    (mt/with-log-level [metabase.metabot.self :fatal]
                      (into [] (metabot.persistence/combine-text-parts-xf)
                            (agent/run-agent-loop
                             {:messages   [{:role :user :content "Hi"}]
                              :state      {}
                              :profile-id :embedding_next
                              :context    {}}))))
                "Should get the response from the successful retry")
            (is (= 2 @call-count)
                "Should have called LLM twice (1 failure + 1 success")))))))

;;; ===================== Prometheus Metrics Tests =====================

(deftest run-agent-loop-prometheus-test
  (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                     llm-metabot-provider test-provider]
    (mt/with-prometheus-system! [_ system]
      (testing "records agent-requests, agent-iterations, and llm-requests metrics"
        (let [call-count (atom 0)]
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (fn [_]
                                        (let [n (swap! call-count inc)]
                                          (if (= 1 n)
                                            (mut/mock-llm-response
                                             [{:type      :tool-input
                                               :id        "t1"
                                               :function  "search"
                                               :arguments {:query "test"}}])
                                            (mut/mock-llm-response
                                             [{:type :text :text "Done"}]))))]
            (mt/with-log-level [metabase.metabot.agent.core :warn]
              (run-agent-loop! {:messages   [{:role :user :content "test"}]
                                :state      {}
                                :profile-id :internal
                                :context    {}}))))
        (is (== 1 (mt/metric-value system :metabase-metabot/agent-requests
                                   {:profile-id "internal"})))
        (is (== 2 (:sum (mt/metric-value system :metabase-metabot/agent-iterations
                                         {:profile-id "internal"}))))
        (is (== 0 (mt/metric-value system :metabase-metabot/agent-errors
                                   {:profile-id "internal"})))
        (is (== 2 (mt/metric-value system :metabase-metabot/llm-requests
                                   {:model "openrouter/anthropic/claude-haiku-4-5"
                                    :source "agent"})))
        (is (== 1 (:count (mt/metric-value system :metabase-metabot/agent-duration-ms
                                           {:profile-id "internal"}))))
        (is (pos? (:sum (mt/metric-value system :metabase-metabot/agent-duration-ms
                                         {:profile-id "internal"})))))
      ;; clear! is much faster than a new mt/with-prometheus-system!
      (analytics/clear! :metabase-metabot/agent-requests)
      (analytics/clear! :metabase-metabot/agent-iterations)
      (analytics/clear! :metabase-metabot/agent-errors)
      (analytics/clear! :metabase-metabot/agent-duration-ms)
      (analytics/clear! :metabase-metabot/llm-requests)
      (testing "records agent-errors on failure"
        (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_] (throw (ex-info "boom" {})))]
          (mt/with-log-level [metabase.metabot.agent.core :fatal]
            (run-agent-loop! {:messages   [{:role :user :content "test"}]
                              :state      {}
                              :profile-id :internal
                              :context    {}})))
        (is (== 1 (mt/metric-value system :metabase-metabot/agent-requests
                                   {:profile-id "internal"})))
        (is (== 0 (:sum (mt/metric-value system :metabase-metabot/agent-iterations
                                         {:profile-id "internal"}))))
        (is (== 1 (mt/metric-value system :metabase-metabot/agent-errors
                                   {:profile-id "internal"})))
        (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests
                                   {:model "openrouter/anthropic/claude-haiku-4-5"
                                    :source "agent"})))
        (is (== 1 (:count (mt/metric-value system :metabase-metabot/agent-duration-ms
                                           {:profile-id "internal"}))))
        (is (pos? (:sum (mt/metric-value system :metabase-metabot/agent-duration-ms
                                         {:profile-id "internal"}))))))))

;;; ===================== Snowplow Analytics Tests =====================

(deftest agent-used-tool-snowplow-test
  (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                     llm-metabot-provider test-provider]
    (testing "fires :snowplow/ai_service_event 'agent_used_tool' per tool call"
      (let [call-count (atom 0)
            rasta-id   (mt/user->id :rasta)]
        (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                    (fn [_]
                                      (let [n (swap! call-count inc)]
                                        (if (= 1 n)
                                          (mut/mock-llm-response
                                           [{:type :start :id "msg-1"}
                                            {:type      :tool-input
                                             :id        "t1"
                                             :function  "search"
                                             :arguments {:semantic_queries ["test"]
                                                         :keyword_queries  ["test"]
                                                         :entity_types     ["table"]}}
                                            {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                                             :model "test-model" :id "msg-1"}])
                                          (mut/mock-llm-response
                                           [{:type :start :id "msg-2"}
                                            {:type :text :text "Done"}
                                            {:type :usage :usage {:promptTokens 150 :completionTokens 30}
                                             :model "test-model" :id "msg-2"}]))))
                                    metabot-search/search
                                    (fn [_args] [{:id 1 :type "table" :name "test" :display_name "Test" :database_id 1}])]
          (mt/with-log-level [metabase.metabot.agent.core :warn]
            (mt/with-current-user rasta-id
              (snowplow-test/with-fake-snowplow-collector
                (run-agent-loop! {:messages        [{:role :user :content "test"}]
                                  :state           {}
                                  :context         {}
                                  :profile-id      :internal
                                  :tracking-opts   {:session-id "00000000-0000-0000-0000-000000000001"}})
                ;; The collector also contains token_usage events; filter for just ai_service_events.
                (let [events (snowplow-test/pop-event-data-and-user-id!)
                      tool-events (filter #(= "agent_used_tool" (get-in % [:data "event"])) events)]
                  (is (=? [{:user-id (str rasta-id)
                            :data    {"event"         "agent_used_tool"
                                      "source"        "metabot_agent"
                                      "profile"       "internal"
                                      "session_id"    "00000000-0000-0000-0000-000000000001"
                                      "result"        "success"
                                      "duration_ms"   nat-int?
                                      "event_details" {"tool_name" "search"
                                                       "step"      1}}}]
                          tool-events)))))))))
    (testing "fires 'agent_used_tool' with result=error when tool fails"
      (let [call-count (atom 0)
            rasta-id   (mt/user->id :rasta)]
        (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                    (fn [_]
                                      (let [n (swap! call-count inc)]
                                        (if (= 1 n)
                                          (mut/mock-llm-response
                                           [{:type :start :id "msg-1"}
                                            {:type      :tool-input
                                             :id        "t1"
                                             :function  "search"
                                             :arguments {:bad-arg "wrong"}}
                                            {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                                             :model "test-model" :id "msg-1"}])
                                          (mut/mock-llm-response
                                           [{:type :start :id "msg-2"}
                                            {:type :text :text "Done"}
                                            {:type :usage :usage {:promptTokens 150 :completionTokens 30}
                                             :model "test-model" :id "msg-2"}]))))
                                    metabot-search/search
                                    (fn [_args] (throw (ex-info "should not be called" {})))]
          (mt/with-log-level [metabase.metabot.agent.core :warn]
            (mt/with-current-user rasta-id
              (snowplow-test/with-fake-snowplow-collector
                (run-agent-loop! {:messages        [{:role :user :content "test"}]
                                  :state           {}
                                  :context         {}
                                  :profile-id      :internal
                                  :tracking-opts   {:session-id "00000000-0000-0000-0000-000000000002"}})
                (let [events (snowplow-test/pop-event-data-and-user-id!)
                      tool-events (filter #(= "agent_used_tool" (get-in % [:data "event"])) events)]
                  (is (=? [{:data {"event"  "agent_used_tool"
                                   "result" "error"}}]
                          tool-events)))))))))))

(deftest token-usage-snowplow-test
  (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                     llm-metabot-provider test-provider]
    (testing "fires :snowplow/token_usage event per LLM call"
      (let [call-count (atom 0)
            rasta-id   (mt/user->id :rasta)]
        (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                    (fn [_]
                                      (let [n (swap! call-count inc)]
                                        (if (= 1 n)
                                          (mut/mock-llm-response
                                           [{:type :start :id "msg-1"}
                                            {:type      :tool-input
                                             :id        "t1"
                                             :function  "search"
                                             :arguments {:query "test"}}
                                            {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                                             :model "test-model" :id "msg-1"}])
                                          (mut/mock-llm-response
                                           [{:type :start :id "msg-2"}
                                            {:type :text :text "Done"}
                                            {:type :usage :usage {:promptTokens 150 :completionTokens 30}
                                             :model "test-model" :id "msg-2"}]))))]
          (mt/with-log-level [metabase.metabot.agent.core :warn]
            (mt/with-current-user rasta-id
              (snowplow-test/with-fake-snowplow-collector
                (run-agent-loop! {:messages        [{:role :user :content "test"}]
                                  :state           {}
                                  :context         {}
                                  :profile-id      :internal
                                  :tracking-opts   {:session-id "00000000-0000-0000-0000-000000000001"}})
                ;; Filter for just token_usage events (other events may also be present)
                (let [events       (snowplow-test/pop-event-data-and-user-id!)
                      token-events (filter #(contains? (:data %) "total_tokens") events)]
                  (is (=? [{:user-id (str rasta-id)
                            :data    {"model_id"            "openrouter/anthropic/claude-haiku-4-5"
                                      "total_tokens"         120
                                      "prompt_tokens"        100
                                      "completion_tokens"    20
                                      "estimated_costs_usd"  0.0
                                      "duration_ms"          nat-int?
                                      "profile"              "internal"
                                      "source"               "metabot_agent"
                                      "tag"                  "agent"
                                      "session_id"           "00000000-0000-0000-0000-000000000001"}}
                           {:user-id (str rasta-id)
                            :data    {"model_id"            "openrouter/anthropic/claude-haiku-4-5"
                                      "total_tokens"         180
                                      "prompt_tokens"        150
                                      "completion_tokens"    30
                                      "estimated_costs_usd"  0.0
                                      "duration_ms"          nat-int?
                                      "profile"              "internal"
                                      "source"               "metabot_agent"
                                      "tag"                  "agent"
                                      "session_id"           "00000000-0000-0000-0000-000000000001"}}]
                          token-events)))))))))))

(deftest chart-configs-loaded-into-charts-test
  (let [query (lib/native-query (mt/metadata-provider) "select 1")
        chart-config {:display_type "pie"
                      :query query
                      :series {}
                      :timeline_events []}
        memory (-> (#'agent/init-agent {:profile-id :internal
                                        :context {:user_is_viewing
                                                  [{:chart_configs [chart-config]}]}})
                   :memory-atom
                   deref)

        chart-configs (get-in memory [:state :chart-configs])
        chart-configs-key (first (keys chart-configs))
        charts (get-in memory [:state :charts])
        chart-key (first (keys charts))]
    (testing "Loaded charts from chart configs into memory"
      (is (string? chart-key))
      ;; :query_id must match :chart_id — it's how edit_chart later carries a
      ;; query-id through for this chart (see chart-config->chart, extract-charts).
      (is (=? {chart-key {:chart_id chart-key
                          :query_id chart-key
                          :timeline_events []
                          :queries [query]
                          :chart_config chart-config}}
              charts)))
    (testing "Loaded chart configs into memory"
      (is (every? string? (keys chart-configs)))
      (is (=? {chart-configs-key chart-config}
              chart-configs)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Profile permission checks
;;; ──────────────────────────────────────────────────────────────────

(deftest check-metabot-access-test
  (let [check! #'agent/check-metabot-access!]
    (testing "base metabot permission"
      (testing "metabot :no blocks any profile"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permission"
                              (check! :internal {:permission/metabot :no})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permission"
                              (check! :sql {:permission/metabot :no})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permission"
                              (check! :slackbot {:permission/metabot :no})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permission"
                              (check! :embedding_next {:permission/metabot :no}))))
      (testing "metabot :yes allows non-gated profiles"
        (is (nil? (check! :internal {:permission/metabot :yes})))
        (is (nil? (check! :slackbot {:permission/metabot :yes})))
        (is (nil? (check! :embedding_next {:permission/metabot :yes})))))
    (testing "profile-specific permissions (with metabot :yes)"
      (testing "sql profile"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permission"
                              (check! :sql {:permission/metabot :yes :permission/metabot-sql-generation :no})))
        (is (nil? (check! :sql {:permission/metabot :yes :permission/metabot-sql-generation :yes}))))
      (testing "nlq profile"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permission"
                              (check! :nlq {:permission/metabot :yes :permission/metabot-nlq :no})))
        (is (nil? (check! :nlq {:permission/metabot :yes :permission/metabot-nlq :yes}))))
      (testing "transforms_codegen profile"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permission"
                              (check! :transforms_codegen {:permission/metabot :yes :permission/metabot-sql-generation :no})))
        (is (nil? (check! :transforms_codegen {:permission/metabot :yes :permission/metabot-sql-generation :yes}))))
      (testing "document-generate-content profile"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permission"
                              (check! :document-generate-content {:permission/metabot :yes :permission/metabot-other-tools :no})))
        (is (nil? (check! :document-generate-content {:permission/metabot :yes :permission/metabot-other-tools :yes}))))
      (testing "explorations profile (gated on NLQ permission)"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permission"
                              (check! :explorations {:permission/metabot :yes :permission/metabot-nlq :no})))
        (is (nil? (check! :explorations {:permission/metabot :yes :permission/metabot-nlq :yes})))))))
