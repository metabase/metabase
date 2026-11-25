(ns metabase.metabot.call-records
  "Records of the LLM calls and tool calls of Metabot, in `metabot_llm_call` and `metabot_tool_call` (EE only).

  An LLM call attempt gets a row before its request to the provider, and the row gets its end when the attempt ends.
  A tool call gets a row when it is submitted to the tool executor, and the row gets its end on the tool's thread.
  The end of a turn sets the rows that are still open to `aborted`.

  No function here throws: a record that fails is logged, and the turn goes on. In OSS nothing is recorded."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise record-llm-call-start!
  "Record the start of attempt number `attempt` of the LLM call that `tracking-opts` describes. Returns the id of the
  MetabotLlmCall, or nil when nothing was recorded.

  Reads from `tracking-opts`: `:message-id`, `:session-id`, `:request-id`, `:source` (or else `:tag`), `:profile-id`,
  `:provider`, `:model` and `:iteration`.

  In OSS, this is a no-op."
  metabase-enterprise.metabot.call-records
  [_tracking-opts _attempt]
  nil)

(defenterprise record-llm-call-end!
  "Record the end of the MetabotLlmCall with `llm-call-id`, a no-op when the id is nil. `outcome` holds:

  - `:status`: `\"ok\"`, `\"error\"` or `\"aborted\"`
  - `:error-class`, `:error-status`: the class and the HTTP status of a failure
  - `:retry-delay-ms`: the wait before the next attempt
  - `:finish-reason`: why the provider stopped
  - `:usage`: the `:usage` of the call's usage part

  In OSS, this is a no-op."
  metabase-enterprise.metabot.call-records
  [_llm-call-id _outcome]
  nil)

(defenterprise record-tool-call-submit!
  "Record a tool call at its submit to the tool executor. Returns the id of the MetabotToolCall, or nil when nothing
  was recorded. `call` holds `:llm-call-id`, `:message-id`, `:tool-call-id`, `:tool-name` and `:input`, a delay of the
  call's arguments.

  In OSS, this is a no-op."
  metabase-enterprise.metabot.call-records
  [_call]
  nil)

(defenterprise record-tool-call-end!
  "Record the end of the MetabotToolCall with `tool-call-record-id`, a no-op when the id is nil. `outcome` holds:

  - `:status`: `\"skipped\"` for a call that did not run, `\"error\"` for a call that threw. Absent for a call that
    returned, whose status then comes from `:result`.
  - `:started-at`: when the tool started to run
  - `:result`: what the tool returned
  - `:error-class`: the class of a failure that `:result` does not hold

  The update has no condition on the row's state, so a call that ends after its turn replaces `aborted`.

  In OSS, this is a no-op."
  metabase-enterprise.metabot.call-records
  [_tool-call-record-id _outcome]
  nil)

(defenterprise abort-open-calls!
  "Set the MetabotLlmCalls and MetabotToolCalls of the MetabotMessage with `message-id` that have no end to `aborted`,
  ended at `finished-at`.

  In OSS, this is a no-op."
  metabase-enterprise.metabot.call-records
  [_message-id _finished-at]
  nil)
