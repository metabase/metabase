(ns metabase.metabot.cache-prefix-test
  "A provider reads the conversation history from its prompt cache only when a request starts with the exact
  bytes of an earlier request. Inside a turn the agent loop keeps that true. These tests check it across the edge
  between two turns: the first request of a turn must start with the last request of the turn before it, in the
  wire format of each adapter.

  They cover the `<context>` block sent before each user message, assistant text streamed in deltas, a turn with one
  successful tool call, a tool call that fails with a failure the runtime declares, text written after a tool call,
  and tool calls that run in parallel. The history does not replay some other parts of a turn as they were sent: the
  SQL dialect preload, thinking and the text of a failure that no tool declared. No conversation here has those parts,
  except DeepSeek's thinking directive, which the tests with tool calls leave out: after a tool call with no signed
  thinking, it differs between the two turns."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ The conversation ------------------------------------------------

(defn- turn-request
  "The agent-streaming request body for `turn`, as the frontend sends it. `previous` holds the ids of the turn before
  it, or is nil for the first turn. A new turn names the previous answer as its parent. A turn with `:retry? true`
  asks for a new answer to the previous user message: it names that message, and no parent."
  [conversation-id {:keys [message context retry? profile-id]} previous answer-id user-id]
  (cond-> {:message              message
           :context              context
           :conversation_id      conversation-id
           :user_message_id      user-id
           :assistant_message_id answer-id
           :state                {}}
    profile-id                  (assoc :profile_id profile-id)
    retry?                      (assoc :retry_message_id user-id)
    (and previous (not retry?)) (assoc :parent_message_id (:answer-id previous))))

(defn- run-turns!
  "Send `turns` in one conversation through the agent-streaming endpoint. A turn is `{:message :context :response}`,
  where `:response` is what the provider streams back to the turn's one LLM call. A turn that makes more than one LLM
  call holds `:responses`, one per call, in place of `:response`. `:crowberto` sends every turn. A turn can also hold
  `:retry? true` (see [[turn-request]]), a `:profile-id`, and `:recent-views-enabled? false` to send it with the
  `metabot-recent-views-enabled?` setting off. Returns the request options the adapter got on each LLM call, in
  order."
  [turns]
  (let [conversation-id (str (random-uuid))
        pending         (atom (mapcat #(or (:responses %) [(:response %)]) turns))
        requests        (atom [])]
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider "anthropic/claude-opus-5-5"]
      (mt/with-dynamic-fn-redefs [claude/claude                    (fn [opts]
                                                                     (swap! requests conj opts)
                                                                     (ffirst (swap-vals! pending rest)))
                                  conversation-title/ensure-title! (constantly nil)]
        (mt/with-model-cleanup [:model/MetabotMessage
                                [:model/MetabotConversation :created_at]]
          (reduce (fn [previous {:keys [retry? recent-views-enabled?] :or {recent-views-enabled? true} :as turn}]
                    (let [answer-id (str (random-uuid))
                          ;; a retry keeps the id of the user message it retries
                          user-id   (if retry? (:user-id previous) (str (random-uuid)))]
                      (mt/with-temporary-setting-values [metabot-recent-views-enabled? recent-views-enabled?]
                        (mt/user-http-request :crowberto :post 202 "metabot/agent-streaming"
                                              (turn-request conversation-id turn previous answer-id user-id)))
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
  model can send before a tool call. It is longer than five characters, so it arrives in two deltas."
  [{:message   "How many orders do we have?"
    :context   {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
    :responses [(load-skill-call "msg-1" "Let me read how to look up a table first.")
                (load-skill-call "msg-2" "\n\n   \n\n")
                (answer "msg-3" "There are 18,760 orders.")]}
   {:message  "And last month?"
    :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :response (answer "msg-4" "Last month there were 1,412.")}])

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
   {:message  "And last month?"
    :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :response (answer "msg-3" "Last month there were 1,412.")}])

(def ^:private text-after-call-turns
  "Two turns. The first LLM call of the first turn writes text, calls `load_skill`, and then writes more text. The call
  runs after the LLM call ends, so its result comes after the second text."
  [{:message   "How many orders do we have?"
    :context   {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
    :responses [(mut/mock-llm-response [{:type :start :id "msg-1"}
                                        {:type :text :id "msg-1-text-1" :text "Let me look that up."}
                                        {:type :tool-input :id "msg-1-call" :function "load_skill"
                                         :arguments {:ids ["read-resource"]}}
                                        {:type :text :id "msg-1-text-2" :text "This may take a moment."}])
                (answer "msg-2" "There are 18,760 orders.")]}
   {:message  "And last month?"
    :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :response (answer "msg-3" "Last month there were 1,412.")}])

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
   {:message  "And last month?"
    :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :response (answer "msg-3" "Last month there were 1,412.")}])

(def ^:private failed-call-turns
  "Two turns. The first LLM call of the first turn calls `load_skill` with no skill id. The arguments are not valid, so
  the call fails with a failure that the runtime declares, and the history replays the text that the model read."
  [{:message   "How many orders do we have?"
    :context   {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
    :responses [(mut/mock-llm-response [{:type :start :id "msg-1"}
                                        {:type :tool-input :id "msg-1-call" :function "load_skill"
                                         :arguments {:ids []}}])
                (answer "msg-2" "There are 18,760 orders.")]}
   {:message  "And last month?"
    :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
    :response (answer "msg-3" "Last month there were 1,412.")}])

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
  turn before it, `request`. `ignored` maps an adapter name to the top-level body keys that the check leaves out."
  ([request next-request]
   (check-turn-edge request next-request {}))
  ([request next-request ignored]
   (doseq [{:keys [adapter history render]} adapters
           :let [render #(apply dissoc (render %) (get ignored adapter))]]
     (testing (str adapter ": turn 2's first request starts with turn 1's last request, cache markers aside")
       (is (nil? (prefix-break history (render request) (render next-request))))))))

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

(deftest turn-with-a-tool-call-replays-as-sent-test
  (mt/with-temp [:model/Card _ {:name "Orders by month"}]
    (let [turns             [{:message   "Which questions show orders?"
                              :context   {:current_time_with_timezone "2026-10-20T10:00:00+00:00"}
                              :responses [(mut/mock-llm-response
                                           [{:type :start :id "msg-1"}
                                            {:type      :tool-input
                                             :id        "call-search"
                                             :function  "search"
                                             :arguments {:keyword_queries ["orders by month"] :limit 5}}])
                                          (answer "msg-2" "The question Orders by month shows them.")]}
                             {:message  "And products?"
                              :context  {:current_time_with_timezone "2026-10-20T10:05:00+00:00"}
                              :response (answer "msg-3" "No question shows products.")}]
          ;; the in-place engine searches without an index
          requests          (search.tu/with-legacy-search (run-turns! turns))
          [_ turn-1 turn-2] requests
          tool-output       (fn [request]
                              (some #(when (= :tool-output (:type %)) %) (:input request)))]
      (testing "turn 1 makes two LLM calls, the search call and the answer; turn 2 makes one"
        (is (= 3 (count requests))))
      (testing "the search call finds the card, and turn 2 replays the call from the history"
        (is (=? {:result {:output #"(?s).*<search-results>.*Orders by month.*</search-results>.*"}}
                (tool-output turn-1)))
        (is (not (get-in (tool-output turn-1) [:result :error])))
        (is (=? {:result {:output #"(?s).*<search-results>.*Orders by month.*</search-results>.*"}}
                (tool-output turn-2))))
      ;; DeepSeek turns thinking off while the open turn holds a tool call with no signed thinking, and on again in
      ;; the next turn. That is part of the thinking, which the history does not replay as sent.
      (check-turn-edge turn-1 turn-2 {"deepseek" [:thinking]}))))

(deftest later-turn-sends-its-time-and-the-viewing-context-test
  (mt/with-temp [:model/Card      {card-id :id}   {:name          "Question A"
                                                   :dataset_query (let [mp (mt/metadata-provider)]
                                                                    (lib/query mp (lib.metadata/table mp (mt/id :venues))))}
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

(deftest replayed-full-block-decides-the-recent-views-test
  ;; This pins a known trade-off, not a goal: a later turn sends no recent views, so the replayed full block decides
  ;; them for the whole conversation (see the comment in `metabase.metabot.context/add-recent-views`).
  (mt/with-temp [:model/Card {viewed-id :id} {:name "Question C"}]
    (mt/with-model-cleanup [:model/RecentViews]
      (activity-feed/update-users-recent-views! (mt/user->id :crowberto) :model/Card viewed-id :view)
      (let [turn     (fn [n & {:as more}]
                       (merge {:message  (str "Question " n "?")
                               :context  {:current_time_with_timezone (format "2026-10-20T10:0%d:00+00:00" n)}
                               :response (answer (str "msg-" n) "An answer.")}
                              more))
            recents? #(boolean (re-find #"(?s)recently viewed:.*Question C" (str/join "\n" (user-messages %))))]
        (testing "a turn that excludes recent views still replays the recent views of the full block"
          (doseq [[label second-turn] [["the setting is off" (turn 2 :recent-views-enabled? false)]
                                       ["a switch to the nlq profile" (turn 2 :profile-id "nlq")]]]
            (testing label
              (let [[turn-1 turn-2] (run-turns! [(turn 1) second-turn])]
                (is (recents? turn-1))
                (is (recents? turn-2))))))
        (testing "a full block sent without recent views counts as full, so a later turn that allows them gets none"
          (let [[turn-1 turn-2] (run-turns! [(turn 1 :profile-id "nlq") (turn 2)])]
            (is (not (recents? turn-1)))
            (is (not (re-find #"information about the user" (last (user-messages turn-2))))
                "the later turn sends no new full block")
            (is (not (recents? turn-2)))))))))

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

(deftest streamed-text-replays-as-one-part-test
  (let [requests                    (run-turns! streamed-text-turns)
        [_ _ last-of-turn-1 turn-2] requests
        texts                       (fn [opts] (keep #(when (= :text (:type %)) (:text %)) (:input opts)))]
    (testing "turn 1 makes three LLM calls, turn 2 makes one"
      (is (= 4 (count requests))))
    (testing "a text block streamed in deltas is sent as one part in the next call, and blank text is not sent"
      (is (= ["Let me read how to look up a table first."]
             (texts last-of-turn-1))))
    ;; DeepSeek turns thinking off while the open turn holds a tool call with no signed thinking, as these mocked
    ;; calls do, and on again in the next turn. That is part of the thinking, which the history does not replay as
    ;; sent.
    (check-turn-edge last-of-turn-1 turn-2 {"deepseek" [:thinking]})))

(deftest parallel-tool-calls-replay-before-their-results-test
  (let [requests                  (run-turns! parallel-call-turns)
        [_ last-of-turn-1 turn-2] requests
        kinds                     (fn [opts] (mapv #(or (:type %) (:role %)) (:input opts)))]
    (testing "turn 1 makes two LLM calls, turn 2 makes one"
      (is (= 3 (count requests))))
    (testing "the calls of a step are sent before their results"
      (is (= [:user :text :tool-input :tool-input :tool-output :tool-output]
             (kinds last-of-turn-1))))
    ;; DeepSeek's thinking directive is left out, for the reason in [[streamed-text-replays-as-one-part-test]].
    (check-turn-edge last-of-turn-1 turn-2 {"deepseek" [:thinking]})))

(deftest text-after-a-tool-call-replays-before-its-result-test
  (let [requests                  (run-turns! text-after-call-turns)
        [_ last-of-turn-1 turn-2] requests
        kinds                     (fn [opts] (mapv #(or (:type %) (:role %)) (:input opts)))]
    (testing "turn 1 makes two LLM calls, turn 2 makes one"
      (is (= 3 (count requests))))
    (testing "the text after the call is sent before the result of the call"
      (is (= [:user :text :tool-input :text :tool-output]
             (kinds last-of-turn-1))))
    ;; DeepSeek's thinking directive is left out, for the reason in [[streamed-text-replays-as-one-part-test]].
    (check-turn-edge last-of-turn-1 turn-2 {"deepseek" [:thinking]})))

(deftest many-parallel-tool-calls-send-their-results-in-call-order-test
  (let [requests                  (run-turns! many-parallel-call-turns)
        [_ last-of-turn-1 turn-2] requests
        ids                       (fn [kind opts] (keep #(when (= kind (:type %)) (:id %)) (:input opts)))]
    (testing "turn 1 makes two LLM calls, turn 2 makes one"
      (is (= 3 (count requests))))
    (testing "the results of ten parallel calls are sent in the order of the calls"
      (is (= 10 (count (ids :tool-output last-of-turn-1))))
      (is (= (ids :tool-input last-of-turn-1)
             (ids :tool-output last-of-turn-1))))
    ;; DeepSeek's thinking directive is left out, for the reason in [[streamed-text-replays-as-one-part-test]].
    (check-turn-edge last-of-turn-1 turn-2 {"deepseek" [:thinking]})))

(deftest failed-tool-call-replays-as-a-failure-test
  (let [requests                  (run-turns! failed-call-turns)
        [_ last-of-turn-1 turn-2] requests
        tool-output               (fn [opts] (some #(when (= :tool-output (:type %)) %) (:input opts)))]
    (testing "turn 1 makes two LLM calls, turn 2 makes one"
      (is (= 3 (count requests))))
    (testing "the call fails in turn 1, and turn 2 replays the text that turn 1 sent"
      (is (get-in (tool-output last-of-turn-1) [:result :error]))
      (is (= (get-in (tool-output last-of-turn-1) [:result :output])
             (get-in (tool-output turn-2) [:result :output]))))
    (testing "turn 2 replays the result as a failure"
      (is (get-in (tool-output turn-2) [:result :error])))
    ;; DeepSeek's thinking directive is left out, for the reason in [[streamed-text-replays-as-one-part-test]].
    (check-turn-edge last-of-turn-1 turn-2 {"deepseek" [:thinking]})))
