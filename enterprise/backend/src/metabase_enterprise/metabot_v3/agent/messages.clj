(ns metabase-enterprise.metabot-v3.agent.messages
  "Message formatting and history construction for the agent loop."
  (:require
   [metabase-enterprise.metabot-v3.agent.memory :as memory]))

(defn- format-message
  "Format a message into Claude/OpenAI format."
  [msg]
  (cond
    ;; User message
    (= (:role msg) :user)
    {:role "user" :content (:content msg)}

    ;; Assistant message
    (= (:role msg) :assistant)
    (cond-> {:role "assistant"}
      (:content msg) (assoc :content (:content msg))
      (:tool_calls msg) (assoc :tool_calls (:tool_calls msg)))

    ;; Tool result message
    (= (:role msg) :tool)
    {:role "user"
     :content [{:type "tool_result"
                :tool_use_id (:tool_call_id msg)
                :content (str (:content msg))}]}

    ;; System message
    (= (:role msg) :system)
    {:role "system" :content (:content msg)}

    ;; Fallback
    :else
    msg))

(defn- part->message
  "Convert an AI SDK part to a message format."
  [part]
  (case (:type part)
    :text
    {:role "assistant"
     :content (:text part)}

    :tool-input
    {:role "assistant"
     :tool_calls [{:id (:id part)
                   :name (:function part)
                   :arguments (str (:arguments part))}]}

    :tool-output
    {:role "user"
     :content [{:type "tool_result"
                :tool_use_id (:id part)
                :content (str (:result part))}]}

    nil))

(defn- step->messages
  "Convert a step's parts into messages."
  [step]
  (->> (:parts step)
       (keep part->message)
       (remove nil?)))

(defn build-message-history
  "Build full message history for LLM from memory.
  Includes input messages and all steps taken so far."
  [memory]
  (let [input-messages (memory/get-input-messages memory)
        steps (memory/get-steps memory)
        step-messages (mapcat step->messages steps)]
    (concat
     (map format-message input-messages)
     step-messages)))

(defn build-system-message
  "Build system message with context."
  [context profile]
  {:role "system"
   :content (str "You are Metabot, an AI assistant for Metabase.\n\n"
                 "Context:\n"
                 (when-let [viewing (:user_is_viewing context)]
                   (str "User is viewing: " (pr-str viewing) "\n"))
                 (when-let [recents (:user_recently_viewed context)]
                   (str "Recent views: " (pr-str recents) "\n"))
                 (when-let [capabilities (:capabilities context)]
                   (str "Available capabilities: " (pr-str capabilities) "\n")))})
