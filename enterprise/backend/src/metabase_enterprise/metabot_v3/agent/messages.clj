(ns metabase-enterprise.metabot-v3.agent.messages
  "Message formatting and history construction for the agent loop."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.prompts :as prompts]
   [metabase-enterprise.metabot-v3.agent.user-context :as user-context]
   [metabase-enterprise.metabot-v3.tools.instructions :as instructions]
   [metabase-enterprise.metabot-v3.tools.llm-representations :as llm-rep]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(defn- format-with-instructions
  "Wrap data with instructions in InstructionResultSchema format.
   Matches Python AI Service pattern for consistent LLM outputs."
  [data instruction-text]
  (str "<result>\n" data "\n</result>\n"
       "<instructions>\n" instruction-text "\n</instructions>"))

(defn- format-query-result
  "Format a query result (from query_model, query_metric, etc.) for the LLM.
  Creates an XML-like structure matching Python ai-service exactly."
  [{:keys [type query-id database_id query-content result]}]
  (let [query-xml (llm-rep/query->xml {:query-type type
                                       :query-id query-id
                                       :database_id database_id
                                       :query-content query-content
                                       :result result})]
    (format-with-instructions query-xml instructions/query-created-instructions)))

(defn- format-chart-result
  "Format a chart result for the LLM."
  [{:keys [chart-id query-id chart-type]}]
  (let [chart-xml (llm-rep/chart->xml {:chart-id chart-id
                                       :query-id query-id
                                       :chart-type chart-type})]
    (format-with-instructions chart-xml (instructions/chart-created-instructions chart-id))))

(defn- format-search-result
  "Format search results for the LLM."
  [{:keys [data total_count]}]
  (let [results-xml (llm-rep/search-results->xml data)]
    (format-with-instructions
     (str results-xml "\n\nTotal results: " total_count)
     instructions/search-result-instructions)))

(defn- format-entity-result
  "Format entity details (table, model, metric, etc.) for the LLM."
  [structured]
  (let [entity-xml (llm-rep/entity->xml structured)]
    (format-with-instructions entity-xml instructions/entity-metadata-instructions)))

(defn- format-answer-sources-result
  "Format answer sources (metrics and models list) for the LLM.
  Uses <metabase-models> tag to match Python AI Service exactly."
  [{:keys [metrics models]}]
  (let [content (str (when (seq metrics)
                       (str "<metrics>\n"
                            (str/join "\n" (map llm-rep/metric->xml metrics))
                            "\n</metrics>\n"))
                     (when (seq models)
                       (str "<metabase-models>\n"
                            (str/join "\n" (map llm-rep/model->xml models))
                            "\n</metabase-models>")))]
    (format-with-instructions content instructions/answer-sources-instructions)))

(defn- get-structured-output
  "Extract structured output from result, handling both key formats.
  Tools may use :structured-output (hyphen, Clojure idiomatic) or
  :structured_output (underscore, from JSON/API responses)."
  [result]
  (or (:structured-output result)
      (:structured_output result)))

(defn- normalize-entity-type
  "Normalize entity type to keyword."
  [type-val]
  (cond
    (keyword? type-val) type-val
    (string? type-val) (keyword type-val)
    :else nil))

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
      (cond
        ;; Search results - has :data and :total_count
        (and (:data structured) (:total_count structured))
        (format-search-result structured)

        ;; Answer sources - has :metrics and :models
        (and (contains? structured :metrics) (contains? structured :models))
        (format-answer-sources-result structured)

        ;; Query results (from query_model, query_metric, etc.)
        (and (:query-id structured) (:query structured))
        (format-query-result structured)

        ;; Chart results (from create_chart, edit_chart)
        (:chart-id structured)
        (format-chart-result structured)

        ;; Entity details (table, model, metric) - has :type
        (#{:table :model :metric :question :user :dashboard} (normalize-entity-type (:type structured)))
        (format-entity-result (assoc structured :type (normalize-entity-type (:type structured))))

        ;; Fallback with instructions if present in the result
        (:instructions structured)
        (format-with-instructions (pr-str (dissoc structured :instructions))
                                  (:instructions structured))

        ;; Generic structured output - just stringify it
        :else
        (pr-str structured)))

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
