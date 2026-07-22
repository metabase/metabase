(ns metabase.metabot.self.google.stream-generate-content-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.google.stream-generate-content :as sgc]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; parts->contents tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->contents-plain-text-test
  (testing "user text passes through; assistant text becomes role model"
    (is (= [{:role "user" :parts [{:text "Hello"}]}
            {:role "model" :parts [{:text "Hi there!"}]}]
           (sgc/parts->contents
            [{:role :user :content "Hello"}
             {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->contents-assistant-role-maps-to-model-test
  (testing "an explicit assistant role maps to Gemini's model role"
    (is (= [{:role "model" :parts [{:text "prior reply"}]}]
           (sgc/parts->contents
            [{:role :assistant :content "prior reply"}])))))

(def ^:private placeholder-signature
  "Google's documented bypass signature, sent when a replayed functionCall has no captured one."
  "context_engineering_is_the_way_to_go")

(deftest ^:parallel parts->contents-tool-call-test
  (testing "text + tool call merge into a single model content with two parts"
    (is (= [{:role  "model"
             :parts [{:text "Let me check..."}
                     {:functionCall     {:name "search" :args {:query "revenue"}}
                      :thoughtSignature placeholder-signature}]}]
           (sgc/parts->contents
            [{:type :text :text "Let me check..."}
             {:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->contents-tool-result-test
  (testing "tool output becomes a user-role functionResponse part keyed by function name"
    (is (= [{:role  "user"
             :parts [{:functionResponse {:name     "search"
                                         :response {:output "Found 42 results"}}}]}]
           (sgc/parts->contents
            [{:type :tool-output :id "call-1" :function "search" :result {:output "Found 42 results"}}])))))

(deftest ^:parallel parts->contents-tool-error-test
  (testing "a failed tool output surfaces the error message in the functionResponse"
    (is (= [{:role  "user"
             :parts [{:functionResponse {:name     "search"
                                         :response {:output "Error: boom"}}}]}]
           (sgc/parts->contents
            [{:type :tool-output :id "call-1" :function "search" :error {:message "boom"}}])))))

(deftest ^:parallel parts->contents-tool-output-name-fallback-test
  (testing "a tool output without :function (history-rebuilt parts) takes its name from the tool-input with the same id"
    (is (= [{:role "model" :parts [{:functionCall     {:name "search" :args {:q "revenue"}}
                                    :thoughtSignature placeholder-signature}]}
            {:role "user"  :parts [{:functionResponse {:name     "search"
                                                       :response {:output "Found it"}}}]}]
           (sgc/parts->contents
            [{:type :tool-input :id "call-1" :function "search" :arguments {:q "revenue"}}
             {:type :tool-output :id "call-1" :result {:output "Found it"}}]))))
  (testing "with no matching tool-input either, a placeholder name is sent — Gemini rejects a missing name outright"
    (is (= [{:role "user" :parts [{:functionResponse {:name     "unknown_function"
                                                      :response {:output "orphan"}}}]}]
           (sgc/parts->contents
            [{:type :tool-output :id "call-9" :result {:output "orphan"}}])))))

(deftest ^:parallel parts->contents-thought-signature-replay-test
  (testing "a thoughtSignature carried in :provider-metadata is echoed on the replayed functionCall part"
    (is (= [{:role  "model"
             :parts [{:functionCall     {:name "search" :args {:q "x"}}
                      :thoughtSignature "sig-abc"}]}]
           (sgc/parts->contents
            [{:type              :tool-input
              :id                "call-1"
              :function          "search"
              :arguments         {:q "x"}
              :provider-metadata {:google {:thoughtSignature "sig-abc"}}}]))))
  (testing "the documented bypass signature is sent when the part carries none — Gemini 3.x rejects
            current-turn functionCall replays with the field missing (fabricated tool exchanges,
            history rebuilt from storage)"
    (is (= [{:role "model" :parts [{:functionCall     {:name "search" :args {}}
                                    :thoughtSignature placeholder-signature}]}]
           (sgc/parts->contents
            [{:type :tool-input :id "call-1" :function "search" :arguments {}}])))))

(deftest ^:parallel parts->contents-nil-arguments-test
  (testing "a tool call with nil arguments sends an empty args object"
    (is (= [{:role "model" :parts [{:functionCall     {:name "todo_read" :args {}}
                                    :thoughtSignature placeholder-signature}]}]
           (sgc/parts->contents
            [{:type :tool-input :id "call-1" :function "todo_read" :arguments nil}])))))

;;; ──────────────────────────────────────────────────────────────────
;;; request-body tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-system-instruction-test
  (testing "the system prompt becomes systemInstruction, outside :contents"
    (let [body (sgc/request-body
                {:model  "gemini-3.5-flash"
                 :system "You are a helpful assistant."
                 :input  [{:role :user :content "hi"}]})]
      (is (= {:parts [{:text "You are a helpful assistant."}]}
             (:systemInstruction body)))
      (is (= [{:role "user" :parts [{:text "hi"}]}]
             (:contents body))))))

(deftest ^:parallel request-body-no-system-message-test
  (testing "no systemInstruction is sent when system is not provided"
    (let [body (sgc/request-body {:model "gemini-3.5-flash"
                                  :input [{:role :user :content "hi"}]})]
      (is (not (contains? body :systemInstruction))))))

(deftest ^:parallel request-body-generation-config-test
  (testing "max-tokens and temperature land in generationConfig; max-tokens defaults to 4096"
    (is (= {:maxOutputTokens 256 :temperature 0.2}
           (:generationConfig (sgc/request-body {:model       "gemini-3.5-flash"
                                                 :input       [{:role :user :content "hi"}]
                                                 :max-tokens  256
                                                 :temperature 0.2}))))
    (is (= {:maxOutputTokens 4096}
           (:generationConfig (sgc/request-body {:model "gemini-3.5-flash"
                                                 :input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-tools-test
  (testing "tools become functionDeclarations carrying parametersJsonSchema"
    (let [body (sgc/request-body
                {:model "gemini-3.5-flash"
                 :input [{:role :user :content "hi"}]
                 :tools [{:tool-name "get_weather"
                          :doc       "Get the weather."
                          :schema    [:=> [:cat [:map [:city :string]]] :any]
                          :fn        identity}]})]
      (is (=? {:tools [{:functionDeclarations
                        [{:name                 "get_weather"
                          :description          "Get the weather."
                          :parametersJsonSchema {:type "object"}}]}]}
              body))
      (is (not (contains? body :toolConfig))
          "no toolConfig without an explicit tool_choice"))))

(deftest ^:parallel request-body-tool-choice-test
  (testing "tool_choice maps to functionCallingConfig mode"
    (let [body-for (fn [tool-choice]
                     (sgc/request-body
                      {:model       "gemini-3.5-flash"
                       :input       [{:role :user :content "hi"}]
                       :tools       [{:tool-name "t" :doc "d"
                                      :schema    [:=> [:cat [:map [:x :string]]] :any]
                                      :fn        identity}]
                       :tool_choice tool-choice}))]
      (is (= {:functionCallingConfig {:mode "AUTO"}}
             (:toolConfig (body-for "auto"))))
      (is (= {:functionCallingConfig {:mode "ANY"}}
             (:toolConfig (body-for "required")))))))

(deftest ^:parallel request-body-structured-output-test
  (testing "a :schema forces a structured_output function call via mode ANY + allowedFunctionNames"
    (let [schema {:type "object" :properties {:sql {:type "string"}}}
          body   (sgc/request-body
                  {:model  "gemini-3.5-flash"
                   :input  [{:role :user :content "hi"}]
                   :schema schema})]
      (is (= [{:functionDeclarations [{:name                 "structured_output"
                                       :description          "Output structured data"
                                       :parametersJsonSchema schema}]}]
             (:tools body)))
      (is (= {:functionCallingConfig {:mode                 "ANY"
                                      :allowedFunctionNames ["structured_output"]}}
             (:toolConfig body))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming event conversion tests (synthetic events — no live API)
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel text-conv-test
  (testing "streamed text events map through the full pipeline into one coalesced text part"
    (let [events [{:responseId "r1" :modelVersion "gemini-3.5-flash"
                   :candidates [{:content {:role "model" :parts [{:text "Hel"}]} :index 0}]}
                  {:candidates [{:content {:role "model" :parts [{:text "lo"}]}}]}
                  {:candidates [{:content {:role "model" :parts []} :finishReason "STOP"}]
                   :usageMetadata {:promptTokenCount 5 :candidatesTokenCount 2 :totalTokenCount 7}}]]
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (m/distinct-by :type)) events)))
      (is (=? [{:type :start :id "r1"}
               {:type :text :text "Hello"}
               {:type  :usage
                :model "gemini-3.5-flash"
                :usage {:promptTokens 5 :completionTokens 2}}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel tool-call-conv-test
  (testing "a functionCall part maps to a tool-input part with parsed arguments"
    (let [events [{:responseId "r2" :modelVersion "gemini-3.5-flash"
                   :candidates [{:content {:role "model"
                                           :parts [{:functionCall {:name "get_time" :args {:tz "UTC"}}}]}
                                 :finishReason "STOP"}]
                   :usageMetadata {:promptTokenCount 8 :candidatesTokenCount 4}}]]
      (is (=? [{:type :start}
               {:type      :tool-input
                :function  "get_time"
                :arguments {:tz "UTC"}}
               {:type :usage :usage {:promptTokens 8 :completionTokens 4}}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel thought-signature-round-trip-test
  (testing "a streamed thoughtSignature survives through the chunk pipeline into the :tool-input part
            and back onto the wire on replay"
    (let [events [{:responseId "r-sig"
                   :candidates [{:content {:role  "model"
                                           :parts [{:functionCall     {:name "get_time" :args {:tz "UTC"}}
                                                    :thoughtSignature "sig-abc"}]}
                                 :finishReason "STOP"}]}]
          parts  (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events)
          tool   (first (filter #(= :tool-input (:type %)) parts))]
      (is (= {:google {:thoughtSignature "sig-abc"}}
             (:provider-metadata tool)))
      (is (=? [{:role  "model"
                :parts [{:functionCall     {:name "get_time"}
                         :thoughtSignature "sig-abc"}]}]
              (sgc/parts->contents [tool]))))))

(deftest ^:parallel parallel-tool-calls-conv-test
  (testing "multiple functionCall parts in one event become distinct tool-input parts"
    (let [events [{:responseId "r3"
                   :candidates [{:content {:role "model"
                                           :parts [{:functionCall {:name "a" :args {:x 1}}}
                                                   {:functionCall {:name "b" :args {:y 2}}}]}
                                 :finishReason "STOP"}]}]
          parts  (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events)
          tools  (filterv #(= :tool-input (:type %)) parts)]
      (is (= [["a" {:x 1}] ["b" {:y 2}]]
             (mapv (juxt :function :arguments) tools)))
      (is (apply distinct? (map :id tools))
          "each generated toolCallId is unique"))))

(deftest ^:parallel text-then-tool-call-closes-text-test
  (testing "a functionCall closes the open text block before the tool chunks"
    (let [events [{:responseId "r4"
                   :candidates [{:content {:role "model" :parts [{:text "Looking..."}]}}]}
                  {:candidates [{:content {:role "model"
                                           :parts [{:functionCall {:name "search" :args {}}}]}
                                 :finishReason "STOP"}]}]]
      (is (=? [{:type :start}
               {:type :text-start} {:type :text-delta} {:type :text-end}
               {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available}]
              (into [] (sgc/->aisdk-chunks-xf) events))))))

(deftest ^:parallel thought-parts-ignored-test
  (testing "parts flagged :thought true (thinking summaries) are dropped"
    (let [events [{:responseId "r5"
                   :candidates [{:content {:role "model"
                                           :parts [{:thought true :text "reasoning..."}
                                                   {:text "Answer"}]}
                                 :finishReason "STOP"}]}]]
      (is (=? [{:type :start}
               {:type :text :text "Answer"}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel usage-buffered-and-emitted-once-test
  (testing "usageMetadata is buffered last-wins and emitted once at stream end, after content"
    (let [events [{:responseId "r6" :modelVersion "gemini-3.5-flash"
                   :candidates [{:content {:role "model" :parts [{:text "Hi"}]}}]
                   :usageMetadata {:promptTokenCount 10}}
                  {:candidates [{:content {:role "model" :parts [{:text " there"}]} :finishReason "STOP"}]
                   :usageMetadata {:promptTokenCount 10 :candidatesTokenCount 2 :totalTokenCount 12}}]
          out    (into [] (sgc/->aisdk-chunks-xf) events)
          usages (filterv #(= :usage (:type %)) out)]
      (is (= :usage (:type (last out))))
      (is (= 1 (count usages)))
      (is (= {:promptTokens 10 :completionTokens 2 :cacheCreationTokens 0 :cacheReadTokens 0}
             (:usage (first usages)))))))

(deftest ^:parallel usage-thoughts-and-cache-tokens-test
  (testing "thoughtsTokenCount folds into completionTokens; cachedContentTokenCount maps to cacheReadTokens"
    (let [events [{:responseId "r7"
                   :candidates [{:content {:role "model" :parts [{:text "Hi"}]} :finishReason "STOP"}]
                   :usageMetadata {:promptTokenCount        5000
                                   :candidatesTokenCount    7
                                   :thoughtsTokenCount      93
                                   :cachedContentTokenCount 4200
                                   :totalTokenCount         5100}}]
          usage  (->> (into [] (sgc/->aisdk-chunks-xf) events)
                      (filter #(= :usage (:type %)))
                      first)]
      (is (= {:promptTokens        5000
              :completionTokens    100
              :cacheCreationTokens 0
              :cacheReadTokens     4200}
             (:usage usage))))))

(deftest ^:parallel blocked-prompt-test
  (testing "a blocked prompt (promptFeedback.blockReason, no candidates) emits an error part"
    (let [events [{:responseId     "r8"
                   :promptFeedback {:blockReason "PROHIBITED_CONTENT"}
                   :usageMetadata  {:promptTokenCount 12}}]]
      (is (=? [{:type :start}
               {:type :error :error {:message "Prompt blocked by Google: PROHIBITED_CONTENT"}}
               {:type :usage}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel in-stream-error-test
  (testing "an error envelope in the stream becomes an error part"
    (let [events [{:responseId "r9"
                   :candidates [{:content {:role "model" :parts [{:text "partial"}]}}]}
                  {:error {:code 503 :message "The model is overloaded." :status "UNAVAILABLE"}}]]
      (is (=? [{:type :start}
               {:type :text :text "partial"}
               {:type :error :error {:message "The model is overloaded."}}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel interrupted-stream-flushes-text-and-usage-test
  (testing "when the stream ends without a finishReason, the open text block and buffered usage still flush"
    (let [events [{:responseId "r10" :modelVersion "gemini-3.5-flash"
                   :candidates [{:content {:role "model" :parts [{:text "partial answer"}]}}]
                   :usageMetadata {:promptTokenCount 4}}]]
      (is (=? [{:type :start}
               {:type :text :text "partial answer"}
               {:type :usage :usage {:promptTokens 4 :completionTokens 0}}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))
