(ns metabase.mcp.v2.test-util
  "Test-only v2 MCP tools. Never loaded by the production surface."
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
                 ;; described so the docs generator's tests, which read every registered tool's arguments, accept it
                 ;; when a shared test JVM leaves it registered
                 [:message {:optional true}
                  [:maybe [:string {:description "Text to echo back; omitted echoes \"pong\"."}]]]]}
  [{:keys [message]} _context]
  (let [payload {:ok true :message (or message "pong")}]
    (common/success-content payload payload)))
