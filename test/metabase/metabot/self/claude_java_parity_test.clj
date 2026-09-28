(ns metabase.metabot.self.claude-java-parity-test
  "Experiment: the Java `MessagesTranslator` against the Clojure translator it replaced, kept verbatim below."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ the replaced Clojure code ------------------------------------------

(defn- claude-usage->aisdk-usage
  "Convert an Anthropic `usage` block into the AISDK `:usage` shape.

  Anthropic reports three disjoint input-token buckets; the total input sent to
  the model is the sum of all three:

      input_tokens                 — fresh (non-cached) input
      cache_creation_input_tokens  — input written to the provider cache
      cache_read_input_tokens      — input served from the provider cache

  We pre-sum these into :promptTokens so downstream analytics and ai_usage_log
  see a provider-neutral total-input count, matching OpenAI's prompt_tokens
  semantic (where cache counts are a subset breakdown of the total).

  ai_usage_log column mapping:

    without Anthropic prompt caching:
      prompt_tokens     := input_tokens
      completion_tokens := output_tokens
      total_tokens      := input_tokens + output_tokens

    with Anthropic prompt caching:
      prompt_tokens     := input_tokens + cache_creation_input_tokens + cache_read_input_tokens
      completion_tokens := output_tokens
      total_tokens      := prompt_tokens + completion_tokens

  The two are equivalent when caching is inactive (both cache buckets are 0),
  so one unified formula is used in code; the split above is purely for reader
  clarity."
  [u]
  {:promptTokens        (+ (:input_tokens u 0)
                           (:cache_creation_input_tokens u 0)
                           (:cache_read_input_tokens u 0))
   :completionTokens    (:output_tokens u 0)
   :cacheCreationTokens (:cache_creation_input_tokens u 0)
   :cacheReadTokens     (:cache_read_input_tokens u 0)})

(def ^:private translated-chunk-type?
  "Claude content-block types we translate into AI SDK chunks."
  #{:text :tool_use :thinking :redacted_thinking})

(def ^:private stop-reasons
  "Anthropic `stop_reason` → AI SDK v5 `FinishReason`."
  {"end_turn"                      "stop"
   "stop_sequence"                 "stop"
   "max_tokens"                    "length"
   "model_context_window_exceeded" "length"
   "tool_use"                      "tool-calls"
   "refusal"                       "content-filter"
   "pause_turn"                    "stop"})

(defn- legacy-xf
  "Translates Claude /v1/messages streaming events into AI SDK v5 protocol chunks.

   https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

   Claude Streaming Format:
   - Each event: {:type \"message_start\" :message {...}}
                 {:type \"content_block_start\" :index 0 :content_block {:type \"text\"}}
                 {:type \"content_block_delta\" :index 0 :delta {:type \"text_delta\" :text \"...\"}}
                 {:type \"content_block_stop\" :index 0}
                 {:type \"message_delta\" :delta {:stop_reason \"end_turn\"}}
                 {:type \"message_stop\"}

   AI SDK v5 Format (SSE protocol):
   - Message parts: {:type :start, :messageId ...}
   - Part types: start, text-start, text-delta, text-end, finish-step, finish
   - Ends with: 'data: [DONE]\\n'"
  []
  (fn [rf]
    (let [current-type (volatile! nil)
          current-id   (volatile! nil)
          message-id   (volatile! nil)
          model-name   (volatile! nil)
          payload      (volatile! {})
          ;; Track the latest usage we've seen (from any event) and whether we
          ;; already emitted it. Claude reports usage at message_start and
          ;; message_delta with cumulative values — we only emit at message_delta
          ;; normally, but if the stream is interrupted we flush the last known
          ;; usage in the completion arity so we don't lose data entirely.
          last-usage   (volatile! nil)
          stop-reason  (volatile! nil)
          close!       (fn [result]
                         (u/prog1 (if-let [end-type (case @current-type
                                                      :text              :text-end
                                                      :tool_use          :tool-input-available
                                                      :thinking          :reasoning-end
                                                      :redacted_thinking :reasoning-end
                                                      nil)]
                                    (rf result (merge {:type end-type} @payload))
                                    result)
                           (vreset! current-type nil)
                           (vreset! current-id nil)
                           (vreset! payload {})))]
      (fn
        ([result]
         (cond-> result
           ;; close up latest type if incomplete
           @current-type (close!)
           ;; flush last-known usage if stream ended before message_delta.
           @last-usage   (rf (cond-> {:type  :usage
                                      :usage (claude-usage->aisdk-usage @last-usage)
                                      :id    @message-id
                                      :model @model-name}
                               @stop-reason (assoc :finish-reason     (metabot.tu/stop-reason->finish-reason stop-reasons @stop-reason)
                                                   :raw-finish-reason @stop-reason)))
           true          (rf)))
        ([result {t :type :keys [message content_block delta error index] :as chunk}]
         (let [block-type (when content_block
                            (keyword (:type content_block)))
               chunk-id   (or (:id content_block) @current-id (some-> index str) (core/mkid))]
           (cond-> result
             ;; start of message
             (= t "message_start")       (-> (rf {:type :start :messageId (:id message)})
                                             (u/prog1
                                               (vreset! message-id (:id message))
                                               (vreset! model-name (:model message))
                                               (vreset! last-usage (:usage message))))
             ;; start of new content block
             (= t "content_block_start") (-> (u/prog1
                                               (vreset! current-type block-type)
                                               (vreset! current-id chunk-id)
                                               (vreset! payload
                                                        (case block-type
                                                          :text              {:id chunk-id}
                                                          :tool_use          {:toolCallId chunk-id
                                                                              :toolName   (:name content_block)}
                                                          :thinking          {:id chunk-id}
                                                          ;; redactedData rides the reasoning-end (via @payload,
                                                          ;; kept off the start); redacted blocks stream no deltas.
                                                          :redacted_thinking {:id chunk-id
                                                                              :providerMetadata {:anthropic {:redactedData (:data content_block)}}}
                                                          nil)))
                                             (cond->
                                              (translated-chunk-type? block-type)
                                               (rf (case block-type
                                                     :text                          (merge {:type :text-start} @payload)
                                                     :tool_use                      (merge {:type :tool-input-start} @payload)
                                                     (:thinking :redacted_thinking) {:type :reasoning-start :id chunk-id}))))

             ;; content block delta
             (and (= t "content_block_delta")
                  (contains? #{"text_delta" "input_json_delta" "thinking_delta"} (:type delta)))
             (rf (case (:type delta)
                   "text_delta"       {:type  :text-delta
                                       :id    (:id @payload)
                                       :delta (:text delta)}
                   "thinking_delta"   {:type  :reasoning-delta
                                       :id    (:id @payload)
                                       :delta (:thinking delta)}
                   "input_json_delta" {:type           :tool-input-delta
                                       :toolCallId     (:toolCallId @payload)
                                       :inputTextDelta (:partial_json delta)}))

             ;; the signature rides the reasoning-end via @payload (needed to replay
             ;; the block within the turn); nothing is emitted to the client
             (and (= t "content_block_delta") (= "signature_delta" (:type delta)))
             (u/prog1
               (vswap! payload update-in [:providerMetadata :anthropic :signature] (fnil str "") (:signature delta)))

             ;; end of content block
             (= t "content_block_stop") (close!)
             ;; Claude reports usage at both message_start and message_delta,
             ;; but message_delta values are cumulative and include the earlier
             ;; counts.
             ;; https://platform.claude.com/docs/en/build-with-claude/streaming#event-types
             ;; https://platform.claude.com/docs/en/api/cli/messages#message_delta_usage
             (= t "message_delta")      (u/prog1
                                          (vreset! last-usage (:usage chunk))
                                          (vreset! stop-reason (:stop_reason delta)))
             ;; end of message
             (= t "message_stop")       identity
             ;; catch errors if any
             (= t "error")              (rf {:type      :error
                                             :errorText (:message error)}))))))))

;;; --------------------------------------------------- parity ---------------------------------------------------

(defn- same? [events]
  (metabot.tu/same-translation? (legacy-xf) (claude/claude->aisdk-chunks-xf) events))

(deftest ^:parallel recorded-fixtures-parity-test
  (doseq [f ["claude-text" "claude-tool-input" "claude-text-and-tool-input"]]
    (testing f
      (is (same? (metabot.tu/raw-fixture f (constantly nil)))))))

(def ^:private message-start
  {:type "message_start" :message {:id "msg_1" :model "claude-opus-5"
                                   :usage {:input_tokens 10 :cache_creation_input_tokens 2
                                           :cache_read_input_tokens 3 :output_tokens 1}}})

(deftest ^:parallel hand-written-parity-test
  (doseq [[desc events]
          {"signed thinking, signature in pieces"
           [message-start
            {:type "content_block_start" :index 0 :content_block {:type "thinking" :thinking ""}}
            {:type "content_block_delta" :index 0 :delta {:type "thinking_delta" :thinking "hmm"}}
            {:type "content_block_delta" :index 0 :delta {:type "signature_delta" :signature "ab"}}
            {:type "content_block_delta" :index 0 :delta {:type "signature_delta" :signature "cd"}}
            {:type "content_block_stop" :index 0}
            {:type "message_delta" :delta {:stop_reason "end_turn"} :usage {:output_tokens 7}}
            {:type "message_stop"}]
           "redacted thinking, with and without data"
           [message-start
            {:type "content_block_start" :index 0 :content_block {:type "redacted_thinking" :data "opaque"}}
            {:type "content_block_stop" :index 0}
            {:type "content_block_start" :index 1 :content_block {:type "redacted_thinking"}}
            {:type "content_block_stop" :index 1}]
           "interrupted: open block and message_start usage are flushed"
           [message-start
            {:type "content_block_start" :index 0 :content_block {:type "text" :text ""}}
            {:type "content_block_delta" :index 0 :delta {:type "text_delta" :text "par"}}]
           "message_delta without usage drops the usage"
           [message-start
            {:type "message_delta" :delta {:stop_reason "max_tokens"}}]
           "unknown stop reason, no index"
           [{:type "message_start" :message {:id "m"}}
            {:type "content_block_start" :content_block {:type "text"}}
            {:type "content_block_stop"}
            {:type "message_delta" :delta {:stop_reason "brand_new"} :usage {:output_tokens 1}}]
           "error"
           [message-start {:type "error" :error {:type "overloaded_error" :message "Overloaded"}}]}]
    (testing desc
      (is (same? events)))))

;;; A generator of plausible, well-bracketed Messages streams, possibly cut short.

(defn- gen-block [index]
  (gen/one-of
   [(gen/let [texts (gen/vector gen/string-alphanumeric 0 4)]
      (concat [{:type "content_block_start" :index index :content_block {:type "text" :text ""}}]
              (for [t texts] {:type "content_block_delta" :index index :delta {:type "text_delta" :text t}})
              [{:type "content_block_stop" :index index}]))
    (gen/let [n     gen/nat
              jsons (gen/vector gen/string-alphanumeric 0 4)]
      (concat [{:type "content_block_start" :index index
                :content_block {:type "tool_use" :id (str "toolu_" n) :name "get-time" :input {}}}]
              (for [j jsons] {:type "content_block_delta" :index index :delta {:type "input_json_delta" :partial_json j}})
              [{:type "content_block_stop" :index index}]))
    (gen/let [thoughts (gen/vector gen/string-alphanumeric 0 3)
              sigs     (gen/vector gen/string-alphanumeric 0 2)]
      (concat [{:type "content_block_start" :index index :content_block {:type "thinking" :thinking ""}}]
              (for [t thoughts] {:type "content_block_delta" :index index :delta {:type "thinking_delta" :thinking t}})
              (for [s sigs] {:type "content_block_delta" :index index :delta {:type "signature_delta" :signature s}})
              [{:type "content_block_stop" :index index}]))
    (gen/let [data (gen/one-of [(gen/return nil) gen/string-alphanumeric])]
      [{:type "content_block_start" :index index :content_block (cond-> {:type "redacted_thinking"} data (assoc :data data))}
       {:type "content_block_stop" :index index}])]))

(def ^:private gen-stream
  (gen/let [block-count (gen/choose 0 4)
            blocks      (apply gen/tuple (map gen-block (range block-count)))
            start-usage (gen/one-of [(gen/return nil) (gen/fmap (fn [n] {:input_tokens n}) gen/nat)])
            ending      (gen/elements [:complete :no-usage :error])
            reason      (gen/elements ["end_turn" "tool_use" "max_tokens" "refusal" "pause_turn" "brand_new" nil])
            cut         (gen/choose 0 100)]
    (let [events (vec (concat [{:type "message_start" :message (cond-> {:id "msg" :model "m"}
                                                                  start-usage (assoc :usage start-usage))}
                               {:type "ping"}]
                              (apply concat blocks)
                              (case ending
                                :complete [{:type "message_delta" :delta {:stop_reason reason} :usage {:output_tokens 5}}
                                           {:type "message_stop"}]
                                :no-usage [{:type "message_delta" :delta {:stop_reason reason}}]
                                :error    [{:type "error" :error {:message "Overloaded"}}])))]
      ;; a stream cut short anywhere: the interrupted-stream flush is part of the contract
      (subvec events 0 (quot (* cut (count events)) 100)))))

(defspec ^:parallel generated-streams-parity-test 300
  (prop/for-all [events gen-stream]
    (same? events)))

;;; ------------------------------------------ deliberate differences ------------------------------------------

(deftest ^:parallel unsupported-block-deltas-are-dropped-test
  (testing "a block we do not translate swallows its own deltas rather than leaking id-less chunks"
    (let [events [message-start
                  {:type "content_block_start" :index 0
                   :content_block {:type "server_tool_use" :id "srvtoolu_1" :name "web_search"}}
                  {:type "content_block_delta" :index 0 :delta {:type "input_json_delta" :partial_json "{}"}}
                  {:type "content_block_stop" :index 0}]]
      (is (= [{:type :tool-input-delta :toolCallId nil :inputTextDelta "{}"}]
             (filterv #(= :tool-input-delta (:type %)) (into [] (legacy-xf) events))))
      (is (= [:start :usage]
             (mapv :type (into [] (claude/claude->aisdk-chunks-xf) events)))))))

(deftest ^:parallel stray-block-start-closes-the-open-block-test
  (testing "a block started while another is open closes it rather than dropping its end"
    (let [events [{:type "content_block_start" :index 0 :content_block {:type "text"}}
                  {:type "content_block_start" :index 1 :content_block {:type "tool_use" :id "t" :name "f"}}
                  {:type "content_block_stop" :index 1}]]
      (is (= [:text-start :tool-input-start :tool-input-available]
             (mapv :type (into [] (legacy-xf) events))))
      (is (= [:text-start :text-end :tool-input-start :tool-input-available]
             (mapv :type (into [] (claude/claude->aisdk-chunks-xf) events)))))))
