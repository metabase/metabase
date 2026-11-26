(ns metabase-enterprise.metabot-analytics.timings
  "The timing of the replies of a conversation, for the conversation detail: how long the server worked on each
  reply, and how long each of its LLM call attempts and tool calls took. The times come from
  `metabot_message.finished_at` and from the records in `metabot_llm_call` and `metabot_tool_call`.

  A reply has no timing when nothing recorded one: a reply from before these records existed, and a reply that a
  fork copied (see [[metabase.metabot.call-records]])."
  (:require
   [java-time.api :as t]
   [metabase.metabot.persistence :as metabot.persistence]))

(set! *warn-on-reflection* true)

(defn- ms-between
  "The milliseconds from `start` to `end`, at least 0, or nil when either is missing."
  [start end]
  (when (and start end)
    (max 0 (t/time-between (t/instant start) (t/instant end) :millis))))

(defn- llm-call-timing
  "The timing of the MetabotLlmCall `llm-call`. An attempt with no end has no `:duration_ms`."
  [{:keys [iteration attempt provider model status started_at finished_at error_class retry_delay_ms]}]
  {:iteration      iteration
   :attempt        attempt
   :provider       provider
   :model          model
   :status         status
   :started_at     started_at
   :duration_ms    (ms-between started_at finished_at)
   :error_class    error_class
   :retry_delay_ms retry_delay_ms})

(defn- tool-call-timing
  "The timing of the MetabotToolCall `tool-call`: `:wait_ms` from its submit to its start, `:duration_ms` from its
  start to its end. A call that never started, as a skipped one, has neither."
  [{:keys [tool_call_id tool_name status created_at started_at finished_at error_class]}]
  {:call_id     tool_call_id
   :tool_name   tool_name
   :status      status
   :created_at  created_at
   :wait_ms     (ms-between created_at started_at)
   :duration_ms (ms-between started_at finished_at)
   :error_class error_class})

(defn message-timings
  "The timings of the assistant MetabotMessages in `messages`, in the order of `messages`: one map for each message
  that has a `finished_at` or at least one of the MetabotLlmCalls `llm-calls` or MetabotToolCalls `tool-calls`.
  `:message_id` is the id of the message as the client knows it. `:duration_ms` is the time from the insert of the
  message, at the start of the turn, to the end of the agent loop; nil while the turn runs. It is
  [[metabot.persistence/elapsed-ms]], the number that the chat gets for the reply."
  [messages llm-calls tool-calls]
  (let [llm-calls-by-message  (group-by :message_id (sort-by :id llm-calls))
        tool-calls-by-message (group-by :message_id (sort-by :id tool-calls))]
    (into []
          (keep (fn [{:keys [id external_id role created_at finished_at]}]
                  (let [message-llm-calls  (get llm-calls-by-message id)
                        message-tool-calls (get tool-calls-by-message id)]
                    (when (and (= :assistant role)
                               (or finished_at (seq message-llm-calls) (seq message-tool-calls)))
                      {:message_id  (or external_id (str id))
                       :started_at  created_at
                       :finished_at finished_at
                       :duration_ms (metabot.persistence/elapsed-ms created_at finished_at)
                       :llm_calls   (mapv llm-call-timing message-llm-calls)
                       :tool_calls  (mapv tool-call-timing message-tool-calls)}))))
          messages)))

(defn total-duration-ms
  "The sum of the `:duration_ms` of the message `timings`, or nil when none has one."
  [timings]
  (some->> (seq (keep :duration_ms timings))
           (reduce +)))
