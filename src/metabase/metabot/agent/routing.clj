(ns metabase.metabot.agent.routing
  "Pre-turn routing: a System One model reads the user's latest prompt and decides which tools and skills the agent
  gets this turn, so the agent neither sees tools it won't need nor spends iterations loading skills."
  (:require
   [clojure.string :as str]
   [metabase.ai-tracing.core :as ait]
   [metabase.metabot.agent.timing :as timing]
   [metabase.metabot.agent.user-context :as user-context]
   [metabase.metabot.self.system-one :as s1]
   [metabase.metabot.skills :as skills]
   [metabase.metabot.tools :as tools]
   [metabase.util.log :as log]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(def ^:private threshold 0.3)

(def ^:private history-limit 6)

(def ^:private data-lookup-threshold 0.5)

(def ^:private questions
  {:intent-modify-previous-query
   (s1/noul "`prompt` asks to change which data an existing query returns, where that query is already in `state` or `conversation-history`."
            {:true  "Changing filters, groupings, columns, calculations, sorting, or limits of a query the user already has. Example: \"group it by year instead\", \"only pro customers\""
             :false "There is no existing query, the user wants an unrelated new query, or only the chart's appearance changes. Example: \"make this a pie chart\""})

   :intent-find-or-create-query
   (s1/noul "`prompt` asks for data that isn't already shown in `state` or `conversation-history`, which the agent would answer by finding a saved question or building a new query."
            {:true  "A new question about the data, or a request for a specific saved report or dashboard. Example: \"show me orders over time\", \"find the success overview dashboard\""
             :false "The request is about a query or chart already in the conversation, or isn't asking for data at all. Example: \"group it by year instead\", \"thanks!\""})

   :intent-read-resource
   (s1/noul "`prompt` asks about the structure or definition of specific items in this Metabase rather than for data: a table's columns, a model's or metric's definition, a dashboard's cards, or which databases and tables exist."
            {:true  "Example: \"what columns does the orders table have?\", \"what data sources are available?\", \"how is the revenue metric defined?\""
             :false "The user wants query results or a change to a chart, not a description of the items themselves."})

   :intent-analyze-results
   (s1/noul "`prompt` asks to explain or interpret results that are already in `state` or `conversation-history`: trends, anomalies, comparisons, or why something changed."
            {:true  "Example: \"analyze this chart\", \"why is conversion trending down?\", \"what stands out here?\""
             :false "The user wants new or different data, or a change to how results are displayed."})

   :intent-update-visualization
   (s1/noul "`prompt` asks to change how existing results look without changing the underlying query: chart type, axes, colors, labels, or formatting."
            {:true  "Example: \"make this a pie chart\", \"change the vertical axis to log\", \"use percentages on the labels\""
             :false "The user wants different data (new filters, groupings, or columns), or there is no existing chart in `state` or `conversation-history`."})

   :intent-needs-reasoning
   (s1/noul "`prompt` is an open-ended or multi-step request that an agent would need to plan through, rather than one direct action on data, a query, or a chart."
            {:true  "Several dependent steps, an ambiguous goal, or something outside querying and charting. Example: \"help me migrate from full app embedding to modular embedding\", \"which tools do you have access to?\""
             :false "A single clear request to fetch, change, describe, or explain data or a chart. Example: \"show me orders over time\""})

   :mentions-sql
   (s1/noul "`prompt` explicitly asks for SQL, a native query, or raw query code, or refers to SQL shown in `state` or `conversation-history`."
            {:true  "Example: \"write me SQL for monthly churn\", \"fix this SQL\", \"add a WHERE clause for test accounts\""
             :false "The user describes the data they want without asking for SQL. Example: \"show me orders over time\""})

   :needs-calculation
   (s1/noul "Handling `prompt` needs an aggregation beyond a plain count or listing, a filter comparison, a calculated expression, or grouping by a date unit."
            {:true  "Averages, distinct counts, percentiles, \"between\", \"contains\", \"is empty\", relative dates, grouping by week, month, or quarter. Example: \"average order value by month\", \"customers who signed up in the last 30 days\", \"orders over time\""
             :false "A plain count or list of rows, or no query change at all. Example: \"show me the orders table\""})

   :needs-multiple-sources
   (s1/noul "Handling `prompt` combines data from more than one kind of record, builds on an existing saved question, model, metric, or segment, or needs multi-step logic."
            {:true  "Connecting two or more tables, aggregating an aggregate (\"average of monthly totals\"), or comparing against a subset. Example: \"revenue per customer segment using the accounts table\", \"of the top 10 products, which had the most returns?\""
             :false "The request fits in one table with one set of filters and summaries. Example: \"show me orders over time\""})

   :rewrites-most-of-query
   (s1/noul "`prompt` asks to change an existing query in `state` or `conversation-history` so much that little of the original would survive."
            {:true  "A different question entirely, or a change touching most clauses. Example: \"scrap this and show retention cohorts instead\""
             :false "There is no existing query, or the change is local: one filter, column, grouping, sort, or fix. Example: \"also exclude test accounts\""})

   :needs-data-lookup
   (s1/noul "Answering `prompt` needs data sources (tables, models, metrics, or saved questions) other than those in `state.known_data_sources` or shown in `state.viewing`."
            {:true  "It asks about a subject none of the known or viewed data sources cover, or none are known yet. Example: \"show me orders over time\" when no data sources are known, or \"now show me product reviews\" when only an orders table is known."
             :false "It can be answered from the known or viewed data sources, or doesn't need data at all. Example: \"group it by year instead\" after a query on orders, \"make it a bar chart\", \"thanks!\""})

   :needs-external-info
   (s1/noul "Answering `prompt` needs information that lives outside this Metabase instance and its data: public facts, current events, industry benchmarks, or third-party documentation."
            {:true  "Example: \"how does our churn compare to typical SaaS churn?\", \"what's the current EUR/USD rate?\""
             :false "Everything needed is in the user's data, this conversation, or general knowledge about how to analyze data."})

   :answer-is-the-chart
   (s1/noul "The chart or table answering `prompt` is the whole answer: the user asked to see data, not to have it explained, compared, or qualified in prose."
            {:true  "A direct request to see or shape data, where the result speaks for itself. Example: \"show me orders over time\", \"which drivers won a race in 2024?\", \"top 10 products by sales\""
             :false "The user asks why, whether, or how, or wants an interpretation, recommendation, or caveat that only prose can give. Example: \"why is churn up?\", \"is this normal?\", \"what should I look at next?\""})

   :single-chart-suffices
   (s1/noul "One chart or table answers `prompt` completely, without several separate queries, a dashboard, or a sequence of steps."
            {:true  "One result set answers it. Example: \"revenue by month\", \"how many drivers are in the database?\""
             :false "It asks for several different cuts of the data, a dashboard, or a multi-step investigation. Example: \"build me a sales dashboard\", \"compare these three segments across four metrics\""})

   :needs-clarification
   (s1/noul "`prompt` cannot be acted on until the user answers a question back: a choice that decides what to build is genuinely undecidable from the prompt and `conversation-history`."
            {:true  "No reasonable default exists, so the agent has to ask. Example: \"show me the best ones\" with no measure named, \"how did we do?\", \"fix it\""
             :false "It can be built now with a sensible default, even where some detail is implied rather than spelled out. Example: \"show me orders over time\", \"which drivers won a race in 2024?\", \"top 10 customers by total spend\""})})

(def ^:private intents
  [:intent-find-or-create-query
   :intent-modify-previous-query
   :intent-read-resource
   :intent-analyze-results
   :intent-update-visualization
   :intent-needs-reasoning])

(def ^:private intent->skills
  {:intent-find-or-create-query  #{:read-resource :query-language}
   :intent-modify-previous-query #{:query-language}
   :intent-read-resource         #{:read-resource}
   :intent-update-visualization  #{:edit-chart}})

(def ^:private intent->tools
  {:intent-find-or-create-query  #{"search" "retrieve_library_entities" "run_query" "create_chart" :query-language}
   :intent-modify-previous-query #{"run_query" "create_chart" :query-language}
   :intent-read-resource         #{"search" "retrieve_library_entities" "list_available_data_sources" "list_available_fields"}
   :intent-analyze-results       #{"analyze_chart"}
   :intent-update-visualization  #{"edit_chart"}})

(defn- yes? [answers k]
  (>= (get-in answers [k :noul] 0) threshold))

(defn- follow-up-edit?
  "Whether the turn only changes a chart the conversation already has — its data or its appearance —
  rather than asking for something new."
  [answers]
  (and (or (yes? answers :intent-modify-previous-query)
           (yes? answers :intent-update-visualization))
       (not (yes? answers :intent-find-or-create-query))))

(defn possible-intents
  "The intents in `answers` at or above the routing threshold, most likely first."
  [answers]
  (->> intents
       (filter #(yes? answers %))
       (sort-by #(get-in answers [% :noul]) >)
       vec))

(def ^:private sql-tool-names #{"create_sql_query" "edit_sql_query" "replace_sql_query"})

(defn- query-plan
  "How a query-language intent resolves: `:notebook`, `:new-sql`, `:rewrite-sql`, or `:edit-sql`."
  [answers intents {:keys [sql-editor? available-tools]}]
  (cond
    (not (and (some sql-tool-names available-tools)
              (or (yes? answers :mentions-sql) sql-editor?)))
    :notebook

    (some #{:intent-find-or-create-query} intents) :new-sql
    (yes? answers :rewrites-most-of-query)         :rewrite-sql
    :else                                          :edit-sql))

(defn skills-to-load
  "Skill ids the agent needs for `answers`. `facts` are what code already knows about the request."
  [answers facts]
  (let [intents (possible-intents answers)
        base    (into #{} (mapcat intent->skills) intents)]
    (cond-> (disj base :query-language)
      (base :query-language)
      (into (case (query-plan answers intents facts)
              :notebook    (cond-> [:construct-notebook-query-core]
                             (yes? answers :needs-calculation)      (conj :construct-notebook-query-operators)
                             (yes? answers :needs-multiple-sources) (conj :construct-notebook-query-advanced))
              :new-sql     [:create-sql-query]
              :rewrite-sql [:replace-sql-query]
              :edit-sql    [:edit-sql-query]))

      (yes? answers :needs-external-info)
      (conj :web-search))))

(defn tools-to-call
  "Tool names the agent needs for `answers`. `facts` are what code already knows about the request."
  [answers facts]
  (let [intents (possible-intents answers)
        base    (into #{"read_resource"} (mapcat intent->tools) intents)]
    (cond-> (disj base :query-language)
      (base :query-language)
      (conj (case (query-plan answers intents facts)
              :notebook    "construct_notebook_query"
              :new-sql     "create_sql_query"
              :rewrite-sql "replace_sql_query"
              :edit-sql    "edit_sql_query"))

      (yes? answers :needs-external-info)
      (into ["web_search" "read_web_page"]))))

(defn limit-tools
  "`tools` (tool name -> tool) narrowed to `tool-names`, the tools `skill-ids` are about, and `load_skill` when
  `context` preloads a SQL dialect skill through a synthetic `load_skill` call."
  [tools tool-names skill-ids context]
  (let [skill-tools (mapcat (comp :tools skills/get-skill) skill-ids)
        dialect?    (some? (skills/dialect-skill (user-context/extract-sql-dialect context)))]
    (cond-> (select-keys tools (into (set tool-names) skill-tools))
      dialect? (assoc "load_skill" #'tools/load-skill-tool))))

(defn- message-text [{:keys [content]}]
  (if (string? content)
    content
    (str/join "\n" (keep :text content))))

(defn- text-turns [messages]
  (->> messages
       (filter (comp #{:user :assistant} :role))
       (keep (fn [m]
               (when-let [text (not-empty (str/trim (message-text m)))]
                 {:role (name (:role m)) :message text})))))

(defn latest-prompt
  "The text of the latest user message in `messages` that has any, or nil."
  [messages]
  (:message (last (filter (comp #{"user"} :role) (text-turns messages)))))

(defn- routing-input
  "The state the System One model reads: the latest user prompt, recent text turns, what the user is viewing, and the
  data sources the conversation already knows."
  [messages context known-data-sources]
  (let [texts  (text-turns messages)
        prompt (last (filter (comp #{"user"} :role) texts))]
    (when prompt
      {:prompt               (:message prompt)
       :conversation-history (vec (take-last history-limit (butlast texts)))
       :state                {:viewing            (not-empty (user-context/format-viewing-context context))
                              :known_data_sources (vec known-data-sources)}})))

(defn route
  "Route the latest user turn in `messages` for an agent offered `available-tools` (tool names). Returns
  `{:intents :skills :tools :escalate? :needs-data-lookup? :chart-is-the-answer?}`, where `:skills` are skill ids and
  `:tools` tool names; `:chart-is-the-answer?` that producing the chart ends the turn;
  `:escalate?` means the agent should keep its full tool set, as when no intent applies or none of the tools an intent
  needs are available, and `:needs-data-lookup?` that the prompt needs data sources beyond `:known-data-sources`
  and the viewing context. Returns nil when no System One model is configured, there is no user prompt, or the
  request fails.

  `opts`:
    - `:known-data-sources` — the data sources the conversation already knows, as maps the model reads.
    - `:tracking-opts`      — how the System One call is recorded in usage analytics, as for [[s1/ask]]."
  [messages context available-tools {:keys [known-data-sources tracking-opts]}]
  (when (s1/available?)
    (when-let [input (routing-input messages context known-data-sources)]
      (with-span :info {:name :metabot.agent/routing}
        (ait/eval-span "agent.routing" {}
                       (timing/timed {:kind :routing}
                                     (try
                                       (let [answers (:answers (s1/ask input questions {:tracking-opts (assoc tracking-opts :tag "routing")}))
                                             facts   {:sql-editor?     (some? (user-context/extract-sql-dialect context))
                                                      :available-tools (set available-tools)}
                                             intents (possible-intents answers)
                                             tools   (tools-to-call answers facts)]
                                         {:intents            intents
                                          :skills             (skills-to-load answers facts)
                                          :tools              tools
                                          :escalate?          (or (empty? intents)
                                                                  (yes? answers :intent-needs-reasoning)
                                                                  (not-any? (disj (set available-tools) "read_resource") tools))
                                          :needs-data-lookup? (>= (get-in answers [:needs-data-lookup :noul] 0) data-lookup-threshold)
                                          ;; The turn can stop as soon as it has a chart: no prose is owed, so the closing
                                          ;; text-only completion is dead weight. A follow-up that edits the chart already in
                                          ;; hand qualifies on its own — the edit is the whole reply.
                                          ;; A follow-up edit needs no clarification gate: the turn only ends on a *successful*
                                          ;; chart tool call, so a turn that has to ask the user something never triggers it.
                                          :chart-is-the-answer? (and (not (yes? answers :intent-analyze-results))
                                                                     (or (follow-up-edit? answers)
                                                                         (and (yes? answers :answer-is-the-chart)
                                                                              (yes? answers :single-chart-suffices)
                                                                              (not (yes? answers :needs-clarification)))))})
                                       (catch Exception e
                                         (log/warn e "Metabot routing failed; running the agent unrouted")
                                         nil))))))))

(comment
  ;; NOTE:
  ;; [ ] problem: agent can't know what the user's content is... so we'll never know if we can find the content vs. create a query
  ;; [/] :action => :action it should be about what the the code does next
  ;; [ ] avoid the choice thing... we should build things around nouls instead and then aggregate them together

  (defn classify [state] (s1/ask state
                                 {:action (s1/choice
                                           "Classify the primary goal of this user's prompt in the context of a BI tool's AI agent's next action"
                                           {:modify "Prompt requires the creation of a new SQL query of modifying an existing query"
                                            :find-or-create-query "Create a new analytics query or find an existing one"
                                            :discover-data "Find tables, fields, relationships"
                                            :analyze-results "Explain charts, results, anomalies"
                                            :visualization "Modify the chart type, axes, colors, formatting without modifying the underlying query"
                                            :other "Catchall fallback, we don't know what do classify this request as"
                                            ;;:user-clarifcation-or-correction "User is correcting the agent or teaching it about something the agent was unaware of"
                                            ;; :product-help "User has a question about the business intelligence platform itself"
                                            ;; :fix-query           ; SQL errors, incorrect results, performance
                                            ;; :modify-query        ; Filters, grouping, columns, calculations
                                            ;; :transform-data      ; Create/edit/debug SQL or Python transforms
                                            ;; :assistant-meta      ; Capabilities, model, tools, context
                                            ;; :find-content        ; Locate existing questions/models/dashboards
                                            ;; :provide-context     ; Supply facts, examples, or select a source
                                            ;; :dashboard           ; Create/edit dashboards
                                            ;; :write-content       ; Prose, jokes, documents, creative content
                                            ;; :manage-content      ; Save, rename, organize, import/export
                                            ;; :notifications       ; Alerts, subscriptions, recurring delivery
                                            ;; :explain-code        ; Explain SQL/code without changing it
                                            })}))

  (route [{:role :user :content "show me orders over time"}] {} ["search" "read_resource" "construct_notebook_query"] {})

  (defn testing [expected prompt] (assert (= expected (-> (classify prompt)
                                                          s1/values
                                                          :action))))

  (defn is-confident [confidence] (>= confidence 0.9))
  (defn reasonable-possibilities [options] (filter #(>= (second %) 0.2) options))
  (defn possible-paths [result]
    (if
     ;; handle :other case(s)
     (is-confident (:confidence (:action result))) [(:choice (:action result))]
     (mapv first (reasonable-possibilities (s1/ranked (:action result))))))

  ;; (defn jev-act [state paths]
  ;;   (if (= (count paths) 1)
  ;;     nil ;; auto-follow path
  ;;     nil ;; defer to outer agent
  ;;     ))

  (possible-paths (:answers (classify "make this a pie chart")))
  (possible-paths (:answers (classify "Show me orders over time")))

  ;; :always
  ;; (s1/ranked (:action (:answers (classify "read_resource: Read Metabase resources by URI, including databases, collections, tables, fields, models, questions, metrics, measures, segments, transforms, dashboards, documents, and conversation charts or")))

  ;; :analyze-results
  ;; (s1/ranked (:action (:answers (classify "analyze_chart: Compute statistics and generate context for analyzing trends, outliers, volatility, and patterns in a chart from the user's current viewing context.")))

  ;; :find-existing-analytics-content
  ;; (s1/ranked (:action (:answers (classify "search: Find tables, models, metrics, dashboards, documents, and saved questions by topic across the instance.")))
  ;; (s1/ranked (:action (:answers (classify "queries. Supports up to five URIs per call and paginated listings.")))

  ;; :create-or-modify-query
  ;; (s1/ranked (:action (:answers (classify "construct_notebook_query: Construct and visualize a notebook query from a metric, model, or table using an MBQL 5 query, title, description, and visualization settings.")))
  ;; (s1/ranked (:action (:answers (classify "create_chart: Create a chart from a query ID, specifying its visualization type, title, and description.")))
  ;; (s1/ranked (:action (:answers (classify "edit_chart: Change an existing chart's visualization type and provide its title and description.")))
  ;; (s1/ranked (:action (:answers (classify "create_sql_query: Create a new SQL query with a short, human-friendly title shown above the results.")))
  ;; (s1/ranked (:action (:answers (classify "edit_sql_query: Edit an existing SQL query using structured edits, with a title shown above the results.")))
  ;; (s1/ranked (:action (:answers (classify "replace_sql_query: Replace the SQL content of an existing query entirely, with a title shown above the results.")))
  ;; (s1/ranked (:action (:answers (classify "run_query: Execute a conversation query, an MBQL 5 query, or SQL against a database and return rows for the agent to inspect. Nothing is displayed to the user. Available when Metabot query execution is enabled.")))
  ;; (s1/ranked (:action (:answers (classify "save_entity: Save a previously created chart into a collection, dashboard, or document when the user explicitly requests it, returning a link to the saved content.")))

  ;; :other
  ;; (s1/ranked (:action (:answers (classify "create_dashboard_subscription: Create a scheduled dashboard subscription delivered to a Slack channel. Requires Slack to be connected; email delivery is not supported.")))
  ;; (s1/ranked (:action (:answers (classify "create_autogenerated_dashboard: Generate an X-ray dashboard containing multiple visualizations from a table, model, metric, conversation query, or existing question.")))
  ;; (s1/ranked (:action (:answers (classify "web_search: Search the public internet for information outside the Metabase instance, returning titles, URLs, and snippets. Available when Metabot web search is enabled.")))
  ;; (s1/ranked (:action (:answers (classify "read_web_page: Fetch up to three public HTTPS pages and extract their main text, capped at about 8,000 characters per page. Available when Metabot web search is enabled.")))

  ;; question relies on historical conversation data?
  ;; (s1/ranked (:action (:answers (classify "conversation_search: Find relevant passages in the user's past NLQ/internal conversations using keywords and semantic matching; optionally narrow to a specific conversation.")))
  ;; (s1/ranked (:action (:answers (classify "recent_chats: Find the user's past NLQ/internal chats by time, newest first, with date filtering and pagination.")))
  ;; (s1/ranked (:action (:answers (classify "read_conversation: Read a passage from a past conversation, with pagination and links to artifacts that can be opened using read_resource.")))

  ;; replace: could be solved with _____ mcp client / skill
  ;; (s1/ranked (:action (:answers (classify "load_mcp_tools: Load descriptions and parameter schemas for selected connected external MCP tools so the agent can call them. Available when external MCP tools are connected and permitted.")))
  ;; (s1/ranked (:action (:answers (classify "load_skill: Load the full instructions for one or more available skills immediately before doing the related work.")))

  (do (testing :other "yes this is fine")
      (testing :other "this is great! ty")
      (testing :other "which tools do you have access to?")
      (testing :visualization "make this a pie chart")
      (testing :visualization "change the vertical axis to log")
      (testing :find-existing-analytics-content "find success overview dashboard")
      (testing :find-existing-analytics-content "i'm looking for a report i did about cities of customers")
      (testing :other "how do I connect to a database?")
      (testing :other "can you help with migrating from full app embedding to modular embedding.")
      (testing :analyze-results "Analyze this chart")
      (testing :analyze-results "Why is conversion rate trending down?")
      (testing :discover-data "Agent: I couldn't find a field for the max number of users\nUser: The field name is literally \"Max No. of Users\"")
      (testing :discover-data "The table is in the staging database")
      (testing :discover-data "What columns does the orders table have?")
      (testing :discover-data "what data sources are available?")
      (testing :create-or-modify-query "can you change this query so that I only see retention info for pro cloud customers")
      (testing :create-or-modify-query "User show me orders over time\nAgent:Here's a new question called orders over time.\nUser: group it by year instead")
      (testing :create-or-modify-query "Top 10 repositories by number of pull requests")
      (testing :create-or-modify-query "how many customers that were on a starter plan have churned in november?"))

  (s1/values r)                          ;; => {:urgent 0.92, :topic :billing, :anger 1.6}
  ;; => [[:billing 0.85] [:technical 0.1] ...]
  (comment))
