(ns metabase-enterprise.metabot-v3.agent.messages
  "Message formatting and history construction for the agent loop."
  (:require
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.prompts :as prompts]
   [metabase-enterprise.metabot-v3.agent.user-context :as user-context]))

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
  "Build system message with templated prompt and enriched context.

  Parameters:
  - context: Context map from API (with user_is_viewing, user_recently_viewed, etc.)
  - profile: Profile map with :prompt-template key
  - tools: Tool registry map (name -> var)

  Returns message map with {:role \"system\" :content \"...\"}."
  [context profile tools]
  (let [;; Enrich context with formatted variables for template
        enriched-context (user-context/enrich-context-for-template context)
        ;; Build system message content using template
        content (prompts/build-system-message-content profile enriched-context tools)]
    {:role "system"
     :content content}))
