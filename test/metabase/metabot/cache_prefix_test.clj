(ns metabase.metabot.cache-prefix-test
  "A provider reads the conversation history from its prompt cache only when a request starts with the exact
  bytes of an earlier request. Inside a turn the agent loop keeps that true. These tests check it across the edge
  between two turns: the first request of a turn must start with the last request of the turn before it, in the
  wire format of each adapter.

  They cover the `<context>` block sent before each user message. The history does not replay some other parts of a
  turn as they were sent: the SQL dialect preload, thinking, text streamed in deltas, parallel tool calls and failed
  tool calls. No conversation here has those parts."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.activity-feed.core :as activity-feed]
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
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ The conversation ------------------------------------------------

(defn- turn-request
  "The agent-streaming request body for `turn`, as the frontend sends it. `previous` holds the ids of the turn before
  it, or is nil for the first turn. A new turn names the previous answer as its parent. A turn with `:retry? true`
  asks for a new answer to the previous user message: it names that message, and no parent."
  [conversation-id {:keys [message context retry?]} previous answer-id user-id]
  (cond-> {:message              message
           :context              context
           :conversation_id      conversation-id
           :user_message_id      user-id
           :assistant_message_id answer-id
           :state                {}}
    retry?                      (assoc :retry_message_id user-id)
    (and previous (not retry?)) (assoc :parent_message_id (:answer-id previous))))

(defn- run-turns!
  "Send `turns` in one conversation through the agent-streaming endpoint. A turn is `{:message :context :response}`,
  where `:response` is what the provider streams back to the turn's one LLM call. `:crowberto` sends every turn. A
  turn can also hold `:retry? true` (see [[turn-request]]). Returns the request options the adapter got on each LLM
  call, in order."
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
          (reduce (fn [previous {:keys [retry?] :as turn}]
                    (let [answer-id (str (random-uuid))
                          ;; a retry keeps the id of the user message it retries
                          user-id   (if retry? (:user-id previous) (str (random-uuid)))]
                      (mt/user-http-request :crowberto :post 202 "metabot/agent-streaming"
                                            (turn-request conversation-id turn previous answer-id user-id))
                      {:answer-id answer-id :user-id user-id}))
                  nil
                  turns))))
    @requests))

(defn- answer [id text]
  (mut/mock-llm-response [{:type :start :id id}
                          {:type :text :id id :text text}]))

(def ^:private two-turns
  "Two turns five minutes apart, each answered by one LLM call. The first turn's `<context>` block holds the time of
  that turn. The second turn sends only its own time and what the user is viewing. The user views nothing, so its
  block holds the time and says that the user views no item."
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

(defn- check-turn-edge
  "Check, for each adapter, that the first request of a turn, `next-request`, starts with the last request of the
  turn before it, `request`."
  [request next-request]
  (doseq [{:keys [adapter history render]} adapters]
    (testing (str adapter ": turn 2's first request starts with turn 1's last request, cache markers aside")
      (is (nil? (prefix-break history (render request) (render next-request)))))))

(defn- user-messages
  "The content of each user message in the request options `opts`."
  [opts]
  (keep #(when (= :user (:role %)) (:content %)) (:input opts)))

(deftest user-message-replays-with-its-context-block-test
  (let [[turn-1 turn-2 :as requests] (run-turns! two-turns)]
    (testing "the first user message is sent with its <context> block, in every later turn too"
      (is (= 2 (count requests)))
      (is (=? [#"(?s)<context>.*2026-10-20T10:00:00Z.*</context>\nHow many orders do we have\?"]
              (user-messages turn-1)))
      (is (=? [#"(?s)<context>.*2026-10-20T10:00:00Z.*</context>\nHow many orders do we have\?"
               #"(?s)^<context>\n\nCurrent date: 2026-10-20T10:05:00Z\n.*</context>\nAnd last month\?$"]
              (user-messages turn-2))))
    (testing "the second turn, where the user views nothing, says so"
      (is (re-find #"\n\nThe user is not looking at any item now\.\n\n</context>\nAnd last month\?$"
                   (second (user-messages turn-2)))))
    (check-turn-edge turn-1 turn-2)))

(deftest later-turn-sends-only-the-viewing-context-test
  (mt/with-temp [:model/Card      {card-id :id}   {:name "Question A" :dataset_query (mt/mbql-query venues)}
                 :model/Dashboard {dash-id :id}   {:name "Dashboard B"}
                 :model/Card      {viewed-id :id} {:name "Question C"}]
    (mt/with-model-cleanup [:model/RecentViews]
      ;; The server reads the recent views from the app DB, not from the request. Record one, so that the full block
      ;; holds a recent view and the check on the later turn's block can fail.
      (activity-feed/update-users-recent-views! (mt/user->id :crowberto) :model/Card viewed-id :view)
      (let [turns                   [{:message  "How many venues are there?"
                                      :context  {:current_time_with_timezone "2026-10-20T10:00:00+00:00"
                                                 :user_is_viewing            [{:type "question" :id card-id}]}
                                      :response (answer "msg-1" "There are 100 venues.")}
                                     {:message  "What is on this dashboard?"
                                      :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"
                                                 :user_is_viewing            [{:type "dashboard" :id dash-id}]}
                                      :response (answer "msg-2" "It is empty.")}]
            [turn-1 turn-2]         (run-turns! turns)
            [first-message message] (user-messages turn-2)]
        (testing "the first turn's message replays with the full block: the time, the user, what they viewed, the recents"
          (is (re-find #"(?s)^<context>\n\nCurrent date: 2026-10-20T10:00:00Z\n.*information about the user.*Question A"
                       first-message))
          (is (re-find #"(?s)recently viewed:.*Question C.*</context>" first-message)))
        (testing "a later turn's block holds the time of that turn and what the user is viewing now"
          (is (re-find #"^<context>\n\nCurrent date: 2026-10-20T10:05:00Z\n" message))
          (is (re-find #"(?s)The user is currently looking at the details of a dashboard:.*Dashboard B" message))
          (is (re-find #"</context>\nWhat is on this dashboard\?$" message))
          (is (not (re-find #"information about the user" message)))
          (is (not (re-find #"recently viewed" message))))
        (check-turn-edge turn-1 turn-2)))))

(deftest later-turn-that-views-nothing-says-so-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Question A"}]
    (let [turns                   [{:message  "How many venues are there?"
                                    :context  {:current_time_with_timezone "2026-10-20T10:00:00+00:00"
                                               :user_is_viewing            [{:type "question" :id card-id}]}
                                    :response (answer "msg-1" "There are 100 venues.")}
                                   {:message  "What does this show?"
                                    :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"
                                               :user_is_viewing            []}
                                    :response (answer "msg-2" "You are not looking at any item.")}
                                   {:message  "And now?"
                                    :context  {:current_time_with_timezone "2026-10-20T10:10:00+00:00"}
                                    :response (answer "msg-3" "Still no item.")}]
          [turn-1 turn-2 turn-3]  (run-turns! turns)
          [first-message message] (user-messages turn-2)]
      (testing "the first turn's message replays with what the user viewed then"
        (is (re-find #"(?s)^<context>.*Question A" first-message)))
      (testing "a later turn where the user views nothing says so, after the earlier turn's viewing block"
        (is (re-find #"^<context>\n\nCurrent date: 2026-10-20T10:05:00Z\n" message))
        (is (re-find #"\n\nThe user is not looking at any item now\.\n\n</context>\nWhat does this show\?$" message))
        (is (not (re-find #"Question A" message))))
      (testing "the next turn replays that block with the same bytes"
        (is (= message (second (user-messages turn-3)))))
      (check-turn-edge turn-1 turn-2)
      (check-turn-edge turn-2 turn-3))))

(deftest later-turn-sends-the-full-block-when-the-first-had-no-user-info-test
  (let [lookups (atom 0)
        orig    (mt/original-fn #'entity-details/get-current-user)]
    (mt/with-dynamic-fn-redefs [entity-details/get-current-user (fn [args]
                                                                   (when (= 1 (swap! lookups inc))
                                                                     (throw (ex-info "app DB unavailable" {})))
                                                                   (orig args))]
      (let [[turn-1 turn-2]         (run-turns! two-turns)
            [first-message message] (user-messages turn-2)]
        (testing "the first turn's block has no user information, because the lookup failed"
          (is (re-find #"(?s)^<context>\n\nCurrent date: 2026-10-20T10:00:00Z\n" first-message))
          (is (not (re-find #"information about the user" first-message))))
        (testing "the next turn sends the full block again, so the model gets the user information"
          (is (re-find #"(?s)^<context>\n\nCurrent date: 2026-10-20T10:05:00Z\n.*information about the user" message))
          (is (re-find #"</context>\nAnd last month\?$" message)))
        (check-turn-edge turn-1 turn-2)))))

(deftest turn-after-a-failed-or-retried-first-turn-sends-the-full-context-test
  (let [first-turn {:message  "How many orders do we have?"
                    :context  {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
                    :response (answer "msg-1" "There are 18,760 orders.")}
        next-turn  {:message  "How many orders do we have?"
                    :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
                    :response (answer "msg-2" "There are 18,760 orders.")}
        sent-full? (fn [request]
                     (boolean (re-find #"(?s)^<context>\n.*information about the user.*</context>\nHow many orders"
                                       (last (user-messages request)))))]
    (testing "the first turn failed, so its full block is not in the history: the next turn sends it again"
      (let [failed   (assoc first-turn :response (mut/mock-llm-response [{:type :start :id "msg-1"}
                                                                         {:type :error :error {:message "boom"}}]))
            requests (run-turns! [failed next-turn])]
        (is (= 2 (count requests)))
        (is (= 1 (count (user-messages (second requests)))) "the failed turn is not replayed")
        (is (sent-full? (second requests)))))
    (testing "a retry of the first turn deletes its answer, and the block with it: the retry sends the block again"
      (let [requests (run-turns! [first-turn (assoc next-turn :retry? true)])]
        (is (= 2 (count requests)))
        (is (= 1 (count (user-messages (second requests)))) "the retried turn is not replayed")
        (is (sent-full? (second requests)))))))

(deftest first-day-of-week-comes-from-the-setting-test
  (mt/with-temporary-setting-values [start-of-week :monday]
    (let [[turn-1 turn-2] (run-turns! two-turns)
          line            "In the system, the first day of the week (index 1) is: Monday\n"]
      (testing "the full block of the first turn and the block of the later turn name the first day from the setting"
        (is (= 1 (count (user-messages turn-1))))
        (is (= 2 (count (user-messages turn-2))))
        (doseq [message (concat (user-messages turn-1) (user-messages turn-2))]
          (is (str/includes? message line))))
      (check-turn-edge turn-1 turn-2))))
