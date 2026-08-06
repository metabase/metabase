(ns metabase.metabot.self.telemetry-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.self.telemetry :as telemetry]
   [metabase.util.log.capture :as log.capture]))

(set! *warn-on-reflection* true)

(def ^:private system-secret "SYSTEM_SECRET")
(def ^:private history-secret "HISTORY_SECRET")
(def ^:private argument-secret "ARGUMENT_SECRET")
(def ^:private tool-result-secret "TOOL_RESULT_SECRET")

(defn- request-context [tool-result]
  {:system system-secret
   :parts  [{:role :user :content history-secret}
            {:type :tool-input
             :id "call-1"
             :function "lookup"
             :arguments {:query argument-secret}}
            {:type :tool-output
             :id "call-1"
             :result {:output tool-result}}]
   :tools  [{:tool-name "lookup"
             :doc "Look something up"
             :schema [:=> [:cat [:map [:query :string]]] :any]
             :fn identity}]})

(deftest ^:parallel request-size-estimates-test
  (let [{:keys [system parts tools]} (request-context tool-result-secret)
        estimates                     (telemetry/request-size-estimates system parts tools)
        longer-result                 (str tool-result-secret "-and-more")
        longer-estimates              (telemetry/request-size-estimates
                                       system
                                       (:parts (request-context longer-result))
                                       tools)]
    (testing "contains numeric-only character and estimated-token breakdowns"
      (is (every? nat-int? (vals estimates)))
      (is (= (count system-secret) (:system-prompt-chars estimates)))
      (is (= (count tool-result-secret) (:tool-result-content-chars estimates)))
      (is (= (quot (+ (count system-secret) 3) 4)
             (:system-prompt-estimated-tokens estimates)))
      (is (= (:total-context-chars estimates)
             (+ (:system-prompt-chars estimates)
                (:tool-schemas-chars estimates)
                (:conversation-history-chars estimates)
                (:tool-result-content-chars estimates)))))
    (testing "tool-result content is not double counted in conversation history"
      (is (= (:conversation-history-chars estimates)
             (:conversation-history-chars longer-estimates)))
      (is (= (- (count longer-result) (count tool-result-secret))
             (- (:tool-result-content-chars longer-estimates)
                (:tool-result-content-chars estimates)))))))

(deftest ^:parallel iteration-data-privacy-and-optionality-test
  (let [{:keys [system parts tools]} (request-context tool-result-secret)
        estimates (assoc (telemetry/request-size-estimates system parts tools)
                         :raw-prompt "RAW_PROMPT_MUST_NOT_LEAK")
        tracking  {:iteration             3
                   :model                 "metabase/openrouter/anthropic/claude-haiku-4.5"
                   :provider              "openrouter"
                   :provider-model        "anthropic/claude-haiku-4.5"
                   :request-id            "REQUEST_ID_MUST_NOT_LEAK"
                   :session-id            "SESSION_ID_MUST_NOT_LEAK"
                   :request-size-estimates estimates}
        usage     {:promptTokens             101
                   :completionTokens         23
                   :cacheCreationTokens      7
                   :cacheReadTokens          80
                   :reasoningTokens          11
                   :compactionSavingsTokens  13}
        data      (#'telemetry/iteration-data tracking usage 17)]
    (testing "keeps only provider/model identifiers, numeric sizes, and provider usage"
      (is (= {:iteration                 3
              :provider                  "openrouter"
              :model                     "anthropic/claude-haiku-4.5"
              :model-id                  "openrouter/anthropic/claude-haiku-4.5"
              :input-tokens              101
              :output-tokens             23
              :cache-creation-tokens     7
              :cache-read-tokens         80
              :reasoning-tokens          11
              :compaction-savings-tokens 13
              :duration-ms               17}
             (select-keys data [:iteration :provider :model :model-id
                                :input-tokens :output-tokens
                                :cache-creation-tokens :cache-read-tokens
                                :reasoning-tokens :compaction-savings-tokens
                                :duration-ms])))
      (let [safe-estimates (dissoc estimates :raw-prompt)]
        (is (= safe-estimates (select-keys data (keys safe-estimates)))))
      (is (not (contains? data :raw-prompt)))
      (is (not (str/includes? (pr-str data) "MUST_NOT_LEAK"))))
    (testing "missing optional provider fields are omitted rather than reported as zero"
      (let [without-optionals (#'telemetry/iteration-data
                               tracking
                               {:promptTokens 1 :completionTokens 2}
                               3)]
        (is (not (contains? without-optionals :reasoning-tokens)))
        (is (not (contains? without-optionals :compaction-savings-tokens)))
        (is (not (contains? without-optionals :cache-creation-tokens)))
        (is (not (contains? without-optionals :cache-read-tokens)))))))

(deftest report-iteration-log-does-not-contain-raw-context-test
  (let [{:keys [system parts tools]} (request-context tool-result-secret)
        estimates (assoc (telemetry/request-size-estimates system parts tools)
                         :raw-tool-output "RAW_TOOL_OUTPUT_MUST_NOT_LEAK")
        messages  (log.capture/with-log-messages-for-level
                    [messages [metabase.metabot.self.telemetry :info]]
                    (telemetry/report-iteration!
                     {:iteration 1
                      :model "openai/gpt-5.4"
                      :provider "openai"
                      :provider-model "gpt-5.4"
                      :request-size-estimates estimates}
                     {:promptTokens 10 :completionTokens 2}
                     5)
                    (messages))
        rendered  (pr-str messages)]
    (is (= 1 (count messages)))
    (doseq [raw-value [system-secret history-secret argument-secret
                       tool-result-secret "RAW_TOOL_OUTPUT_MUST_NOT_LEAK"]]
      (is (not (str/includes? rendered raw-value))))))
