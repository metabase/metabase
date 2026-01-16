(ns metabase-enterprise.metabot-v3.agent.messages
  "Message formatting and history construction for the agent loop."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.prompts :as prompts]
   [metabase-enterprise.metabot-v3.agent.user-context :as user-context]
   [metabase.util.log :as log]))

(defn- format-query-result
  "Format a query result (from query_model, query_metric, etc.) for the LLM.
  Creates an XML-like structure similar to Python ai-service."
  [{:keys [type query-id result-columns]}]
  (str "<query type=\"" (name (or type :query)) "\" id=\"" query-id "\">\n"
       (when (seq result-columns)
         (str "Result columns:\n"
              (str/join "\n" (map (fn [col]
                                    (str "- " (:name col) " (id: " (:id col) ", type: " (:base-type col) ")"))
                                  result-columns))
              "\n"))
       "</query>"))

(defn- format-chart-result
  "Format a chart result for the LLM."
  [{:keys [chart-id query-id chart-type]}]
  (str "<chart id=\"" chart-id "\" type=\"" (name chart-type) "\" query-id=\"" query-id "\">\n"
       "Chart created successfully. Use metabase://chart/" chart-id " to reference this chart.\n"
       "</chart>"))

(defn- format-tool-result
  "Format tool result for LLM consumption.
  Handles both :output (plain string) and :structured-output (structured data)."
  [result]
  (cond
    ;; Plain output string
    (:output result)
    (:output result)

    ;; Structured output - format based on type
    (:structured-output result)
    (let [structured (:structured-output result)]
      (cond
        ;; Query results (from query_model, query_metric, etc.)
        (and (:query-id structured) (:query structured))
        (format-query-result structured)

        ;; Chart results (from create_chart, edit_chart)
        (and (:chart-id structured) (:query-id structured))
        (format-chart-result structured)

        ;; Generic structured output - just stringify it
        :else
        (pr-str structured)))

    ;; Fallback - stringify the whole result
    :else
    (pr-str result)))

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

(defn build-message-history
  "Build full message history for LLM from memory.
  Includes input messages and all steps taken so far."
  [memory]
  (let [input-messages (memory/get-input-messages memory)
        steps (memory/get-steps memory)
        step-messages (mapcat step->messages steps)
        formatted-input (map format-message input-messages)
        result (concat formatted-input step-messages)]
    (log/info "Building message history"
              {:input-message-count (count input-messages)
               :input-messages input-messages
               :formatted-input (vec formatted-input)
               :step-count (count steps)
               :steps steps
               :step-messages (vec step-messages)
               :total-messages (count result)})
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
