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

(deftest ^:parallel parts->contents-blank-message-folds-into-neighbour-test
  (testing "a blank message contributes no parts to the content it merges with"
    (is (= [{:role "user" :parts [{:text "Hello"}]}]
           (sgc/parts->contents
            [{:role :user :content ""}
             {:role :user :content "Hello"}])))))

(deftest ^:parallel parts->contents-standalone-blank-message-dropped-test
  (testing "a blank message with no neighbour is dropped"
    (is (= [{:role "model" :parts [{:text "Hi there!"}]}]
           (sgc/parts->contents
            [{:role :user :content ""}
             {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->contents-blank-message-between-model-turns-does-not-split-them-test
  (testing "dropping a blank message merges the model contents that surrounded it, rather than leaving two in a row"
    (is (= [{:role "model" :parts [{:text "first"} {:text "second"}]}]
           (sgc/parts->contents
            [{:type :text :text "first"}
             {:role :user :content ""}
             {:type :text :text "second"}])))))

(deftest ^:parallel parts->contents-content-with-no-text-blocks-dropped-test
  (testing "a stored message whose content carries no parts is dropped rather than sent as an empty parts array"
    (is (= [{:role "model" :parts [{:text "Hi there!"}]}]
           (sgc/parts->contents
            [{:role :user :content []}
             {:type :text :text "Hi there!"}])))))

(def ^:private placeholder-signature
  "Google's documented bypass signature, sent when a replayed functionCall has no captured one."
  "skip_thought_signature_validator")

(deftest ^:parallel parts->contents-system-message-goes-in-the-user-channel-test
  (testing "non-user non-model roles collapse to user"
    (is (= [{:role "user" :parts [{:text "be nice"} {:text "hi"}]}]
           (sgc/parts->contents
            [{:role :system :content "be nice"}
             {:role :user :content "hi"}])))))

(deftest ^:parallel parts->contents-unknown-role-goes-in-the-user-channel-test
  (testing "a role we don't recognize maps to user"
    (is (= [{:role "user" :parts [{:text "from somewhere"}]}]
           (sgc/parts->contents
            [{:role :function :content "from somewhere"}])))))

(deftest ^:parallel parts->contents-empty-text-part-dropped-test
  (testing "an empty assistant text part contributes no parts"
    (is (= [{:role "model" :parts [{:functionCall     {:name "search" :args {}}
                                    :thoughtSignature placeholder-signature}]}]
           (sgc/parts->contents
            [{:type :text :text ""}
             {:type :tool-input :id "call-1" :function "search" :arguments {}}])))))

(deftest ^:parallel parts->contents-whitespace-text-part-kept-test
  (testing "a whitespace-only text part survives: dropping it would run the surrounding words together"
    (is (= [{:role "model" :parts [{:text "Hello"} {:text " "} {:text "world"}]}]
           (sgc/parts->contents
            [{:type :text :text "Hello"}
             {:type :text :text " "}
             {:type :text :text "world"}])))))

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

(deftest ^:parallel parts->contents-tool-result-without-output-key-test
  (testing "a result map that carries no :output is printed rather than sent as an empty response"
    (is (= [{:role  "user"
             :parts [{:functionResponse {:name     "search"
                                         :response {:output "{:rows [1 2]}"}}}]}]
           (sgc/parts->contents
            [{:type :tool-output :id "call-1" :function "search" :result {:rows [1 2]}}])))))

(deftest ^:parallel parts->contents-tool-output-with-neither-result-nor-error-test
  (testing "a tool output with nothing in it sends a 'nil' response"
    (is (= [{:role  "user"
             :parts [{:functionResponse {:name "search" :response {:output "nil"}}}]}]
           (sgc/parts->contents
            [{:type :tool-output :id "call-1" :function "search"}])))))

(deftest ^:parallel parts->contents-parallel-tool-calls-test
  (testing "two tool calls and their two results each merge into one content keeping the model/user alternation"
    (is (= [{:role  "model"
             :parts [{:functionCall     {:name "f1" :args {:x 1}}
                      :thoughtSignature placeholder-signature}
                     {:functionCall     {:name "f2" :args {:y 2}}
                      :thoughtSignature placeholder-signature}]}
            {:role  "user"
             :parts [{:functionResponse {:name "f1" :response {:output "o1"}}}
                     {:functionResponse {:name "f2" :response {:output "o2"}}}]}]
           (sgc/parts->contents
            [{:type :tool-input :id "a" :function "f1" :arguments {:x 1}}
             {:type :tool-input :id "b" :function "f2" :arguments {:y 2}}
             {:type :tool-output :id "a" :result {:output "o1"}}
             {:type :tool-output :id "b" :result {:output "o2"}}])))))

(deftest ^:parallel parts->contents-full-conversation-test
  (testing "a whole turn alternates user, model, user, model"
    (is (= [{:role "user" :parts [{:text "What time is it?"}]}
            {:role  "model"
             :parts [{:text "Let me check..."}
                     {:functionCall     {:name "get_time" :args {:tz "Europe/Kyiv"}}
                      :thoughtSignature placeholder-signature}]}
            {:role  "user"
             :parts [{:functionResponse {:name     "get_time"
                                         :response {:output "2026-02-13T14:00:00+02:00"}}}]}
            {:role "model" :parts [{:text "It's 2:00 PM in Kyiv."}]}]
           (sgc/parts->contents
            [{:role :user :content "What time is it?"}
             {:type :text :text "Let me check..."}
             {:type :tool-input :id "call-1" :function "get_time" :arguments {:tz "Europe/Kyiv"}}
             {:type :tool-output :id "call-1" :result {:output "2026-02-13T14:00:00+02:00"}}
             {:type :text :text "It's 2:00 PM in Kyiv."}])))))

(deftest ^:parallel parts->contents-tool-output-name-fallback-test
  (testing "a tool output without :function (history-rebuilt parts) takes its name from the tool-input with the same id"
    (is (= [{:role "model" :parts [{:functionCall     {:name "search" :args {:q "revenue"}}
                                    :thoughtSignature placeholder-signature}]}
            {:role "user"  :parts [{:functionResponse {:name     "search"
                                                       :response {:output "Found it"}}}]}]
           (sgc/parts->contents
            [{:type :tool-input :id "call-1" :function "search" :arguments {:q "revenue"}}
             {:type :tool-output :id "call-1" :result {:output "Found it"}}]))))
  (testing "an orphan tool output gets a placeholder name — Gemini rejects a missing one"
    (is (= [{:role "user" :parts [{:functionResponse {:name     "unknown_function"
                                                      :response {:output "orphan"}}}]}]
           (sgc/parts->contents
            [{:type :tool-output :id "call-9" :result {:output "orphan"}}])))))

(deftest ^:parallel parts->contents-reasoning-part-dropped-test
  (testing "a :reasoning part is display-only and contributes no content"
    (is (= [{:role "user" :parts [{:text "question"}]}
            {:role "model" :parts [{:text "answer"}]}]
           (sgc/parts->contents
            [{:role :user :content "question"}
             {:type :reasoning :text "thinking..." :id "r1"}
             {:type :text :text "answer"}]))))
  (testing "and dropping it does not split the model contents that surrounded it"
    (is (= [{:role "model" :parts [{:text "first"} {:text "second"}]}]
           (sgc/parts->contents
            [{:type :text :text "first"}
             {:type :reasoning :text "thinking..." :id "r1"}
             {:type :text :text "second"}])))))

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
  (testing "the documented bypass signature is sent when the part carries none"
    (is (= [{:role "model" :parts [{:functionCall     {:name "search" :args {}}
                                    :thoughtSignature placeholder-signature}]}]
           (sgc/parts->contents
            [{:type :tool-input :id "call-1" :function "search" :arguments {}}])))))

(deftest ^:parallel parts->contents-foreign-provider-metadata-test
  (testing "provider metadata from another provider is not mistaken for a Google signature"
    (is (= [{:role  "model"
             :parts [{:functionCall     {:name "search" :args {}}
                      :thoughtSignature placeholder-signature}]}]
           (sgc/parts->contents
            [{:type              :tool-input
              :id                "call-1"
              :function          "search"
              :arguments         {}
              :provider-metadata {:anthropic {:signature "sig-abc"}}}])))))

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
    (is (= {:systemInstruction {:parts [{:text "You are a helpful assistant."}]}
            :contents          [{:role "user" :parts [{:text "hi"}]}]}
           (sgc/request-body
            {:system "You are a helpful assistant."
             :input  [{:role :user :content "hi"}]})))))

(deftest ^:parallel request-body-no-system-message-test
  (testing "no systemInstruction is sent when system is not provided"
    (is (= {:contents [{:role "user" :parts [{:text "hi"}]}]}
           (sgc/request-body {:input [{:role :user :content "hi"}]})))))

(deftest ^:parallel request-body-generation-config-test
  (testing "max-tokens and temperature land in generationConfig"
    (is (= {:contents         [{:role "user" :parts [{:text "hi"}]}]
            :generationConfig {:maxOutputTokens 256 :temperature 0.2}}
           (sgc/request-body {:input       [{:role :user :content "hi"}]
                              :max-tokens  256
                              :temperature 0.2})))))

(deftest ^:parallel request-body-generation-config-only-when-set-test
  (testing "maxOutputTokens is omitted when the caller doesn't pass max-tokens, letting the model use its own limit"
    (is (= {:contents         [{:role "user" :parts [{:text "hi"}]}]
            :generationConfig {:temperature 0.2}}
           (sgc/request-body {:input       [{:role :user :content "hi"}]
                              :temperature 0.2}))))
  (testing "temperature is omitted when the caller doesn't pass one, letting the model use its own default"
    (is (= {:contents         [{:role "user" :parts [{:text "hi"}]}]
            :generationConfig {:maxOutputTokens 256}}
           (sgc/request-body {:input      [{:role :user :content "hi"}]
                              :max-tokens 256}))))
  (testing "no generationConfig is sent when neither max-tokens nor temperature is provided"
    (is (= {:contents [{:role "user" :parts [{:text "hi"}]}]}
           (sgc/request-body {:input [{:role :user :content "hi"}]})))))

(deftest ^:parallel request-body-tool-choice-without-tools-test
  (testing "a tool_choice with no tools to choose from sends no toolConfig, which Gemini rejects on its own"
    (is (= {:contents [{:role "user" :parts [{:text "hi"}]}]}
           (sgc/request-body {:input       [{:role :user :content "hi"}]
                              :tool_choice "required"})))))

(deftest ^:parallel request-body-tools-test
  (testing "tools become functionDeclarations carrying parametersJsonSchema, and no toolConfig without a tool_choice"
    (is (=? {:tools      [{:functionDeclarations
                           [{:name                 "get_weather"
                             :description          "Get the weather."
                             :parametersJsonSchema {:type       "object"
                                                    :properties {:city {:type "string"}}
                                                    :required   [:city]}}]}]
             :toolConfig (symbol "nil #_\"key is not present.\"")}
            (sgc/request-body
             {:input [{:role :user :content "hi"}]
              :tools [{:tool-name "get_weather"
                       :doc       "Get the weather."
                       :schema    [:=> [:cat [:map [:city :string]]] :any]
                       :fn        identity}]})))))

(deftest ^:parallel request-body-several-tools-test
  (testing "several tools share one functionDeclarations array"
    (is (=? {:tools [{:functionDeclarations [{:name "t1"} {:name "t2"}]}]}
            (sgc/request-body
             {:input [{:role :user :content "hi"}]
              :tools [{:tool-name "t1" :doc "d1"
                       :schema    [:=> [:cat [:map [:x :string]]] :any]
                       :fn        identity}
                      {:tool-name "t2" :doc "d2"
                       :schema    [:=> [:cat [:map [:y :string]]] :any]
                       :fn        identity}]})))))

(deftest ^:parallel request-body-tool-choice-test
  (testing "tool_choice maps to functionCallingConfig mode"
    (let [body-for (fn [tool-choice]
                     (sgc/request-body
                      {:input       [{:role :user :content "hi"}]
                       :tools       [{:tool-name "t" :doc "d"
                                      :schema    [:=> [:cat [:map [:x :string]]] :any]
                                      :fn        identity}]
                       :tool_choice tool-choice}))]
      (is (=? {:toolConfig {:functionCallingConfig {:mode "AUTO"}}}
              (body-for "auto")))
      (is (=? {:toolConfig {:functionCallingConfig {:mode "ANY"}}}
              (body-for "required"))))))

(deftest ^:parallel request-body-structured-output-test
  (testing "a :schema forces a structured_output function call via mode ANY + allowedFunctionNames"
    (let [schema {:type "object" :properties {:sql {:type "string"}}}]
      (is (= {:contents   [{:role "user" :parts [{:text "hi"}]}]
              :tools      [{:functionDeclarations [{:name                 "structured_output"
                                                    :description          "Output structured data"
                                                    :parametersJsonSchema schema}]}]
              :toolConfig {:functionCallingConfig {:mode                 "ANY"
                                                   :allowedFunctionNames ["structured_output"]}}}
             (sgc/request-body
              {:input  [{:role :user :content "hi"}]
               :schema schema}))))))

(deftest ^:parallel request-body-structured-output-replaces-tools-test
  (testing "a :schema replaces the caller's tools and tool_choice"
    (is (= {:contents   [{:role "user" :parts [{:text "hi"}]}]
            :tools      [{:functionDeclarations [{:name                 "structured_output"
                                                  :description          "Output structured data"
                                                  :parametersJsonSchema {:type "object"}}]}]
            :toolConfig {:functionCallingConfig {:mode                 "ANY"
                                                 :allowedFunctionNames ["structured_output"]}}}
           (sgc/request-body
            {:input       [{:role :user :content "hi"}]
             :tools       [{:tool-name "get_weather" :doc "Get the weather."
                            :schema    [:=> [:cat [:map [:city :string]]] :any]
                            :fn        identity}]
             :tool_choice "auto"
             :schema      {:type "object"}})))))

(deftest ^:parallel request-body-thinking-config-test
  (testing "a catalog model asks for thought summaries by default"
    (is (=? {:generationConfig {:thinkingConfig {:includeThoughts true}}}
            (sgc/request-body {:model "google/gemini-3.5-flash"
                               :input [{:role :user :content "hi"}]}))))
  (testing "structured output pins thinking to LOW instead, with or without :reasoning?"
    (is (=? {:generationConfig {:thinkingConfig {:thinkingLevel "LOW"}}}
            (sgc/request-body {:model  "google/gemini-3.7-flash"
                               :input  [{:role :user :content "hi"}]
                               :schema {:type "object"}})))
    (is (=? {:generationConfig {:thinkingConfig {:thinkingLevel "LOW"}}}
            (sgc/request-body {:model      "google/gemini-3.5-flash"
                               :input      [{:role :user :content "hi"}]
                               :reasoning? false
                               :schema     {:type "object"}}))))
  (testing ":reasoning? false sends no thinkingConfig, leaving the server default"
    (is (= {:contents [{:role "user" :parts [{:text "hi"}]}]}
           (sgc/request-body {:model      "google/gemini-3.6-flash"
                              :input      [{:role :user :content "hi"}]
                              :reasoning? false}))))
  (testing "an off-catalog or absent model gets no thinkingConfig at all"
    (is (= {:contents [{:role "user" :parts [{:text "hi"}]}]}
           (sgc/request-body {:model "google/gemini-2.5-flash"
                              :input [{:role :user :content "hi"}]})))
    (is (= {:contents [{:role "user" :parts [{:text "hi"}]}]}
           (sgc/request-body {:input [{:role :user :content "hi"}]})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming event conversion tests.
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
  (testing "a streamed thoughtSignature survives through the chunk pipeline into the :tool-input part"
    (let [events [{:responseId "r-sig"
                   :candidates [{:content {:role  "model"
                                           :parts [{:functionCall     {:name "get_time" :args {:tz "UTC"}}
                                                    :thoughtSignature "sig-abc"}]}
                                 :finishReason "STOP"}]}]
          parts  (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events)
          tool   (first (filter #(= :tool-input (:type %)) parts))]
      (is (=? {:provider-metadata {:google {:thoughtSignature "sig-abc"}}}
              tool))
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
      (is (=? [{:function "a" :arguments {:x 1}}
               {:function "b" :arguments {:y 2}}]
              tools))
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
               {:type :text-start}
               {:type :text-delta}
               {:type :text-end}
               {:type :tool-input-start}
               {:type :tool-input-delta}
               {:type :tool-input-available}]
              (into [] (sgc/->aisdk-chunks-xf) events))))))

(deftest ^:parallel empty-text-part-between-tool-calls-does-not-divide-them-test
  (testing "an empty text part opens no text block, thus it leaves the tool calls around it whole"
    (let [events [{:responseId "r4b"
                   :candidates [{:content {:role  "model"
                                           :parts [{:functionCall {:name "a" :args {}}}
                                                   {:text ""}
                                                   {:functionCall {:name "b" :args {}}}]}
                                 :finishReason "STOP"}]}]]
      (is (=? [{:type :start}
               {:type :tool-input-start :toolName "a"}
               {:type :tool-input-delta}
               {:type :tool-input-available :toolName "a"}
               {:type :tool-input-start :toolName "b"}
               {:type :tool-input-delta}
               {:type :tool-input-available :toolName "b"}]
              (into [] (sgc/->aisdk-chunks-xf) events))))))

(deftest ^:parallel whitespace-text-delta-kept-inside-an-open-block-test
  (testing "a blank delta inside an open text block passes through, thus the space between two words survives"
    (let [events [{:responseId "r4c"
                   :candidates [{:content {:role  "model"
                                           :parts [{:text "Hello"} {:text " "} {:text "world"}]}
                                 :finishReason "STOP"}]}]]
      (is (=? [{:type :start}
               {:type :text :text "Hello world"}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel thought-parts-stream-as-reasoning-test
  (testing "thinking summaries stream as a reasoning part ahead of the answer text"
    (let [events [{:responseId "r5"
                   :candidates [{:content {:role "model"
                                           :parts [{:thought true :text "reasoning..."}
                                                   {:text "Answer"}]}
                                 :finishReason "STOP"}]}]]
      (is (=? [{:type :start}
               {:type :reasoning :text "reasoning..."}
               {:type :text :text "Answer"}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel thought-text-transitions-close-and-reopen-blocks-test
  (testing "a thought/text transition closes the one block kind and opens the other"
    (let [events [{:responseId "r5b"
                   :candidates [{:content {:role "model"
                                           :parts [{:thought true :text "t1"}
                                                   {:text "a1"}
                                                   {:thought true :text "t2"}]}
                                 :finishReason "STOP"}]}]]
      (is (=? [{:type :start}
               {:type :reasoning-start}
               {:type :reasoning-delta :delta "t1"}
               {:type :reasoning-end}
               {:type :text-start}
               {:type :text-delta :delta "a1"}
               {:type :text-end}
               {:type :reasoning-start}
               {:type :reasoning-delta :delta "t2"}
               {:type :reasoning-end}]
              (into [] (sgc/->aisdk-chunks-xf) events))))))

(deftest ^:parallel thought-before-tool-call-closes-reasoning-test
  (testing "a functionCall closes the open reasoning block before the tool chunks"
    (let [events [{:responseId "r5c"
                   :candidates [{:content {:role "model"
                                           :parts [{:thought true :text "planning..."}
                                                   {:functionCall     {:name "search" :args {}}
                                                    :thoughtSignature "sig-1"}]}
                                 :finishReason "STOP"}]}]]
      (is (=? [{:type :start}
               {:type :reasoning-start}
               {:type :reasoning-delta}
               {:type :reasoning-end}
               {:type :tool-input-start :providerMetadata {:google {:thoughtSignature "sig-1"}}}
               {:type :tool-input-delta}
               {:type :tool-input-available}]
              (into [] (sgc/->aisdk-chunks-xf) events))))))

(deftest ^:parallel empty-parts-do-not-split-a-reasoning-block-test
  (testing "an empty thought and a signature-only empty text part emit nothing and close nothing"
    (let [events [{:responseId "r5d"
                   :candidates [{:content {:role "model"
                                           :parts [{:thought true :text "before"}
                                                   {:thought true :text ""}
                                                   {:text "" :thoughtSignature "sig-tail"}
                                                   {:thought true :text " after"}]}
                                 :finishReason "STOP"}]}]]
      (is (=? [{:type :start}
               {:type :reasoning :text "before after"}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel stream-end-closes-open-reasoning-block-test
  (testing "a stream that ends mid-thought still closes the reasoning block"
    (let [events [{:responseId "r5e"
                   :candidates [{:content {:role "model" :parts [{:thought true :text "unfinished"}]}}]}]]
      (is (=? [{:type :start}
               {:type :reasoning-start}
               {:type :reasoning-delta}
               {:type :reasoning-end}]
              (into [] (sgc/->aisdk-chunks-xf) events))))))

(deftest ^:parallel usage-buffered-and-emitted-once-test
  (testing "usageMetadata is buffered last-wins and emitted once at stream end, after content"
    (let [events [{:responseId "r6" :modelVersion "gemini-3.5-flash"
                   :candidates [{:content {:role "model" :parts [{:text "Hi"}]}}]
                   :usageMetadata {:promptTokenCount 10}}
                  {:candidates [{:content {:role "model" :parts [{:text " there"}]} :finishReason "STOP"}]
                   :usageMetadata {:promptTokenCount 10 :candidatesTokenCount 2 :totalTokenCount 12}}]
          out    (into [] (sgc/->aisdk-chunks-xf) events)
          usages (filterv #(= :usage (:type %)) out)]
      (is (=? {:type :usage} (last out)))
      (is (=? [{:type  :usage
                :usage {:promptTokens       10
                        :completionTokens    2
                        :cacheCreationTokens 0
                        :cacheReadTokens     0}}]
              usages)))))

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
      (is (=? {:usage {:promptTokens        5000
                       :completionTokens    100
                       :cacheCreationTokens 0
                       :cacheReadTokens     4200}}
              usage)))))

(deftest ^:parallel usage-tool-use-prompt-tokens-test
  (testing "toolUsePromptTokenCount is a bucket of its own and sums into promptTokens rather than being dropped"
    (let [events [{:responseId "r7b"
                   :candidates [{:content {:role "model" :parts [{:text "Hi"}]} :finishReason "STOP"}]
                   :usageMetadata {:promptTokenCount        30
                                   :candidatesTokenCount    7
                                   :toolUsePromptTokenCount 120
                                   :totalTokenCount         157}}]
          usage  (->> (into [] (sgc/->aisdk-chunks-xf) events)
                      (filter #(= :usage (:type %)))
                      first)]
      (is (=? {:usage {:promptTokens        150
                       :completionTokens    7
                       :cacheCreationTokens 0
                       :cacheReadTokens     0}}
              usage)))))

(deftest ^:parallel model-version-from-a-later-event-test
  (testing "modelVersion can arrive on any event, and the last one reaches the :usage chunk"
    (let [events [{:responseId "r7c"
                   :candidates [{:content {:role "model" :parts [{:text "hi"}]}}]}
                  {:candidates    [{:finishReason "STOP"}]
                   :modelVersion  "gemini-3.5-pro"
                   :usageMetadata {:promptTokenCount 1}}]]
      (is (=? {:type :usage :model "gemini-3.5-pro"}
              (last (into [] (sgc/->aisdk-chunks-xf) events)))))))

(deftest ^:parallel missing-response-id-gets-a-generated-message-id-test
  (testing "a stream with no responseId still gets a message id, thus the parts downstream group under one"
    (let [events [{:candidates [{:content {:role "model" :parts [{:text "hi"}]} :finishReason "STOP"}]}]]
      (is (=? [{:type :start :messageId #"mb-.+"}
               {:type :text-start}
               {:type :text-delta}
               {:type :text-end}]
              (into [] (sgc/->aisdk-chunks-xf) events))))))

(deftest ^:parallel blocked-prompt-test
  (testing "a blocked prompt (promptFeedback.blockReason, no candidates) emits an error part"
    (let [events [{:responseId     "r8"
                   :promptFeedback {:blockReason "PROHIBITED_CONTENT"}
                   :usageMetadata  {:promptTokenCount 12}}]]
      (is (=? [{:type :start}
               {:type :error :error {:message "Prompt blocked by Google: PROHIBITED_CONTENT"}}
               {:type :usage}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel max-tokens-finish-reason-test
  (testing "a MAX_TOKENS truncation becomes :finish-reason \"length\" on the usage chunk not an error part"
    (let [events [{:responseId "r11" :modelVersion "gemini-3.5-flash"
                   :candidates [{:content {:role "model" :parts [{:text "half an ans"}]}
                                 :finishReason "MAX_TOKENS"}]
                   :usageMetadata {:promptTokenCount 4 :thoughtsTokenCount 2000}}]]
      (is (=? [{:type :start}
               {:type :text :text "half an ans"}
               {:type              :usage
                :finish-reason     "length"
                :raw-finish-reason "MAX_TOKENS"}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel max-tokens-truncation-never-reads-as-complete-test
  (testing "a MAX_TOKENS turn that carries no usageMetadata still reports the truncation"
    (let [events [{:responseId "r11b"
                   :candidates [{:content {:role "model" :parts [{:text "half an ans"}]}
                                 :finishReason "MAX_TOKENS"}]}]]
      (is (=? [{:type :start}
               {:type :text-start}
               {:type :text-delta}
               {:type :text-end}
               {:type              :usage
                :finish-reason     "length"
                :raw-finish-reason "MAX_TOKENS"}]
              (into [] (sgc/->aisdk-chunks-xf) events))))))

(deftest ^:parallel finish-reason-translation-test
  (let [usage-chunk (fn [reason]
                      (->> (into [] (sgc/->aisdk-chunks-xf)
                                 [{:responseId    "r11c"
                                   :candidates    [{:content {:role "model" :parts [{:text "hi"}]}
                                                    :finishReason reason}]
                                   :usageMetadata {:promptTokenCount 4}}])
                           (m/find-first #(= :usage (:type %)))))]
    (testing "the AI SDK finish reason rides the usage chunk alongside the raw provider value"
      (are [raw finish-reason] (=? {:finish-reason finish-reason :raw-finish-reason raw}
                                   (usage-chunk raw))
        "STOP"                      "stop"
        "MAX_TOKENS"                "length"
        "SAFETY"                    "content-filter"
        "RECITATION"                "content-filter"
        "BLOCKLIST"                 "content-filter"
        "PROHIBITED_CONTENT"        "content-filter"
        "SPII"                      "content-filter"
        "IMAGE_SAFETY"              "content-filter"
        "IMAGE_PROHIBITED_CONTENT"  "content-filter"
        "IMAGE_RECITATION"          "content-filter"
        "MODEL_ARMOR"               "content-filter"
        "LANGUAGE"                  "content-filter"
        "ESCALATION"                "content-filter"
        "MALFORMED_FUNCTION_CALL"   "error"
        "UNEXPECTED_TOOL_CALL"      "error"
        "TOO_MANY_TOOL_CALLS"       "error"
        "MISSING_THOUGHT_SIGNATURE" "error"
        "MALFORMED_RESPONSE"        "error"
        "OTHER"                     "other"
        "FINISH_REASON_UNSPECIFIED" "other"
        "IMAGE_OTHER"               "other"
        "NO_IMAGE"                  "other"
        "SOMETHING_NEW"             "other"))))

(deftest ^:parallel content-filter-finish-reason-emits-no-error-test
  (testing "a filtered response reports itself as :finish-reason \"content-filter\", which the client renders itself"
    (let [events [{:responseId    "r11d"
                   :candidates    [{:content {:role "model" :parts [{:text "partial"}]}
                                    :finishReason "SAFETY"}]
                   :usageMetadata {:promptTokenCount 4}}]]
      (is (=? [{:type :start}
               {:type :text :text "partial"}
               {:type              :usage
                :finish-reason     "content-filter"
                :raw-finish-reason "SAFETY"}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel content-filter-truncation-never-reads-as-complete-test
  (testing "a filtered turn that carries no usageMetadata still reports the filtering"
    (let [events [{:responseId "r11e"
                   :candidates [{:content {:role "model" :parts [{:text "partial"}]}
                                 :finishReason "SAFETY"}]}]]
      (is (=? [{:type :start}
               {:type :text :text "partial"}
               {:type              :usage
                :finish-reason     "content-filter"
                :raw-finish-reason "SAFETY"}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel stop-reasons-translate-to-aisdk-finish-reasons-test
  (testing "every translation is one of the AI SDK v5 FinishReason values the client knows how to render"
    (is (every? self.core/finish-reasons (vals @#'sgc/stop-reasons)))))

(deftest ^:parallel finish-reasons-without-error-are-the-ones-the-client-renders-test
  (testing "STOP plus every reason translating to \"length\" or \"content-filter\" emits no error part"
    (is (= #{"STOP" "MAX_TOKENS"
             "BLOCKLIST" "ESCALATION" "IMAGE_PROHIBITED_CONTENT" "IMAGE_RECITATION" "IMAGE_SAFETY" "LANGUAGE"
             "MODEL_ARMOR" "PROHIBITED_CONTENT" "RECITATION" "SAFETY" "SPII"}
           @#'sgc/finish-reasons-without-error))))

(deftest ^:parallel malformed-function-call-finish-reason-test
  (testing "MALFORMED_FUNCTION_CALL arrives with no parts at all, so the error part is the only diagnostic"
    (let [events [{:responseId    "r12"
                   :candidates    [{:finishReason "MALFORMED_FUNCTION_CALL"}]
                   :usageMetadata {:promptTokenCount 4}}]]
      (is (=? [{:type :start}
               {:type  :error
                :error {:message #"(?s)Gemini stopped early \(MALFORMED_FUNCTION_CALL\).*"}}
               {:type              :usage
                :finish-reason     "error"
                :raw-finish-reason "MALFORMED_FUNCTION_CALL"}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel finish-reason-with-error-gets-no-synthetic-usage-test
  (testing "a reason that emits an :error chunk already says what went wrong, so no zero-token :usage is invented"
    (let [events [{:responseId "r12b"
                   :candidates [{:finishReason "MALFORMED_FUNCTION_CALL"}]}]]
      (is (=? [{:type :start}
               {:type  :error
                :error {:message #"(?s)Gemini stopped early \(MALFORMED_FUNCTION_CALL\).*"}}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel unknown-finish-reason-test
  (testing "a finish reason we have no message for still reports itself rather than passing silently"
    (let [events [{:responseId    "r13"
                   :candidates    [{:content {:role "model" :parts [{:text "hi"}]}
                                    :finishReason "SOMETHING_NEW"}]
                   :usageMetadata {:promptTokenCount 4}}]]
      (is (=? [{:type :start}
               {:type :text :text "hi"}
               {:type :error :error {:message "Gemini stopped early (SOMETHING_NEW)"}}
               {:type              :usage
                :finish-reason     "other"
                :raw-finish-reason "SOMETHING_NEW"}]
              (into [] (comp (sgc/->aisdk-chunks-xf) (self.core/aisdk-xf)) events))))))

(deftest ^:parallel stop-finish-reason-emits-no-error-test
  (testing "STOP is the one reason that means the model finished, and it emits no error part"
    (let [events [{:responseId "r14"
                   :candidates [{:content {:role "model" :parts [{:text "all done"}]}
                                 :finishReason "STOP"}]}]]
      (is (=? [{:type :start}
               {:type :text :text "all done"}]
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

(deftest ^:parallel in-stream-error-without-a-message-test
  (testing "an error envelope with no message is printed, thus the failure is never silent"
    (let [events [{:responseId "r9b"
                   :error      {:code 500 :status "INTERNAL"}}]]
      (is (=? [{:type :start}
               {:type :error :error {:message "{:code 500, :status \"INTERNAL\"}"}}]
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
