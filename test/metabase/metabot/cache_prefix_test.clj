(ns metabase.metabot.cache-prefix-test
  "A provider reads the conversation history from its prompt cache only when a request starts with the exact
  bytes of an earlier request. Inside a turn the agent loop keeps that true. These tests check it across the edge
  between two turns: the first request of a turn must start with the last request of the turn before it, in the
  wire format of each adapter.

  For now they cover the `<context>` block sent before each user message, assistant text streamed in deltas, and
  tool calls that run in parallel. Other parts of a turn — the SQL dialect preload, thinking, failed tool calls — are
  not yet replayed as they were sent, so no conversation here has them."
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
  "Send `turns` in one conversation through the agent-streaming endpoint. A turn is `{:message :context :responses}`,
  where `:responses` holds what the provider streams back to each LLM call of the turn, in order. Each message names
  the previous answer as its parent, as the frontend does. Returns one vector per turn, with the request options the
  adapter got on each LLM call of that turn, in order."
  [turns]
  (let [conversation-id (str (random-uuid))
        pending         (atom (mapcat :responses turns))
        requests        (atom [])]
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider "anthropic/claude-opus-5-5"]
      (mt/with-dynamic-fn-redefs [claude/claude                    (fn [opts]
                                                                     (swap! requests conj opts)
                                                                     (ffirst (swap-vals! pending rest)))
                                  conversation-title/ensure-title! (constantly nil)]
        (mt/with-model-cleanup [:model/MetabotMessage
                                [:model/MetabotConversation :created_at]]
          (second
           (reduce (fn [[parent-id per-turn] {:keys [message context]}]
                     (let [answer-id (str (random-uuid))
                           sent      (count @requests)]
                       (mt/user-http-request :crowberto :post 202 "metabot/agent-streaming"
                                             (cond-> {:message              message
                                                      :context              context
                                                      :conversation_id      conversation-id
                                                      :assistant_message_id answer-id
                                                      :state                {}}
                                               parent-id (assoc :parent_message_id parent-id)))
                       [answer-id (conj per-turn (subvec @requests sent))]))
                   [nil []]
                   turns)))))))

(defn- answer [id text]
  (mut/mock-llm-response [{:type :start :id id}
                          {:type :text :id id :text text}]))

(def ^:private two-turns
  "Two turns five minutes apart, each answered by one LLM call. The `<context>` block of each user message holds the
  time of its own turn, so the two blocks differ."
  [{:message   "How many orders do we have?"
    :context   {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
    :responses [(answer "msg-1" "There are 18,760 orders.")]}
   {:message   "And last month?"
    :context   {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :responses [(answer "msg-2" "Last month there were 1,412.")]}])

(defn- load-skill-call
  "A response with text and then a call to `load_skill`, which always succeeds."
  [id text]
  (mut/mock-llm-response [{:type :start :id id}
                          {:type :text :id (str id "-text") :text text}
                          {:type :tool-input :id (str id "-call") :function "load_skill"
                           :arguments {:ids ["read-resource"]}}]))

(def ^:private streamed-text-turns
  "Two turns, the first with three LLM calls. [[mut/mock-llm-response]] streams text in deltas of five characters,
  so each text block of the first two calls arrives in parts. The text of the second call is only whitespace, as a
  model can send before a tool call."
  [{:message   "How many orders do we have?"
    :context   {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
    :responses [(load-skill-call "msg-1" "Let me read how to look up a table first.")
                (load-skill-call "msg-2" "\n\n")
                (answer "msg-3" "There are 18,760 orders.")]}
   {:message   "And last month?"
    :context   {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :responses [(answer "msg-4" "Last month there were 1,412.")]}])

(def ^:private parallel-call-turns
  "Two turns. The first LLM call of the first turn calls `load_skill` twice, and the two calls run in parallel."
  [{:message   "How many orders do we have?"
    :context   {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
    :responses [(mut/mock-llm-response [{:type :start :id "msg-1"}
                                        {:type :text :id "msg-1-text" :text "Let me read two skills first."}
                                        {:type :tool-input :id "msg-1-call-1" :function "load_skill"
                                         :arguments {:ids ["read-resource"]}}
                                        {:type :tool-input :id "msg-1-call-2" :function "load_skill"
                                         :arguments {:ids ["edit-chart"]}}])
                (answer "msg-2" "There are 18,760 orders.")]}
   {:message   "And last month?"
    :context   {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :responses [(answer "msg-3" "Last month there were 1,412.")]}])

(def ^:private many-parallel-call-turns
  "Two turns. The first LLM call of the first turn calls `load_skill` ten times, and the ten calls run in parallel. A
  plain map of more than 8 entries is a hash map, so a map of the calls by id gives them in an order of its own.

  The ten calls are the same, so their results are too. Gemini sends no call ids, so its requests are the same in
  any order of the results. Each other adapter sends the id of the call with each result."
  [{:message   "How many orders do we have?"
    :context   {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
    :responses [(mut/mock-llm-response (into [{:type :start :id "msg-1"}]
                                             (for [i (range 1 11)]
                                               {:type :tool-input :id (str "msg-1-call-" i) :function "load_skill"
                                                :arguments {:ids ["read-resource"]}})))
                (answer "msg-2" "There are 18,760 orders.")]}
   {:message   "And last month?"
    :context   {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :responses [(answer "msg-3" "Last month there were 1,412.")]}])

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

(defn- check-turn-edges
  "Check, for each adapter not in `except`, that the first request of each turn starts with the last request of the
  turn before it."
  ([turns] (check-turn-edges turns #{}))
  ([turns except]
   (doseq [{:keys [adapter history render]} (remove (comp except :adapter) adapters)
           [i [turn-n next-turn]]           (map-indexed vector (partition 2 1 turns))]
     (testing (format "%s: turn %d's first request starts with turn %d's last request, cache markers aside"
                      adapter (+ i 2) (inc i))
       (is (nil? (prefix-break history (render (last turn-n)) (render (first next-turn)))))))))

(deftest user-message-replays-with-its-context-block-test
  (let [[[turn-1 :as first-turn] [turn-2 :as second-turn] :as turns] (run-turns! two-turns)
        user-messages (fn [opts] (keep #(when (= :user (:role %)) (:content %)) (:input opts)))]
    (testing "each user message is sent with the <context> block of its own turn, in every later turn too"
      (is (= [1 1] [(count first-turn) (count second-turn)]))
      (is (=? [#"(?s)<context>.*2026-10-20T10:00:00Z.*</context>\nHow many orders do we have\?"]
              (user-messages turn-1)))
      (is (=? [#"(?s)<context>.*2026-10-20T10:00:00Z.*</context>\nHow many orders do we have\?"
               #"(?s)<context>.*2026-10-20T10:05:00Z.*</context>\nAnd last month\?"]
              (user-messages turn-2))))
    (check-turn-edges turns)))

(deftest streamed-text-replays-as-one-part-test
  (let [[first-turn :as turns] (run-turns! streamed-text-turns)
        texts                  (fn [opts] (keep #(when (= :text (:type %)) (:text %)) (:input opts)))]
    (testing "a text block streamed in deltas is sent as one part in the next call, and blank text is not sent"
      (is (= 3 (count first-turn)))
      (is (= ["Let me read how to look up a table first."]
             (texts (last first-turn)))))
    ;; Not DeepSeek. Its builder turns thinking off while the open turn holds a tool call with no signed reasoning,
    ;; as these mocked calls do, so turn 1 ends with thinking off and turn 2 starts with it on. DeepSeek's own calls
    ;; carry signed reasoning, but history does not replay reasoning, so the two turns would differ there instead.
    (check-turn-edges turns #{"deepseek"})))

(deftest parallel-tool-calls-replay-before-their-results-test
  (let [[first-turn :as turns] (run-turns! parallel-call-turns)
        kinds                  (fn [opts] (mapv #(or (:type %) (:role %)) (:input opts)))]
    (testing "the calls of a step are sent before their results, and in every later turn too"
      (is (= 2 (count first-turn)))
      (is (= [:user :text :tool-input :tool-input :tool-output :tool-output]
             (kinds (last first-turn)))))
    ;; Not DeepSeek, for the reason in [[streamed-text-replays-as-one-part-test]].
    (check-turn-edges turns #{"deepseek"})))

(deftest many-parallel-tool-calls-send-their-results-in-call-order-test
  (let [[first-turn :as turns] (run-turns! many-parallel-call-turns)
        ids                    (fn [kind opts] (keep #(when (= kind (:type %)) (:id %)) (:input opts)))]
    (testing "the results of ten parallel calls are sent in the order of the calls"
      (is (= 2 (count first-turn)))
      (is (= 10 (count (ids :tool-output (last first-turn)))))
      (is (= (ids :tool-input (last first-turn))
             (ids :tool-output (last first-turn)))))
    ;; Not DeepSeek, for the reason in [[streamed-text-replays-as-one-part-test]].
    (check-turn-edges turns #{"deepseek"})))
