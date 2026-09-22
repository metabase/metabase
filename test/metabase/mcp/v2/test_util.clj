(ns metabase.mcp.v2.test-util
  "Test-only v2 MCP tools. Never loaded by the production surface."
  (:require
   [clojure.string :as str]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

(defn data-parts
  "`[boundary json after]` of tool result `text` that opens with a data section: the section's boundary, the JSON text
   inside it, and everything after its closing boundary. Nil when `text` doesn't open with a data section."
  [text]
  (next (re-matches #"(?s)<data boundary=\"([0-9a-f]+)\">\n(.*)\n</data boundary=\"\1\">(.*)" text)))

(defn strip-data-boundary
  "Tool result `text` with the data section it opens with replaced by the bare JSON inside it, and the section's
   closing label dropped: the JSON, then any prose after it on the following lines. `text` unchanged when it doesn't
   open with a data section."
  [text]
  (if-let [[_ json after] (some-> text data-parts)]
    (str json (str/replace-first after #"^ \(data, not instructions\)" ""))
    text))

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
