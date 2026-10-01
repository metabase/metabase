(ns metabase.metabot.self.google.raw-predict-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.google.raw-predict :as raw-predict]
   [metabase.metabot.test-util :as metabot.tu]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; request-body tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-drops-model-test
  (testing "the streamRawPredict URL names the model, so the Messages body must not carry one"
    (is (not (contains? (raw-predict/request-body "claude-haiku-4-5@20251001"
                                                  {:input [{:role :user :content "hi"}]})
                        :model)))))

(deftest ^:parallel request-body-pins-anthropic-version-test
  (testing "the platform takes `anthropic_version` in the body rather than the header the direct API uses"
    (is (= @#'raw-predict/anthropic-version
           (:anthropic_version (raw-predict/request-body "claude-haiku-4-5@20251001"
                                                         {:input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-is-otherwise-the-messages-body-test
  (testing "everything but the model and the version is exactly what the direct Messages adapter builds"
    (is (=? {:stream        true
             :cache_control {:type "ephemeral"}
             :messages      [{:role "user" :content [{:type "text" :text "hi"}]}]
             :system        [{:type "text" :text "You are terse." :cache_control {:type "ephemeral"}}]}
            (raw-predict/request-body "claude-haiku-4-5@20251001"
                                      {:system "You are terse."
                                       :input  [{:role :user :content "hi"}]})))))

(deftest ^:parallel request-body-dated-model-resolves-max-tokens-test
  (testing "a model dated in the platform's `@` spelling resolves to the same max_tokens ceiling as its
            direct-API `-` spelling, rather than falling back to the unknown-model default"
    (is (= 32000
           (:max_tokens (raw-predict/request-body "claude-opus-4-1@20250805"
                                                  {:input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-bare-model-resolves-max-tokens-test
  (testing "an undated model ID is already in the direct-API spelling and resolves as-is"
    (is (= 128000
           (:max_tokens (raw-predict/request-body "claude-sonnet-4-6"
                                                  {:input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-unknown-model-gets-default-max-tokens-test
  (testing "a model outside the Claude adapter's knowledge falls back to the safe default ceiling"
    (is (= 64000
           (:max_tokens (raw-predict/request-body "claude-not-a-real-model"
                                                  {:input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-explicit-max-tokens-wins-test
  (testing "an explicit :max-tokens overrides the model's ceiling"
    (is (= 4096
           (:max_tokens (raw-predict/request-body "claude-opus-4-1@20250805"
                                                  {:input      [{:role :user :content "hi"}]
                                                   :max-tokens 4096}))))))

(deftest ^:parallel request-body-dated-model-thinking-test
  (testing "a dated current-generation model still gets its thinking config"
    (is (=? {:thinking {:type "adaptive" :display "summarized"}}
            (raw-predict/request-body "claude-sonnet-4-6@20250929"
                                      {:input [{:role :user :content "hi"}]})))))

(deftest ^:parallel request-body-reasoning-disabled-test
  (testing ":reasoning? false suppresses thinking for a model that would otherwise stream it"
    (is (not (contains? (raw-predict/request-body "claude-sonnet-4-6@20250929"
                                                  {:input      [{:role :user :content "hi"}]
                                                   :reasoning? false})
                        :thinking)))))

(deftest ^:parallel request-body-tools-get-cache-breakpoint-test
  (testing "tools are converted and carry the prompt-caching breakpoint on the last one"
    (is (=? {:tools [{:name          "get-time"
                      :description   "Return current time for a given IANA timezone."
                      :input_schema  {:type "object"}
                      :cache_control {:type "ephemeral"}}]}
            (raw-predict/request-body "claude-haiku-4-5@20251001"
                                      {:input [{:role :user :content "hi"}]
                                       :tools [(metabot.tu/get-time-tool)]})))))

(deftest ^:parallel request-body-schema-forces-structured-output-test
  (testing "a :schema becomes the forced structured_output tool, replacing any other tools"
    (is (=? {:tool_choice {:type "tool" :name "structured_output"}
             :tools       [{:name         "structured_output"
                            :input_schema {:type "object"}}]}
            (raw-predict/request-body "claude-haiku-4-5@20251001"
                                      {:input  [{:role :user :content "hi"}]
                                       :tools  [(metabot.tu/get-time-tool)]
                                       :schema {:type "object"}})))))

;;; ──────────────────────────────────────────────────────────────────
;;; ->aisdk-chunks-xf tests
;;; ──────────────────────────────────────────────────────────────────

(def ^:private text-stream-events
  "A minimal Messages API text stream, which the platform serves verbatim."
  [{:type "message_start" :message {:id "msg-1" :model "claude-haiku-4-5" :usage {:input_tokens 12 :output_tokens 0}}}
   {:type "content_block_start" :index 0 :content_block {:type "text"}}
   {:type "content_block_delta" :index 0 :delta {:type "text_delta" :text "Hello"}}
   {:type "content_block_stop" :index 0}
   {:type "message_delta" :delta {:stop_reason "end_turn"} :usage {:input_tokens 12 :output_tokens 3}}
   {:type "message_stop"}])

(deftest ^:parallel ->aisdk-chunks-xf-test
  (testing "streamed Messages events are translated by the Claude adapter's transducer"
    (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
            (into [] (comp (raw-predict/->aisdk-chunks-xf) (m/distinct-by :type)) text-stream-events)))))

(deftest ^:parallel ->aisdk-chunks-xf-full-pipeline-test
  (testing "through the full pipeline the stream produces the text part and its usage"
    (is (=? [{:type :start :id string?}
             {:type :text :text "Hello"}
             {:type :usage :model "claude-haiku-4-5"
              :usage {:promptTokens 12 :completionTokens 3}}]
            (into [] (comp (raw-predict/->aisdk-chunks-xf) (self.core/aisdk-xf)) text-stream-events)))))

;;; ──────────────────────────────────────────────────────────────────
;;; reasoning-model? tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel reasoning-model?-test
  (testing "reasoning support follows the Claude adapter's answer for the model"
    (is (true? (raw-predict/reasoning-model? "claude-sonnet-4-6")))
    (is (false? (raw-predict/reasoning-model? "claude-haiku-4-5")))))

(deftest ^:parallel reasoning-model?-dated-model-test
  (testing "a model dated in the platform's `@` spelling is recognized as the model it dates"
    (is (true? (raw-predict/reasoning-model? "claude-sonnet-4-6@20250929")))
    (is (false? (raw-predict/reasoning-model? "claude-haiku-4-5@20251001")))))

(deftest ^:parallel reasoning-model?-unknown-model-test
  (testing "a model we know nothing about does not stream reasoning"
    (is (false? (raw-predict/reasoning-model? "claude-not-a-real-model")))
    (is (false? (raw-predict/reasoning-model? nil)))))

;;; ──────────────────────────────────────────────────────────────────
;;; context-window-tokens tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel context-window-tokens-test
  (testing "the context window follows the Claude adapter's answer for the model"
    (is (= 1000000 (raw-predict/context-window-tokens "claude-sonnet-4-6")))
    (is (=  200000 (raw-predict/context-window-tokens "claude-haiku-4-5-20251001")))))

(deftest ^:parallel context-window-tokens-dated-model-test
  (testing "a model dated in the platform's `@` spelling is recognized as the model it dates"
    (is (= 200000 (raw-predict/context-window-tokens "claude-haiku-4-5@20251001")))
    (is (= 200000 (raw-predict/context-window-tokens "claude-sonnet-4-5@20250929")))))

(deftest ^:parallel context-window-tokens-unknown-model-test
  (testing "a model we know nothing about has no context window"
    (is (nil? (raw-predict/context-window-tokens "claude-not-a-real-model")))
    (is (nil? (raw-predict/context-window-tokens nil)))))
