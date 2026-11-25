(ns metabase-enterprise.metabot.call-records
  "Enterprise implementation of [[metabase.metabot.call-records]]: writes `metabot_llm_call` and `metabot_tool_call`."
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.metabot.models.metabot-llm-call :as metabot-llm-call]
   [metabase.metabot.models.metabot-tool-call :as metabot-tool-call]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmacro ^:private logging-failure
  "Run `body` and return its value. When it throws, log the failure of `what` and return nil: a record that fails
  never fails the turn it describes."
  [what & body]
  `(try
     ~@body
     (catch Throwable e#
       (log/warnf e# "Failed to %s" ~what)
       nil)))

(defn- limited
  "`s` cut to the `limit` characters its column holds."
  [s limit]
  (cond-> s
    (and (string? s) (> (count s) limit)) (subs 0 limit)))

(defenterprise record-llm-call-start!
  "Record the start of attempt number `attempt` of the LLM call that `tracking-opts` describes. Returns the id of the
  MetabotLlmCall, or nil when the insert failed."
  :feature :none
  [{:keys [message-id session-id request-id source tag profile-id provider model iteration]} attempt]
  (logging-failure "record the start of an LLM call"
                   (:id (first (metabot-llm-call/create-metabot-llm-calls!
                                [{:message_id      message-id
                                  :conversation_id session-id
                                  :user_id         api/*current-user-id*
                                  :request_id      request-id
                                  :source          (limited (or source tag) 255)
                                  :profile_id      (some-> profile-id name)
                                  :provider        (some-> provider name)
                                  :model           (limited model 255)
                                  :iteration       iteration
                                  :attempt         attempt
                                  :started_at      (t/offset-date-time)
                                  :status          "running"}])))))

(defenterprise record-llm-call-end!
  "Record the end of the MetabotLlmCall with `llm-call-id`."
  :feature :none
  [llm-call-id {:keys [status error-class error-status retry-delay-ms finish-reason usage]}]
  (when llm-call-id
    (logging-failure "record the end of an LLM call"
                     (metabot-llm-call/update-metabot-llm-calls!
                      [(cond-> {:id          llm-call-id
                                :finished_at (t/offset-date-time)
                                :status      status}
                         error-class    (assoc :error_class (limited error-class 255))
                         error-status   (assoc :error_status error-status)
                         retry-delay-ms (assoc :retry_delay_ms retry-delay-ms)
                         finish-reason  (assoc :finish_reason (limited finish-reason 254))
                         usage          (assoc :prompt_tokens         (:promptTokens usage)
                                               :completion_tokens     (:completionTokens usage)
                                               :cache_creation_tokens (:cacheCreationTokens usage)
                                               :cache_read_tokens     (:cacheReadTokens usage)))]))))

(defenterprise record-tool-call-submit!
  "Record a tool call at its submit to the tool executor. Returns the id of the MetabotToolCall, or nil when the
  insert failed."
  :feature :none
  [{:keys [llm-call-id message-id tool-call-id tool-name input]}]
  (logging-failure "record the submit of a tool call"
                   (:id (first (metabot-tool-call/create-metabot-tool-calls!
                                [{:llm_call_id  llm-call-id
                                  :message_id   message-id
                                  :tool_call_id (limited (str tool-call-id) 255)
                                  :tool_name    (limited (str tool-name) 255)
                                  :created_at   (t/offset-date-time)
                                  :status       "running"
                                  :input        (force input)}])))))

(defenterprise record-tool-call-end!
  "Record the end of the MetabotToolCall with `tool-call-record-id`. A failed call stores no output, as the tool part
  in `metabot_message.data` stores none."
  :feature :none
  [tool-call-record-id {:keys [status started-at result error-class]}]
  (when tool-call-record-id
    (logging-failure "record the end of a tool call"
                     (let [error  (when (map? result) (:error result))
                           status (or status (if error "error" "ok"))]
                       (metabot-tool-call/update-metabot-tool-calls!
                        [(cond-> {:id          tool-call-record-id
                                  :finished_at (t/offset-date-time)
                                  :status      status}
                           started-at     (assoc :started_at started-at)
                           error-class    (assoc :error_class (limited error-class 255))
                           (:class error) (assoc :error_class (name (:class error)))
                           (= "ok" status) (assoc :output (metabot.persistence/tool-result->storable-output result)))])))))

(defenterprise abort-open-calls!
  "Set the MetabotLlmCalls and MetabotToolCalls of the MetabotMessage with `message-id` that have no end to `aborted`,
  ended at `finished-at`."
  :feature :none
  [message-id finished-at]
  (logging-failure "abort the open LLM calls of a message"
                   (metabot-llm-call/abort-open-metabot-llm-calls! [message-id] finished-at))
  (logging-failure "abort the open tool calls of a message"
                   (metabot-tool-call/abort-open-metabot-tool-calls! [message-id] finished-at))
  nil)
