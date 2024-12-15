(ns metabase-enterprise.metabot-v3.handle-envelope
  "Code for handling responses from AI Proxy ([[metabase-enterprise.metabot-v3.client]])."
  (:require
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.envelope :as envelope]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.o11y :as o11y]))

(defn- full-history
  [{:keys [context] :as e}]
  (into (metabot-v3.dummy-tools/invoke-dummy-tools context)
        (envelope/history e)))

(defn- invoke-all-tool-calls! [{:keys [context] :as e}]
  (reduce (fn [e {tool-name :name, tool-call-id :id, :keys [arguments]}]
            (let [{:keys [output context]}
                  (o11y/with-span :info {:name tool-name}
                    (metabot-v3.tools.interface/*invoke-tool* tool-name arguments context (full-history e)))]
              (envelope/add-tool-response e tool-call-id output context)))
          e
          (envelope/tool-calls-requiring-invocation e)))

(defn- request-llm-response [e]
  (let [new-response-message (:message (metabot-v3.client/*request*
                                        (envelope/context e)
                                        (full-history e)
                                        (envelope/session-id e)))]
    (-> e
        envelope/decrement-round-trips
        (envelope/add-message new-response-message))))

(defn handle-envelope
  "Three possible states here:
  1. *We* have updated the history with a tool call response, and require an LLM response.
  2. We have received a response back from the LLM and need to respond to tool calls (if any)
  3. We don't need to do anything at all."
  [e]
  (cond
    (envelope/requires-tool-invocation? e) (recur (invoke-all-tool-calls! e))
    (envelope/requires-llm-response? e) (recur (request-llm-response e))
    :else e))
