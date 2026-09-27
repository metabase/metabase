(ns metabase.jev.apps.conversations
  "Automatic quality review of Metabot conversations.

  Three layers, each owning what it is good at:

  - static flags (code): dropped requests, agent/tool errors, truncated replies, UI-generated prompts.
  - per-turn reactions (Jev): what each typed follow-up does relative to the previous reply (correction,
    refinement, repeat, …) and how the user sounds.
  - conversation judgments (Jev): outcome, how it ended, frustration, and a few failure modes that need
    reading the whole exchange.

  [[classify]] composes them into a headline label (`ok` / `friction` / `failed`) plus issue slugs, several of
  which reuse the self-reported feedback `issue_type` values so the two sources line up.

  The judgment functions take message rows shaped like `metabot_message` (`:role :data :error :finished
  :deleted_at :id`, with `:data` either the stored JSON string or decoded parts) and understand every stored
  message encoding, so they work on app-DB rows and on exported rows alike."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.jev.client :as jev]
   [metabase.jev.db :as jev.db]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def question-set-version
  "Identifies the questions and composition rules below. Stored on each review row; a row with a different version
  is stale and gets re-scored."
  "2026-09-23.3")

;;; ------------------------------------------------ Normalization ------------------------------------------------

(def ^:private ui-generated-prompts
  "Openings of user messages the UI sends on a button click (sometimes followed by context such as the query
  error); they are not typed, so they say nothing about the user's mood."
  ["Fix this SQL query" "Analyze this chart"])

(defn- ui-generated? [text]
  (let [text (str/trim text)]
    (boolean (some #(str/starts-with? text %) ui-generated-prompts))))

(def ^:private say-limit 1200)
(def ^:private user-limit 1500)
(def ^:private error-limit 200)

(defn- clip [s n]
  (let [s (str s)]
    (if (> (count s) n) (str (subs s 0 n) "…") s)))

(defn- parts [data]
  (cond
    (string? data)     (if (str/blank? data) [] (json/decode+kw data))
    (sequential? data) data
    :else              []))

(defn- deleted? [{:keys [deleted_at]}]
  (not (str/blank? (str deleted_at))))

(defn- aborted? [{:keys [finished]}]
  (contains? #{false "false"} finished))

(defn- tool-part-error
  "The error text carried by a tool result part in any encoding, else nil."
  [p]
  (let [content (str (or (:content p) (:output p) (:errorText p)))]
    (cond
      (:error p)                                              (clip (get-in p [:error :message] (:error p)) error-limit)
      (= "output-error" (:state p))                           (clip (:errorText p) error-limit)
      (re-find #"(?i)^\s*(An error occurred|<errors>)" content) (clip content error-limit)
      :else (some-> (re-find #"\*\*Error:\*\*[^\n]*" content) (clip error-limit)))))

(defn- part-type [p]
  (or (:type p) (:_type p)))

(defn- assistant-events
  "Flatten one assistant message's parts into compact, ordered events."
  [ps]
  (vec
   (for [p  ps
         :let [ty (part-type p)]
         ev (cond
              (#{"TEXT" "text"} ty)
              [{:say (clip (or (:content p) (:text p)) say-limit)}]

              (= ty "TOOL_CALL")
              (for [c (:tool_calls p)] {:tool (:name c)})

              (= ty "tool-input")
              [{:tool (:function p)}]

              (#{"TOOL_RESULT" "tool-output"} ty)
              (when-let [e (tool-part-error p)] [{:tool_error e}])

              (and (string? ty) (str/starts-with? ty "tool-"))
              [(let [e (tool-part-error p)] (cond-> {:tool (subs ty 5)} e (assoc :tool_error e)))]

              (and (string? ty) (str/starts-with? ty "data-"))
              [{:produced (subs ty 5)}]

              (#{"navigate_to" "code_edit" "adhoc_viz" "static_viz" "transform_suggestion"} ty)
              [{:produced ty}]

              (= ty "error")
              [{:agent_error (clip (get-in p [:error :message]) error-limit)}])
         :when ev]
     ev)))

(defn- user-text [ps]
  (str/join " " (keep #(or (:text %) (when (and (= "user" (:role %)) (string? (:content %))) (:content %))) ps)))

(defn normalize-message
  "One stored message row -> a transcript turn: `{:user \"…\" :ui_button true?}` or `{:assistant [events]}`."
  [{:keys [role data error]}]
  (let [ps (parts data)]
    (if (= "user" role)
      (let [text (user-text ps)]
        (cond-> {:user (clip text user-limit)}
          (ui-generated? text) (assoc :ui_button true)))
      {:assistant (cond-> (assistant-events ps)
                    (not (str/blank? (str error))) (conj {:agent_error (clip error error-limit)}))})))

(defn- judged-rows
  "The rows a review judges: deleted attempts are left out, and so is every request the user stopped (the aborted
  reply plus the user message it answered), since stopping a reply is the user's choice, not a failure."
  [rows]
  (let [visible (vec (remove deleted? rows))
        stopped (set (for [[i row] (map-indexed vector visible)
                           :when   (and (= "assistant" (:role row)) (aborted? row))
                           j       (cond-> [i]
                                     (and (pos? i) (= "user" (:role (visible (dec i))))) (conj (dec i)))]
                       j))]
    (into [] (keep-indexed (fn [i row] (when-not (stopped i) row))) visible)))

(defn transcript
  "The judged transcript of message `rows` (oldest first); see [[judged-rows]]."
  [rows]
  (mapv normalize-message (judged-rows rows)))

;;; ------------------------------------------------ Layer 0: static flags ------------------------------------------------

(defn- ends-abruptly?
  "True when `text` stops mid-thought: it ends on a letter, digit, or comma outside a list/table line."
  [text]
  (let [text      (str/trimr (str text))
        last-line (or (last (str/split-lines text)) "")]
    (boolean (and (seq text)
                  (re-find #"[\p{L}\p{N},]$" text)
                  (not (re-find #"^\s*([-*•]|\d+[.)]|\|)" last-line))))))

(defn- last-assistant-text [rows]
  (some->> rows
           judged-rows
           (filter #(= "assistant" (:role %)))
           last :data parts
           (keep #(or (:text %) (when (= "TEXT" (:_type %)) (:content %))))
           last))

(defn flags
  "Statically detectable facts about a conversation, from its message `rows` and their `transcript` `t`."
  [rows t]
  (let [events     (mapcat :assistant t)
        pairs      (partition 2 1 t)
        resends    (count (filter (fn [[a b]] (and (:user a) (:user b))) pairs))
        typed      (remove :ui_button (filter :user t))]
    {:user_turns       (count (filter :user t))
     :assistant_turns  (count (filter :assistant t))
     :last_turn_by     (cond (:user (last t)) "user" (:assistant (last t)) "assistant" :else "none")
     :dropped_requests (+ resends (if (:user (last t)) 1 0))
     :regenerations    (count (filter #(and (deleted? %) (= "assistant" (:role %))) rows))
     :aborted_requests (count (filter #(and (not (deleted? %)) (= "assistant" (:role %)) (aborted? %)) rows))
     :tool_calls       (count (filter :tool events))
     :tool_errors      (count (filter :tool_error events))
     :tool_error_kinds (into [] (comp (keep :tool_error) (map #(clip % 80)) (distinct) (take 3)) events)
     :agent_errors     (count (filter :agent_error events))
     :artifacts_shown  (count (filter :produced events))
     :truncated        (ends-abruptly? (last-assistant-text rows))
     :ui_button_only   (and (seq (filter :user t)) (empty? typed))}))

;;; ------------------------------------------------ Layer 1: per-turn reactions ------------------------------------------------

(def ^:private event-legend
  (str "Metabot is an AI data-analysis assistant inside Metabase (a BI tool). A `user` turn is the user's text. "
       "An `assistant` turn is an ordered list of events: `say` = text shown to the user; `tool` = a tool it called; "
       "`tool_error` = that tool call failed with this message; `produced` = an artifact the user was shown "
       "(a query, chart, navigation, code edit); `agent_error` = the whole response failed with a system error."))

(def turn-questions
  "Asked once per typed follow-up, about that follow-up and the assistant turn before it."
  {:reaction (jev/choice
              "What is `this_user_turn` doing in response to `previous_assistant_turn`?"
              {:new_request      "Starts a different task unrelated to the previous response."
               :refinement       "Builds on a satisfactory response: asks for an addition, tweak, or next step without saying the previous one was wrong."
               :correction       "Says the previous response was wrong, missed something, or must be redone (even politely: 'actually…', 'that's not what I meant', 'still shows 100%')."
               :repeat           "Re-states the same original request because it was not delivered."
               :answer           "Answers a question the assistant asked, or confirms a proposal ('yes', 'go ahead', 'the second one')."
               :capability_probe "Asks what the assistant can do, whether it is working, or challenges its honesty or abilities."
               :closing          "Thanks, acknowledgement, or sign-off with no further ask."
               :error_report     "Pastes an error message or says the result errored or didn't run."})
   :tone     (jev/score
              "How is the user's tone in `this_user_turn`?"
              ["Neutral or friendly."
               "Terse or impatient: clipped commands, 'again', 'still', 'just'."
               "Exasperated: explicit disappointment, repeated emphasis, sarcasm, '??', caps."
               "Hostile: insults, profanity, or threatening to stop using the product."])})

(def ^:private max-turn-judgments 12)
(def ^:private context-turns 6)

(defn- brief-turn [turn]
  (if (:user turn)
    {:user (clip (:user turn) 200)}
    {:assistant (mapv (fn [e] (update-vals e #(clip % 120))) (take 4 (:assistant turn)))}))

(defn turn-states
  "`{:index :state}` for each typed user follow-up that answers an assistant turn (UI-generated prompts and
  resends after an unanswered message are skipped; those are static signals). Keeps the most recent
  [[max-turn-judgments]]."
  [t]
  (->> (for [[i turn] (map-indexed vector t)
             :when (and (:user turn) (pos? i) (not (:ui_button turn)) (:assistant (nth t (dec i))))]
         {:index i
          :state {:legend                  event-legend
                  :earlier_context         (mapv brief-turn (take-last context-turns (take (dec i) t)))
                  :previous_assistant_turn (:assistant (nth t (dec i)))
                  :this_user_turn          (:user turn)}})
       (take-last max-turn-judgments)
       vec))

(defn- compact-answer [a]
  (case (:type a)
    "choice" {:choice (:choice a) :confidence (:confidence a)}
    "score"  {:score (:score a) :confidence (:confidence a)}
    "noul"   (:noul a)
    a))

(defn- compact-answers [answers]
  (update-vals answers compact-answer))

(defn judge-turns
  "Run [[turn-questions]] over every [[turn-states]] entry in parallel. Returns `{:ok true :turns [...]}` or the first
  failed Jev result."
  [t]
  (let [results (doall (pmap (fn [{:keys [index state]}]
                               (assoc (jev/ask state turn-questions) :index index))
                             (turn-states t)))]
    (or (first (remove :ok results))
        {:ok    true
         :turns (mapv (fn [{:keys [index answers]}]
                        (assoc (compact-answers answers) :index index))
                      results)})))

(defn turn-features
  "Aggregate the per-turn answers into the numbers [[classify]] uses."
  [turns]
  (let [reaction-is (fn [k min-conf]
                      (count (filter #(and (= (name k) (get-in % [:reaction :choice]))
                                           (>= (get-in % [:reaction :confidence] 0) min-conf))
                                     turns)))
        tones       (mapv #(get-in % [:tone :score] 0) turns)
        third       (max 1 (quot (count tones) 3))
        mean        #(if (seq %) (/ (reduce + %) (count %)) 0)]
    {:corrections           (reaction-is :correction 0.6)
     :confident_corrections (reaction-is :correction 0.8)
     :repeats               (reaction-is :repeat 0.6)
     :error_reports         (reaction-is :error_report 0.6)
     :max_tone              (reduce max 0 tones)
     :tone_trend            (if (>= (count tones) 3)
                              (- (mean (take-last third tones)) (mean (take third tones)))
                              0)
     :last_reaction         (get-in (last turns) [:reaction :choice])
     :first_correction_at   (:index (first (filter #(= "correction" (get-in % [:reaction :choice])) turns)))}))

;;; ------------------------------------------------ Layer 2: conversation judgments ------------------------------------------------

(def ^:private conversation-legend
  {:conversation (str event-legend
                      " `ui_button: true` marks a user turn generated by clicking a UI button (e.g. 'Fix this SQL "
                      "query'), not typed, so it is not a sign of frustration. `omitted_turns` stands in for middle "
                      "turns left out for length.")
   :final_assistant_turn "The assistant's last turn, repeated from `conversation` for convenience."
   :facts "Counts computed by code about the same conversation. `dropped_requests` counts user messages that never got a reply."})

(def conversation-questions
  "Asked once per conversation."
  {:outcome                (jev/choice
                            "Judging from the whole conversation, did the user end up getting what they asked Metabot for?"
                            {:fulfilled    "The assistant delivered what was asked (a query, chart, answer, edit, or clear explanation) and the user did not indicate a remaining problem. A single exchange that ends after a delivered result counts as fulfilled."
                             :partial      "Something useful was delivered but a stated need was left unmet or wrong, or the user was still correcting it when the conversation ended."
                             :unfulfilled  "The user did not get what they asked for because the assistant failed: it errored, produced the wrong thing, gave up, stopped early, or never replied."
                             :not_possible "The request could not be satisfied with the data or tools available (the data does not exist in Metabase, or the action is outside what the assistant can do) and the assistant explained that honestly."
                             :unclear      "Cannot tell: the request was only a greeting, test, or too vague, or the conversation ended before any real response."})
   :ending                 (jev/choice
                            "How did the conversation end, judging by the user's final message and what preceded it?"
                            {:satisfied_close "The user signalled the result was good (thanks, 'perfect', 'great'), or moved on after a delivered result."
                             :neutral_stop    "The user simply stopped after a delivered result, with no signal either way."
                             :gave_up         "The user stopped while a problem was still open: after a correction that was not resolved, an error, a refusal, or an unanswered question."
                             :mid_task        "The assistant's last turn asked the user something or promised more, and the user never replied."
                             :not_a_task      "Greeting, test, or capability question only."})
   :frustration            (jev/score
                            "How much friction or frustration did the user experience? Do NOT require negative words; weigh unmet goals, repetition, corrections, and abandonment. Ignore `ui_button` turns as evidence of repetition."
                            ["No friction: the user asked, got a response, and either stopped or moved on to a new request."
                             "Mild effort: one clarification or small tweak was needed, then the request was satisfied."
                             "Clear struggle: the user corrected the assistant two or more times, re-sent the same ask, or reported the output was still wrong."
                             "Anger or abandonment: hostile or exasperated language, or the user gave up mid-task after repeated failures."])
   :request_ambiguous      (jev/noul "The user's initial request was too vague or underspecified for any assistant to act on correctly without asking a clarifying question (no table, metric, or time range named and none inferable from context).")
   :honest_about_limits    (jev/noul "When the assistant could not do something, it clearly said so and why, and offered the closest useful alternative (as opposed to failing silently, pretending, or vaguely deflecting).")
   :silent_scope_reduction (jev/noul "The assistant delivered less than the user asked for while presenting it as done, without clearly saying it fell short: after a `tool_error` it pasted SQL or instructions as text instead of creating the query or chart, built a simpler result than requested, or dropped a requested filter, column, or breakdown.")
   :refusal                (jev/noul "The assistant declined to attempt a request that it plausibly could have attempted with its tools (e.g. 'I can't help with that', 'I'm not able to do that'). Explaining that the data genuinely does not exist is NOT a refusal.")
   :wrong_action           (jev/noul "The assistant took an incorrect action: it built or edited the wrong query or entity, used the wrong table, field, or model, or produced output the user then reported as wrong.")})

(def ^:private conversation-budget
  "Upper bound on the JSON size of the transcript sent to Jev, in characters."
  30000)

(defn- json-size [x] (count (json/encode x)))

(defn- fit-conversation
  "Keep the first two turns and as many of the latest turns as fit in `budget`, marking the omitted middle."
  [t budget]
  (if (<= (json-size t) budget)
    t
    (let [head      (vec (take 2 t))
          remaining (- budget (json-size head) 40)
          tail      (loop [acc () [turn & more :as todo] (reverse (drop 2 t)) used 0]
                      (let [size (if turn (long (json-size turn)) 0)]
                        (if (and (seq todo) (<= (+ used size) remaining))
                          (recur (conj acc turn) more (+ used size))
                          acc)))
          omitted   (- (count t) (count head) (count tail))]
      (cond-> head
        (pos? omitted) (conj {:omitted_turns omitted})
        true           (into tail)))))

(defn conversation-state
  "The Jev state for [[conversation-questions]]."
  [t fl]
  {:legend               conversation-legend
   :facts                (dissoc fl :tool_error_kinds)
   :final_assistant_turn (:assistant (last (filter :assistant t)))
   :conversation         (fit-conversation t conversation-budget)})

(defn judge-conversation
  "Run [[conversation-questions]] over transcript `t` with static flags `fl`."
  [t fl]
  (let [res (jev/ask (conversation-state t fl) conversation-questions)]
    (if (:ok res)
      {:ok true :answers (compact-answers (:answers res))}
      res)))

;;; ------------------------------------------------ Composition ------------------------------------------------

(def problem-issues
  "Issue slugs that indicate the conversation went wrong. The self-report `issue_type` values are reused where the
  meaning matches."
  #{"system-failure" "unfulfilled" "degraded-delivery" "overall-refusal" "did-not-follow-request"
    "took-incorrect-actions" "incomplete-response" "high-frustration"})

(def informational-issues
  "Issue slugs that describe the request rather than a failure of the assistant."
  #{"impossible-request" "vague-request"})

(def ^:private act-confidence 0.7)
(def ^:private review-band [0.4 0.7])

(defn- choice-is? [answer k min-conf]
  (and (= (name k) (:choice answer)) (>= (or (:confidence answer) 0) min-conf)))

(defn classify
  "Compose static flags `fl`, per-turn features `tf`, and conversation answers `ca` (nil when Jev was not asked)
  into `{:label :issues :review}`. `:label` is `ok`, `friction`, or `failed`; a label other than `ok` always
  carries at least one issue from [[problem-issues]]."
  [fl tf ca]
  (let [{:keys [outcome frustration refusal wrong_action silent_scope_reduction
                request_ambiguous honest_about_limits]} ca
        p          #(or % 0)
        issues     (cond-> []
                     (or (pos? (:dropped_requests fl)) (pos? (:agent_errors fl)))
                     (conj "system-failure")

                     (choice-is? outcome :unfulfilled act-confidence)
                     (conj "unfulfilled")

                     (and (pos? (:tool_errors fl)) (>= (p silent_scope_reduction) 0.6))
                     (conj "degraded-delivery")

                     (>= (p refusal) act-confidence)
                     (conj "overall-refusal")

                     (or (pos? (:confident_corrections tf 0)) (>= (:corrections tf 0) 2) (>= (p wrong_action) act-confidence))
                     (conj "did-not-follow-request")

                     (and (>= (p wrong_action) act-confidence) (pos? (:artifacts_shown fl)))
                     (conj "took-incorrect-actions")

                     (or (:truncated fl) (choice-is? outcome :partial act-confidence))
                     (conj "incomplete-response")

                     (or (>= (p (:score frustration)) 2) (>= (:max_tone tf 0) 2))
                     (conj "high-frustration")

                     (and (choice-is? outcome :not_possible 0.5) (>= (p honest_about_limits) act-confidence))
                     (conj "impossible-request")

                     (>= (p request_ambiguous) act-confidence)
                     (conj "vague-request"))
        issue?     (set issues)
        label      (cond
                     (some issue? ["system-failure" "unfulfilled"])           "failed"
                     (some problem-issues issues)                             "friction"
                     :else                                                    "ok")
        [lo hi]    review-band
        uncertain? #(and % (<= lo (or (:confidence %) 1) hi))
        review     (boolean (and (#{"unfulfilled" "partial"} (:choice outcome)) (uncertain? outcome)))]
    {:label label :issues issues :review review}))

(defn review-rows
  "Review a conversation from its message `rows` (oldest first). Returns `{:ok true :record {...}}` with the
  columns of a review row, or the failed Jev result."
  [rows]
  (let [t  (transcript rows)
        fl (flags rows t)]
    (if (zero? (:assistant_turns fl))
      {:ok true :record (assoc (classify fl {} nil) :answers {:flags fl} :version question-set-version)}
      (let [conv  (future (judge-conversation t fl))
            turns (judge-turns t)
            conv  @conv]
        (cond
          (not (:ok turns)) turns
          (not (:ok conv))  conv
          :else
          (let [tf (turn-features (:turns turns))]
            {:ok     true
             :record (assoc (classify fl tf (:answers conv))
                            :answers {:flags         fl
                                      :turn_features tf
                                      :turns         (:turns turns)
                                      :conversation  (:answers conv)}
                            :version question-set-version)}))))))

;;; ------------------------------------------------ Persistence ------------------------------------------------

(defn conversation-rows
  "The stored message rows of conversation `conversation-id`, oldest first."
  [conversation-id]
  (jev.db/message-rows conversation-id))

(def ^:private in-flight-grace-minutes
  "An unfinished reply younger than this is assumed to still be streaming."
  15)

(defn- in-flight? [rows]
  (let [{:keys [role finished created_at]} (last rows)]
    (and (= "assistant" role)
         (nil? finished)
         (some? created_at)
         (t/after? (t/offset-date-time created_at)
                   (t/minus (t/offset-date-time) (t/minutes in-flight-grace-minutes))))))

(defn score!
  "Review conversation `conversation-id` and upsert its `metabot_conversation_review` row. Returns
  `{:status :scored :label …}`, `{:status :skipped :reason …}` (no messages, or a reply still streaming), or
  `{:status :failed :error …}` (the row is left untouched so the conversation stays pending)."
  [conversation-id]
  (let [rows (conversation-rows conversation-id)]
    (cond
      (empty? rows)      {:status :skipped :reason :no-messages}
      (in-flight? rows)  {:status :skipped :reason :in-flight}
      :else
      (let [{:keys [ok record error]} (review-rows rows)]
        (if-not ok
          {:status :failed :error error}
          (do
            (jev.db/upsert-review! conversation-id (assoc record :last_message_id (:id (last rows))))
            {:status :scored :label (:label record) :issues (:issues record)}))))))

(defn pending-conversation-ids
  "Up to `limit` ids of conversations needing a (re)review, ordered by id, starting after `after-id` (nil for the
  start)."
  [after-id limit]
  (jev.db/pending-conversation-ids question-set-version after-id limit))

(defn backfill-status
  "Counts of conversations still needing a review and of current review rows."
  []
  {:pending (jev.db/pending-count question-set-version)
   :scored  (jev.db/review-count question-set-version)
   :version question-set-version})

(defn reclassify-all!
  "Recompute every current review's label, issues, and review flag from its stored answers with [[classify]], without
  calling Jev. For composition-rule changes; question changes need a new [[question-set-version]] instead."
  []
  (reduce (fn [n {:keys [conversation_id answers]}]
            (let [{:keys [flags turn_features conversation]} answers]
              (jev.db/update-review! conversation_id (classify flags (or turn_features {}) conversation))
              (inc n)))
          0
          (jev.db/reviews-with-version question-set-version)))

(defn mark-all-stale!
  "Mark every review row stale so the backfill re-scores it; the old label stays visible until then."
  []
  (jev.db/mark-all-reviews! "stale"))
