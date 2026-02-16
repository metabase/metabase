(ns metabase-enterprise.metabot-v3.agent.messages
  "Message formatting and history construction for the agent loop.

  The agent stores conversation history as AISDK parts — the format-neutral
  internal representation used throughout the agent loop.  Each LLM adapter
  is responsible for converting these parts into its own wire format (Claude
  messages, Chat Completions messages, OpenAI Responses input items, etc.)."
  (:require
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.prompts :as prompts]
   [metabase-enterprise.metabot-v3.agent.user-context :as user-context]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

;;; ──────────────────────────────────────────────────────────────────
;;; Input message → AISDK part normalisation
;;; ──────────────────────────────────────────────────────────────────

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
      (json/decode+kw arguments)
      (catch Exception e
        (log/warn e "Failed to decode tool call arguments" {:arguments arguments})
        arguments))
    arguments))

(defn- tool-result-content
  "Normalise tool result content to a string suitable for :tool-output."
  [content]
  (cond
    (string? content) content
    (map? content)    (or (:output content) (pr-str content))
    :else             (str content)))

;; TODO (Sanya 2026-02-17): when we will use stored messages for context for AI agents we should be able to
;; simplify (or even drop) this significantly if we're storing in the same AISDK parts format.
(defn input-message->parts
  "Convert an input message (from the frontend / API) into a sequence of AISDK parts.

  Supported input shapes:
    {:role :user,      :content \"...\"}
    {:role :assistant, :content \"...\"}
    {:role :assistant, :content \"...\", :tool_calls [...]}
    {:role :assistant, :content [{:type \"tool_use\" ...}]}
    {:role :tool,      :tool_call_id \"...\", :content \"...\"}

  Returns a sequence of AISDK parts (may be >1 for messages with tool calls)."
  [{:keys [content tool_calls] :as msg}]
  (let [role (normalize-role (:role msg))]
    (case role
      :user
      ;; User messages that contain tool_result content blocks (pre-formatted
      ;; from conversation history) are expanded into :tool-output parts.
      (if (and (sequential? content)
               (every? #(= "tool_result" (:type %)) content))
        (mapv (fn [{:keys [tool_use_id content]}]
                {:type   :tool-output
                 :id     tool_use_id
                 :result {:output (tool-result-content content)}})
              content)
        [{:role :user :content (if (sequential? content)
                                 ;; Mixed content blocks: join text parts
                                 (->> content
                                      (filter #(= "text" (:type %)))
                                      (map :text)
                                      (apply str))
                                 (or content ""))}])

      :assistant
      ;; Assistant messages may have text, tool_use content blocks, or
      ;; OpenAI-style :tool_calls.  Normalise all into AISDK parts.
      (let [ ;; Extract text — either plain string or from content blocks
            text        (cond
                          (string? content)     content
                          (sequential? content) (let [texts (->> content
                                                                 (filter #(= "text" (:type %)))
                                                                 (map :text))]
                                                  (when (seq texts) (apply str texts))))
            ;; Extract tool calls — from content blocks or :tool_calls key
            tool-inputs (cond
                          (sequential? content)
                          (->> content
                               (filter #(= "tool_use" (:type %)))
                               (mapv (fn [{:keys [id name input]}]
                                       {:type      :tool-input
                                        :id        id
                                        :function  name
                                        :arguments (decode-tool-arguments input)})))

                          (seq tool_calls)
                          (mapv (fn [{:keys [id name arguments]}]
                                  {:type      :tool-input
                                   :id        id
                                   :function  name
                                   :arguments (decode-tool-arguments arguments)})
                                tool_calls))]
        (cond-> []
          text                (conj {:type :text :text text})
          (seq tool-inputs)   (into tool-inputs)))

      :tool
      [{:type   :tool-output
        :id     (:tool_call_id msg)
        :result {:output (tool-result-content content)}}]

      ;; system — pass through as-is (not really an AISDK part, but adapters
      ;; handle it separately via the :system option anyway)
      :system
      [{:role :system :content content}]

      ;; Fallback
      (do
        (log/warn "Unknown message role, passing through" {:role role})
        [{:role role :content content}]))))

;;; ──────────────────────────────────────────────────────────────────
;;; History construction
;;; ──────────────────────────────────────────────────────────────────

(defn- step->parts
  "Extract AISDK parts from a step, filtering out non-message types."
  [step]
  (->> (:parts step)
       (filter #(#{:text :tool-input :tool-output} (:type %)))))

(defn build-message-history
  "Build the conversation history as a flat sequence of AISDK parts.

  Returns a vector of items that are either:
  - `{:role :user, :content \"...\"}` for user messages
  - `{:type :text, :text \"...\"}` for assistant text
  - `{:type :tool-input, :id ..., :function ..., :arguments ...}` for tool calls
  - `{:type :tool-output, :id ..., :result ...}` for tool results

  Each LLM adapter converts this to its own wire format."
  [memory]
  (let [input-messages (memory/get-input-messages memory)
        steps          (memory/get-steps memory)
        input-parts    (mapcat input-message->parts input-messages)
        step-parts     (mapcat step->parts steps)
        result         (vec (concat input-parts step-parts))]
    (log/info "Building message history"
              {:input-message-count (count input-messages)
               :step-count          (count steps)
               :total-parts         (count result)})
    result))

;;; ──────────────────────────────────────────────────────────────────
;;; System message
;;; ──────────────────────────────────────────────────────────────────

(defn build-system-message
  "Build system message with templated prompt and enriched context.

  Parameters:
  - context: Context map from API (with user_is_viewing, user_recently_viewed, etc.)
  - profile: Profile map with :prompt-template key
  - tools: Tool registry map (name -> var)

  Returns message map with {:role \"system\" :content \"...\"}."
  [context profile tools]
  (let [enriched-context (user-context/enrich-context-for-template context)
        content          (prompts/build-system-message-content profile enriched-context tools)]
    {:role    "system"
     :content content}))
