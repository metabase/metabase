(ns metabase.metabot.self.openai.chat-completions-java-parity-test
  "Experiment: the Java `ChatCompletionsTranslator` against the Clojure translator it replaced, kept verbatim below."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.zai :as zai]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ the replaced Clojure code ------------------------------------------

(def ^:private stop-reasons chat-completions/stop-reasons)

(defn- usage->aisdk-usage
  "Convert a Chat Completions `usage` block into the AISDK `:usage` shape.

  `prompt_tokens` is the total input count, and the cache buckets are a subset
  breakdown of it under `prompt_tokens_details`:

      cached_tokens      — input tokens read from the provider cache
      cache_write_tokens — input tokens written to the provider cache;
                           undocumented but reported by both OpenRouter
                           (Anthropic models) and newer OpenAI models.
                           Providers without it (e.g. Z.AI) omit it."
  [u]
  (let [details (:prompt_tokens_details u)]
    {:promptTokens        (:prompt_tokens u 0)
     :completionTokens    (:completion_tokens u 0)
     :cacheCreationTokens (or (:cache_write_tokens details) 0)
     :cacheReadTokens     (or (:cached_tokens details) 0)}))


(defn- delta-reasoning
  "Reasoning text carried by a Chat Completions delta or message, under either spelling. vLLM 0.26
  emits `reasoning` and treats `reasoning_content` as its deprecated name; older builds, Z.AI, and
  other OpenAI-compatible servers still emit the latter, and a self-hosted server's version is the
  customer's choice."
  [m]
  (or (not-empty (:reasoning m))
      (not-empty (:reasoning_content m))))

(defn- legacy-xf
  "Translates Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  Chat Completions streaming format:
    {\"id\":\"chatcmpl-xxx\",
     \"object\":\"chat.completion.chunk\",
     \"model\":\"...\",
     \"choices\":[{\"index\":0,
                   \"delta\":{\"role\":\"assistant\",\"content\":\"Hello\"},
                   \"finish_reason\":null}],
     \"usage\":{...}}

  Emits the same internal chunk types as claude.clj and openai.clj:
    :start, :text-start, :text-delta, :text-end,
    :tool-input-start, :tool-input-delta, :tool-input-available,
    :usage

  Chat Completions has no explicit start/stop events per content block like
  Claude or OpenAI Responses do — we infer transitions from the delta shape.

  Parallel tool calls are tracked by tool-call `id`, not by `index`, which is
  never read: a tool-call delta whose `id` differs from the open one closes the
  previous block and opens a new one. That relies on providers sending `id` only
  on a tool call's opening chunk — one that repeated it on continuation chunks
  would lose their arguments, since neither the start branch (needs `:name`) nor
  the argument-delta branch (needs no `:id`) would fire.

  Takes the dialect's `finish_reason` table, defaulting to OpenAI's [[stop-reasons]].

  `opts` may carry `:forward-reasoning?`, which additionally translates reasoning
  deltas (see [[delta-reasoning]]) into :reasoning-start / :reasoning-delta /
  :reasoning-end. Opt-in, because whether a provider's reasoning renders at all is
  a separate question (see `metabot.settings/llm-metabot-supports-reasoning?`) and
  chunks nothing consumes only add stream volume."
  ([]
   (legacy-xf stop-reasons nil))
  ([stop-reasons]
   (legacy-xf stop-reasons nil))
  ([stop-reasons {:keys [forward-reasoning?]}]
   (fn [rf]
     (let [current-type (volatile! nil) ;; :text | :reasoning | :function_call | nil
           current-id   (volatile! nil) ;; active chunk id (text-id, reasoning-id, or tool call_id)
           message-id   (volatile! nil)
           model-name   (volatile! nil)
           payload      (volatile! {})  ;; carried across start/delta/end, same as openai.clj
           stop-reason  (volatile! nil)
           close!       (fn [result]
                          (u/prog1 (rf result (merge {:type (case @current-type
                                                              :text          :text-end
                                                              :reasoning     :reasoning-end
                                                              :function_call :tool-input-available)}
                                                     @payload))
                            (vreset! current-type nil)
                            (vreset! current-id nil)
                            (vreset! payload {})))]
       (fn
         ([result]
          (cond-> result
            @current-type (close!)
            true          (rf)))

         ([result {:keys [id model choices usage] :as _chunk}]
          (let [choice        (first choices)
                delta         (:delta choice)
                finish-reason (:finish_reason choice)
                tool-call     (first (:tool_calls delta))
                reasoning-md  (:reasoning_metadata delta)
                ;; Determine what kind of content this chunk carries.
                ;; Empty-string content (common between tool calls) is ignored
                ;; to avoid spurious text blocks that would close open tools.
                chunk-type    (cond
                                (not-empty (:content delta))  :text
                                ;; tool_calls outrank reasoning: a delta carrying both would
                                ;; otherwise classify as :reasoning, and the tool call's opening
                                ;; chunk — the only one carrying its id and name — would be
                                ;; lost, breaking the tool loop. Ranked this way, such a delta
                                ;; loses its reasoning fragment instead: display text,
                                ;; recoverable. No probed provider combines the two in one
                                ;; delta today.
                                (some? tool-call)             :function_call
                                (and forward-reasoning?
                                     (delta-reasoning delta)) :reasoning
                                :else                         nil)
                ;; For new tool calls, the id comes from the chunk; for deltas
                ;; on the same tool, we keep current-id.
                chunk-id      (or (:id tool-call) @current-id (core/mkid))]
            (cond-> result
              ;; Emit :start on first chunk
              (and id (not @message-id))                       (-> (rf {:type :start :messageId id})
                                                                   (u/prog1
                                                                     (vreset! message-id id)
                                                                     (vreset! model-name model)))
              ;; Close previous block when type changes, or when a new tool
              ;; call arrives (different id = different tool in parallel)
              (and @current-type
                   (or (and chunk-type
                            (not= chunk-type @current-type))
                       (and (= chunk-type :function_call)
                            (not= chunk-id @current-id))))     (close!)
              ;; Start a new text block
              (and (= chunk-type :text)
                   (not= @current-type :text))                 (-> (u/prog1
                                                                     (let [tid (core/mkid)]
                                                                       (vreset! current-type :text)
                                                                       (vreset! current-id tid)
                                                                       (vreset! payload {:id tid})))
                                                                   (rf (merge {:type :text-start} @payload)))
              ;; Text delta
              (and (= chunk-type :text)
                   (some? (:content delta)))                   (rf {:type  :text-delta
                                                                    :id    @current-id
                                                                    :delta (:content delta)})
              ;; Start a new reasoning block
              (and (= chunk-type :reasoning)
                   (not= @current-type :reasoning))            (-> (u/prog1
                                                                     (let [rid (core/mkid)]
                                                                       (vreset! current-type :reasoning)
                                                                       (vreset! current-id rid)
                                                                       (vreset! payload {:id rid})))
                                                                   (rf (merge {:type :reasoning-start} @payload)))
              ;; Reasoning delta
              (= chunk-type :reasoning)                        (rf {:type  :reasoning-delta
                                                                    :id    @current-id
                                                                    :delta (delta-reasoning delta)})
              ;; A delta may carry ready-namespaced provider metadata for the
              ;; open reasoning block, ridden out on its end chunk the way
              ;; openai.clj rides out encrypted_content. :reasoning_metadata is
              ;; not a wire key — no Chat Completions server emits it; only a
              ;; dialect's own pre-transform mints it (today Mistral's
              ;; flatten-content-chunks, carrying a think-chunk signature) — so
              ;; this clause never fires for any other dialect. It is carried
              ;; opaquely: the minting side owns the namespace inside it.
              (and reasoning-md
                   (= @current-type :reasoning))               (u/prog1
                                                                 (vswap! payload assoc
                                                                         :providerMetadata reasoning-md))
              ;; Start a new tool call block
              (and (= chunk-type :function_call)
                   (:id tool-call)
                   (:name (:function tool-call)))              (-> (u/prog1
                                                                     (vreset! current-type :function_call)
                                                                     (vreset! current-id (:id tool-call))
                                                                     (vreset! payload {:toolCallId (:id tool-call)
                                                                                       :toolName   (:name (:function tool-call))}))
                                                                   (rf (merge {:type :tool-input-start} @payload))
                                                                   ;; Emit initial arguments if present
                                                                   (cond-> (not (str/blank? (:arguments (:function tool-call))))
                                                                     (rf {:type           :tool-input-delta
                                                                          :toolCallId     (:id tool-call)
                                                                          :inputTextDelta (:arguments (:function tool-call))})))
              ;; Tool argument delta (continuation of existing tool call)
              (and (= chunk-type :function_call)
                   (not (:id tool-call))
                   (some? (:arguments (:function tool-call)))) (rf {:type           :tool-input-delta
                                                                    :toolCallId     (:toolCallId @payload)
                                                                    :inputTextDelta (:arguments (:function tool-call))})
              ;; Finish reason — close whatever is open
              (some? finish-reason)                            (-> (u/prog1
                                                                     (vreset! stop-reason finish-reason))
                                                                   (cond->
                                                                    @current-type (close!)))
              ;; Usage (often on a separate final chunk with empty choices)
              (some? usage)                                    (rf (cond-> {:type  :usage
                                                                            :usage (usage->aisdk-usage usage)
                                                                            :id    @message-id
                                                                            :model @model-name}
                                                                     @stop-reason
                                                                     (assoc :finish-reason     (core/stop-reason->finish-reason stop-reasons @stop-reason)
                                                                            :raw-finish-reason @stop-reason)))))))))))


;;; --------------------------------------------------- parity ---------------------------------------------------

(def ^:private dialects
  "Stop-reason tables and reasoning flags as the adapters pass them."
  {:openai     [chat-completions/stop-reasons nil]
   :vllm       [chat-completions/stop-reasons {:forward-reasoning? true}]
   :mistral    [@#'mistral/stop-reasons {:forward-reasoning? true}]
   :openrouter [@#'openrouter/stop-reasons {:forward-reasoning? true}]
   :zai        [@#'zai/stop-reasons {:forward-reasoning? true}]})

(defn- same? [dialect events]
  (let [[table opts] (dialects dialect)]
    (metabot.tu/same-translation? (legacy-xf table opts)
                                  (chat-completions/chat-completions->aisdk-chunks-xf table opts)
                                  events)))

(deftest ^:parallel recorded-fixtures-parity-test
  (doseq [f ["openrouter-text" "openrouter-tool-calls" "openrouter-parallel-tool-calls" "openrouter-text-and-tool-calls"]
          dialect [:openai :openrouter]]
    (testing [f dialect]
      (is (same? dialect (metabot.tu/raw-fixture f (constantly nil)))))))

(defn- delta [d & {:as more}]
  (merge {:id "chatcmpl-1" :model "m" :choices [{:index 0 :delta d}]} more))

(deftest ^:parallel hand-written-parity-test
  (doseq [[desc events]
          {"text, both reasoning spellings, and a signature ridden out on the reasoning-end"
           [(delta {:role "assistant" :content ""})
            (delta {:reasoning "think "})
            (delta {:reasoning_content "more"})
            (delta {:reasoning_metadata {:mistral {:signature "sig"}}})
            (delta {:content "hi"})
            {:id "chatcmpl-1" :choices [{:index 0 :delta {} :finish_reason "stop"}]}
            {:id "chatcmpl-1" :choices [] :usage {:prompt_tokens 5 :completion_tokens 2
                                                  :prompt_tokens_details {:cached_tokens 1}}}]
           "parallel tool calls, arguments on the opening delta"
           [(delta {:tool_calls [{:index 0 :id "call_a" :function {:name "f" :arguments "{\"a\""}}]})
            (delta {:tool_calls [{:index 0 :function {:arguments ":1}"}}]})
            (delta {:tool_calls [{:index 1 :id "call_b" :function {:name "g" :arguments ""}}]})
            (delta {:tool_calls [{:index 1 :function {:arguments ""}}]})
            {:choices [{:delta {} :finish_reason "tool_calls"}] :usage {:prompt_tokens 1}}]
           "usage before any finish, unknown finish reason, stream cut mid-text"
           [(delta {:content "a"} :usage {:completion_tokens 1})
            (delta {:content "b"} :choices [{:delta {:content "b"} :finish_reason "model_length"}])
            (delta {:content "c"})]}
          dialect (keys dialects)]
    (testing [desc dialect]
      (is (same? dialect events)))))

(deftest ^:parallel mistral-pre-transform-parity-test
  (testing "Mistral's Clojure pre-transform feeds the Java translator exactly as it fed the Clojure one"
    (let [[table opts] (dialects :mistral)
          events [(delta {:content [{:type "thinking" :thinking [{:type "text" :text "hmm"}]}]})
                  (delta {:content [{:type "thinking" :thinking [{:type "text" :text "."}] :signature "s1"}
                                    {:type "text" :text "Answer"}]})
                  (delta {:content " done"} :choices [{:delta {:content " done"} :finish_reason "stop"}])]]
      (is (metabot.tu/same-translation? (comp (mapcat #'mistral/flatten-content-chunks) (legacy-xf table opts))
                                        (mistral/mistral->aisdk-chunks-xf)
                                        events)))))

;;; A generator of plausible Chat Completions streams: runs of text, reasoning and (parallel) tool calls, then a
;;; finish and usage in either order, possibly cut short.

(defn- gen-segment
  "Segment `i` of a stream. Tool call ids are unique per stream, as the dialect requires (see
  [[repeated-tool-call-id-test]] for what happens when they are not)."
  [i]
  (gen/one-of
   [(gen/fmap (fn [texts] (map #(delta {:content %}) texts)) (gen/vector gen/string-alphanumeric 1 4))
    (gen/let [texts (gen/vector (gen/not-empty gen/string-alphanumeric) 1 3)
              k     (gen/elements [:reasoning :reasoning_content])
              sig   (gen/one-of [(gen/return nil) gen/string-alphanumeric])]
      (cond-> (mapv #(delta {k %}) texts)
        sig (conj (delta {:reasoning_metadata {:mistral {:signature sig}}}))))
    (gen/let [first (gen/elements [nil "" "{"])
              more  (gen/vector (gen/one-of [(gen/return nil) gen/string-alphanumeric]) 0 3)]
      (cons (delta {:tool_calls [{:index 0 :id (str "call_" i) :type "function"
                                  :function (cond-> {:name "tool"} first (assoc :arguments first))}]})
            (for [a more] (delta {:tool_calls [{:index 0 :function (cond-> {} a (assoc :arguments a))}]}))))
    (gen/return [(delta {:role "assistant" :content ""})])]))

(def ^:private gen-stream
  (gen/let [n        (gen/choose 0 5)
            segments (apply gen/tuple (map gen-segment (range n)))
            reason   (gen/elements ["stop" "length" "tool_calls" "content_filter" "model_length" "error" "sensitive" "network_error" "brand_new"])
            ending   (gen/elements [:finish-then-usage :usage-with-finish :finish-only :usage-only])
            cut      (gen/choose 0 100)]
    (let [finish {:id "chatcmpl-1" :choices [{:index 0 :delta {} :finish_reason reason}]}
          usage  {:prompt_tokens 3 :completion_tokens 4 :prompt_tokens_details {:cached_tokens 1 :cache_write_tokens 1}}
          events (vec (concat (apply concat segments)
                              (case ending
                                :finish-then-usage [finish {:id "chatcmpl-1" :choices [] :usage usage}]
                                :usage-with-finish [(assoc finish :usage usage)]
                                :finish-only       [finish]
                                :usage-only        [{:id "chatcmpl-1" :choices [] :usage usage}])))]
      (subvec events 0 (quot (* cut (count events)) 100)))))

(defspec ^:parallel generated-streams-parity-test 300
  (prop/for-all [events  gen-stream
                 dialect (gen/elements (keys dialects))]
    (same? dialect events)))

;;; ------------------------------------------ deliberate differences ------------------------------------------

(deftest ^:parallel repeated-tool-call-id-test
  (testing "a provider repeating a tool call's id restarts it cleanly instead of opening it twice without an end"
    (let [events [(delta {:tool_calls [{:id "call_a" :function {:name "f" :arguments "{"}}]})
                  (delta {:tool_calls [{:id "call_a" :function {:name "f" :arguments "}"}}]})]]
      (is (= [:start :tool-input-start :tool-input-delta :tool-input-start :tool-input-delta :tool-input-available]
             (mapv :type (into [] (legacy-xf) events))))
      (is (= [:start :tool-input-start :tool-input-delta :tool-input-available :tool-input-start :tool-input-delta
              :tool-input-available]
             (mapv :type (into [] (chat-completions/chat-completions->aisdk-chunks-xf) events)))))))

(deftest ^:parallel orphan-tool-arguments-test
  (testing "arguments with no tool call open to receive them are dropped rather than sent with no tool call id"
    (let [events [(delta {:tool_calls [{:id "call_a" :function {:arguments "{"}}]})
                  (delta {:tool_calls [{:function {:arguments "}"}}]})]]
      (is (some #(and (= :tool-input-delta (:type %)) (nil? (:toolCallId %)))
                (into [] (legacy-xf) events)))
      (is (= [:start] (mapv :type (into [] (chat-completions/chat-completions->aisdk-chunks-xf) events)))))))

(deftest ^:parallel unknown-finish-reason-in-a-table-fails-fast-test
  (testing "a dialect table naming a reason AI SDK does not have is refused when the translator is built"
    (is (thrown-with-msg? IllegalArgumentException #"not an AI SDK finish reason: tool_calls"
                          (chat-completions/chat-completions->aisdk-chunks-xf {"tool_calls" "tool_calls"})))))
