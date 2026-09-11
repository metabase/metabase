(ns metabase.mcp.v2.test-util
  "Test-only tools for the v2 MCP registry. Loading this namespace registers `test_echo`, a dependency-free
  tool the registry, transport, and usage tests drive to assert the `tools/list` / `tools/call` contract
  (scope gating, argument validation, error redaction, usage logging) without touching content. It is never
  loaded by the production surface, so it never reaches a real client's tool list."
  (:require
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

(registry/deftool test-echo
  "Test-only tool. Echoes `message` back, or `pong` when none is given."
  {:name        "test_echo"
   :scope       metabot.scope/agent-content-read
   :annotations {:readOnlyHint true :idempotentHint true}
   :args        [:map {:closed true}
                 [:message {:optional true} [:maybe :string]]]}
  [{:keys [message]} _context]
  (let [payload {:ok true :message (or message "pong")}]
    (common/success-content payload payload)))
