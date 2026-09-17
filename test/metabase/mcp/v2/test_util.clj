(ns metabase.mcp.v2.test-util
  "Test-only v2 MCP tools and registry helpers. Never loaded by the production surface."
  (:require
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

(registry/deftool test-echo
  "Test-only tool. Echoes `message` back, or `pong` when none is given."
  {:name           "test_echo"
   :scope          metabot.scope/agent-content-read
   :default-access :allowed
   :annotations    {:readOnlyHint true :idempotentHint true}
   :args           [:map {:closed true}
                    [:message {:optional true} [:maybe :string]]]}
  [{:keys [message]} _context]
  (let [payload {:ok true :message (or message "pong")}]
    (common/success-content payload payload)))

(registry/deftool test-off-by-default
  "Test-only tool denied by default. A group uses it only after an admin says yes."
  {:name           "test_off_by_default"
   :scope          metabot.scope/agent-content-read
   :default-access :denied
   :annotations    {:readOnlyHint true :idempotentHint true}
   :args           [:map {:closed true}]}
  [_arguments _context]
  (common/success-content {:ok true} {:ok true}))

(defn do-with-temp-tool!
  "Register `tool` for the duration of `thunk`, then restore the registry and flush the manifest cache. `tool` may
  redefine a registered tool under the same handler."
  [tool thunk]
  (let [tools-atom @#'registry/tools*
        snapshot   @tools-atom]
    (try
      (registry/register-tool! tool)
      (thunk)
      (finally
        (reset! tools-atom snapshot)
        (reset! @#'registry/manifest-cache nil)))))
