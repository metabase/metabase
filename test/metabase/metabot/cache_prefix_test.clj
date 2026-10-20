(ns metabase.metabot.cache-prefix-test
  "A provider reads the conversation history from its prompt cache only when a request starts with the exact
  bytes of an earlier request. Inside a turn the agent loop keeps that true. These tests check it across the edge
  between two turns: the first request of a turn must start with the last request of the turn before it, in the
  wire format of each adapter.

  For now they cover the `<context>` block sent before each user message. Other parts of a turn — the SQL dialect
  preload, thinking, text streamed in deltas, parallel tool calls, failed tool calls — are not yet replayed as they
  were sent, so no conversation here has them."
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.llm.test-util :as llm.tu]
   [metabase.metabot.conversation-title :as conversation-title]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.deepseek :as deepseek]
   [metabase.metabot.self.google.stream-generate-content :as gemini]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.self.xai :as xai]
   [metabase.metabot.self.zai :as zai]
   [metabase.metabot.test-util :as mut]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ The conversation ------------------------------------------------

(defn- run-turns!
  "Send `turns` in one conversation through the agent-streaming endpoint. A turn is `{:message :context :response}`,
  where `:response` is what the provider streams back to the turn's one LLM call. Each message names the previous
  answer as its parent, as the frontend does. Returns the request options the adapter got on each LLM call, in order."
  [turns]
  (let [conversation-id (str (random-uuid))
        pending         (atom (map :response turns))
        requests        (atom [])]
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider "anthropic/claude-opus-5-5"]
      (mt/with-dynamic-fn-redefs [claude/claude                    (fn [opts]
                                                                     (swap! requests conj opts)
                                                                     (ffirst (swap-vals! pending rest)))
                                  conversation-title/ensure-title! (constantly nil)]
        (mt/with-model-cleanup [:model/MetabotMessage
                                [:model/MetabotConversation :created_at]]
          (reduce (fn [parent-id {:keys [message context]}]
                    (let [answer-id (str (random-uuid))]
                      (mt/user-http-request :crowberto :post 202 "metabot/agent-streaming"
                                            (cond-> {:message              message
                                                     :context              context
                                                     :conversation_id      conversation-id
                                                     :assistant_message_id answer-id
                                                     :state                {}}
                                              parent-id (assoc :parent_message_id parent-id)))
                      answer-id))
                  nil
                  turns))))
    @requests))

(defn- answer [id text]
  (mut/mock-llm-response [{:type :start :id id}
                          {:type :text :id id :text text}]))

(def ^:private two-turns
  "Two turns five minutes apart, each answered by one LLM call. The `<context>` block of each user message holds the
  time of its own turn, so the two blocks differ."
  [{:message  "How many orders do we have?"
    :context  {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
    :response (answer "msg-1" "There are 18,760 orders.")}
   {:message  "And last month?"
    :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :response (answer "msg-2" "Last month there were 1,412.")}])

;;; ------------------------------------------------ Prefix comparison -----------------------------------------------

(defn- strip-cache-control
  "`body` without its `cache_control` markers. The marker at the end of the conversation moves forward on every
  request, so it always differs, and it does not invalidate the cache."
  [body]
  (walk/postwalk #(cond-> % (map? %) (dissoc :cache_control "cache_control")) body))

(defn- abbreviate [x]
  (let [s (pr-str x)]
    (cond-> s (< 200 (count s)) (-> (subs 0 200) (str "…")))))

(defn- string-around
  "The part of `s` around index `i`."
  [^String s i]
  (let [start (max 0 (- i 60))]
    (str (when (pos? start) "…") (subs s start (min (count s) (+ i 100))) "…")))

(defn- divergence
  "The innermost path where `a` and `b` differ, with both values there, or nil when they are equal."
  [path a b]
  (cond
    (= a b)
    nil

    (and (map? a) (map? b))
    (some (fn [k] (divergence (conj path k) (get a k ::absent) (get b k ::absent)))
          (sort-by str (distinct (concat (keys a) (keys b)))))

    (and (sequential? a) (sequential? b))
    (or (some (fn [i] (divergence (conj path i) (nth a i) (nth b i)))
              (range (min (count a) (count b))))
        {:path path :turn-n (str (count a) " items") :next-turn (str (count b) " items")})

    (and (string? a) (string? b))
    (let [i (count (take-while true? (map = a b)))]
      {:path path :at-char i :turn-n (string-around a i) :next-turn (string-around b i)})

    :else
    {:path path :turn-n (abbreviate a) :next-turn (abbreviate b)}))

(defn- prefix-break
  "Where the request body `turn-n` stops being a prefix of the request body `next-turn`, or nil when it is one.
  `history-key` holds the conversation, which `next-turn` may extend. Every other key must be equal."
  [history-key turn-n next-turn]
  (let [turn-n    (strip-cache-control turn-n)
        next-turn (strip-cache-control next-turn)
        history   (vec (get turn-n history-key))]
    (or (divergence [] (dissoc turn-n history-key) (dissoc next-turn history-key))
        (divergence [history-key] history (vec (take (count history) (get next-turn history-key)))))))

(def ^:private adapters
  "One entry per request-body builder, with the key that holds the conversation history. The builders other than
  Claude's render with their own default model. Bedrock, Azure and Vertex reuse the Claude and OpenAI builders.
  Ollama is not here: its builder can ask the Ollama server about the model."
  (let [own-model #(comp % (fn [opts] (dissoc opts :model)))]
    [{:adapter "anthropic"  :history :messages :render claude/claude-request-body}
     {:adapter "deepseek"   :history :messages :render (own-model deepseek/deepseek-request-body)}
     {:adapter "openai"     :history :input    :render (own-model openai/openai-request-body)}
     {:adapter "openrouter" :history :messages :render (own-model openrouter/openrouter-request-body)}
     {:adapter "mistral"    :history :messages :render (own-model mistral/mistral-request-body)}
     {:adapter "moonshot"   :history :messages :render (own-model moonshot/moonshot-request-body)}
     {:adapter "xai"        :history :messages :render (own-model xai/xai-request-body)}
     {:adapter "zai"        :history :messages :render (own-model zai/zai-request-body)}
     {:adapter "vllm"       :history :messages :render (own-model vllm/vllm-request-body)}
     {:adapter "gemini"     :history :contents :render #(gemini/request-body (assoc % :model "google/gemini-3.8-flash"))}]))

;;; ----------------------------------------------------- Tests ------------------------------------------------------

(deftest user-message-replays-with-its-context-block-test
  (let [[turn-1 turn-2 :as requests] (run-turns! two-turns)
        user-messages                (fn [opts] (keep #(when (= :user (:role %)) (:content %)) (:input opts)))]
    (testing "each user message is sent with the <context> block of its own turn, in every later turn too"
      (is (= 2 (count requests)))
      (is (=? [#"(?s)<context>.*2026-10-20T10:00:00Z.*</context>\nHow many orders do we have\?"]
              (user-messages turn-1)))
      (is (=? [#"(?s)<context>.*2026-10-20T10:00:00Z.*</context>\nHow many orders do we have\?"
               #"(?s)<context>.*2026-10-20T10:05:00Z.*</context>\nAnd last month\?"]
              (user-messages turn-2))))
    (doseq [{:keys [adapter history render]} adapters]
      (testing (str adapter ": turn 2's first request starts with turn 1's last request, cache markers aside")
        (is (nil? (prefix-break history (render turn-1) (render turn-2))))))))
