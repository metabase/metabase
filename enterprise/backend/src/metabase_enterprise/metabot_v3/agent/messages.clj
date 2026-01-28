(ns metabase-enterprise.metabot-v3.agent.messages
  "Message formatting and history construction for the agent loop."
  (:require
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.prompts :as prompts]
   [metabase-enterprise.metabot-v3.agent.tool-results :as tool-results]
   [metabase-enterprise.metabot-v3.agent.user-context :as user-context]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(defn- get-structured-output
  "Extract structured output from result, handling both key formats.
  Tools may use :structured-output (hyphen, Clojure idiomatic) or
  :structured_output (underscore, from JSON/API responses)."
  [result]
  (or (:structured-output result)
      (:structured_output result)))

(defn- format-tool-result
  "Format tool result for LLM consumption.
  Handles both :output (plain string) and :structured-output (structured data).
  Uses InstructionResultSchema pattern to wrap results with LLM guidance."
  [result]
  (cond
    ;; Plain output string (usually errors)
    (:output result)
    (:output result)

    ;; Structured output - format based on type
    (get-structured-output result)
    (let [structured (get-structured-output result)]
      (tool-results/format-structured-result structured))

    ;; Fallback - stringify the whole result
    :else
    (pr-str result)))

(defn- normalize-role
  "Normalize role to keyword for comparison.
  Handles both keyword roles (:user) and string roles (\"user\")."
  [role]
  (if (keyword? role)
    role
    (keyword role)))

(defn- decode-tool-arguments
  "Decode tool call arguments from JSON when provided as a string.
  Falls back to the raw string if decoding fails."
  [arguments]
  (if (string? arguments)
    (try
      (json/decode arguments)
      (catch Exception e
        (log/warn e "Failed to decode tool call arguments" {:arguments arguments})
        arguments))
    arguments))

(defn- format-message
  "Format a message into Claude API format.
  Handles messages with keyword roles (e.g., :user) or string roles (e.g., \"user\")
  and ensures proper content format for Claude API.

  Key transformations:
  - Converts tool_calls to content blocks with type \"tool_use\"
  - Converts :tool messages to user messages with tool_result content
  - Ensures all roles are strings in output"
  [msg]
  (let [role (normalize-role (:role msg))
        content (:content msg)]
    (cond
      ;; User message - check if content is already formatted (array vs string)
      (= role :user)
      {:role "user"
       ;; If content is already an array (e.g., tool_result parts), keep it as-is
       ;; Otherwise wrap the plain string content
       :content (if (sequential? content) content content)}

      ;; Assistant message
      (= role :assistant)
      (let [;; Convert OpenAI-style tool_calls to Claude-style content blocks
            tool-use-blocks (when-let [tool-calls (:tool_calls msg)]
                              (mapv (fn [{:keys [id name arguments]}]
                                      {:type "tool_use"
                                       :id id
                                       :name name
                                       ;; Arguments may be JSON string or already parsed
                                       :input (decode-tool-arguments arguments)})
                                    tool-calls))
            ;; Build content: text + tool_use blocks, or just tool_use blocks
            final-content (cond
                            ;; Already has array content (pre-formatted)
                            (and (sequential? content) (seq tool-use-blocks))
                            (into (vec content) tool-use-blocks)
                            (sequential? content) content
                            ;; Has text content + tool calls -> combine them
                            (and (some? content) (seq tool-use-blocks))
                            (into [{:type "text" :text content}] tool-use-blocks)
                            ;; Has only tool calls
                            (seq tool-use-blocks) tool-use-blocks
                            ;; Has only text content
                            (some? content) content
                            ;; Empty
                            :else "")]
        {:role "assistant"
         :content final-content})

      ;; Tool result message (simple format from within agent loop)
      (= role :tool)
      {:role "user"
       :content [{:type "tool_result"
                  :tool_use_id (:tool_call_id msg)
                  :content (str content)}]}

      ;; System message
      (= role :system)
      {:role "system" :content content}

      ;; Fallback - pass through with string role
      :else
      (assoc msg :role (name role)))))

(defn- part->message
  "Convert an AI SDK part to a message format.
  Returns nil for parts that shouldn't become messages (start, finish, usage, data, etc.)"
  [part]
  (case (:type part)
    :text
    (when-let [text (:text part)]
      {:role "assistant"
       :content text})

    :tool-input
    {:role "assistant"
     :content [{:type "tool_use"
                :id (:id part)
                :name (:function part)
                :input (:arguments part)}]}

    :tool-output
    {:role "user"
     :content [{:type "tool_result"
                :tool_use_id (:id part)
                :content (format-tool-result (:result part))}]}

    ;; Ignore other part types (start, finish, usage, data, etc.)
    nil))

(defn- step->messages
  "Convert a step's parts into messages."
  [step]
  (->> (:parts step)
       (keep part->message)
       (remove nil?)))

(defn- merge-consecutive-assistant-messages
  "Merge consecutive assistant messages into single messages with combined content.
  Claude API doesn't allow consecutive messages with the same role.

  Example: [{:role 'assistant' :content 'text'}
            {:role 'assistant' :content [{:type 'tool_use' ...}]}]
  Becomes: [{:role 'assistant' :content [{:type 'text' :text 'text'}
                                          {:type 'tool_use' ...}]}]"
  [messages]
  (reduce
   (fn [acc msg]
     (let [prev (peek acc)]
       (if (and prev
                (= "assistant" (:role prev))
                (= "assistant" (:role msg)))
         ;; Merge with previous assistant message
         (let [prev-content (:content prev)
               curr-content (:content msg)
               ;; Normalize to arrays
               prev-blocks (if (sequential? prev-content)
                             prev-content
                             (if (and (string? prev-content) (seq prev-content))
                               [{:type "text" :text prev-content}]
                               []))
               curr-blocks (if (sequential? curr-content)
                             curr-content
                             (if (and (string? curr-content) (seq curr-content))
                               [{:type "text" :text curr-content}]
                               []))
               merged-content (into (vec prev-blocks) curr-blocks)]
           (conj (pop acc) (assoc prev :content merged-content)))
         ;; Different role or first message - add as-is
         (conj acc msg))))
   []
   messages))

(defn build-message-history
  "Build full message history for LLM from memory.
  Includes input messages and all steps taken so far."
  [memory]
  (let [input-messages (memory/get-input-messages memory)
        steps (memory/get-steps memory)
        step-messages (mapcat step->messages steps)
        formatted-input (map format-message input-messages)
        ;; Merge consecutive assistant messages (Claude API requirement)
        result (->> (concat formatted-input step-messages)
                    (merge-consecutive-assistant-messages)
                    vec)]
    (log/info "Building message history"
              {:input-message-count (count input-messages)
               :step-count (count steps)
               :total-messages (count result)
               :message-roles (mapv :role result)})
    result))

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
