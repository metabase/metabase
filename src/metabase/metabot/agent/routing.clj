(ns metabase.metabot.agent.routing
  "Pre-turn routing: a System One model reads the user's latest prompt and decides which tools and skills the agent
  gets this turn, so the agent neither sees tools it won't need nor spends iterations loading skills."
  (:require
   [clojure.string :as str]
   [metabase.ai-tracing.core :as ait]
   [metabase.jev.client :as jev]
   [metabase.metabot.agent.timing :as timing]
   [metabase.metabot.agent.user-context :as user-context]
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
   (jev/noul "`prompt` asks to change which data an existing query returns, where that query is already in `state` or `conversation-history`."
             {:true  "Changing filters, groupings, columns, calculations, sorting, or limits of a query the user already has. Example: \"group it by year instead\", \"only pro customers\""
              :false "There is no existing query, the user wants an unrelated new query, or only the chart's appearance changes. Example: \"make this a pie chart\""})

   :intent-find-or-create-query
   (jev/noul "`prompt` asks for data that isn't already shown in `state` or `conversation-history`, which the agent would answer by finding a saved question or building a new query."
             {:true  "A new question about the data, or a request for a specific saved report or dashboard. Example: \"show me orders over time\", \"find the success overview dashboard\""
              :false "The request is about a query or chart already in the conversation, or isn't asking for data at all. Example: \"group it by year instead\", \"thanks!\""})

   :intent-read-resource
   (jev/noul "`prompt` asks about the structure or definition of specific items in this Metabase rather than for data: a table's columns, a model's or metric's definition, a dashboard's cards, or which databases and tables exist."
             {:true  "Example: \"what columns does the orders table have?\", \"what data sources are available?\", \"how is the revenue metric defined?\""
              :false "The user wants query results or a change to a chart, not a description of the items themselves."})

   :intent-analyze-results
   (jev/noul "`prompt` asks to explain or interpret results that are already in `state` or `conversation-history`: trends, anomalies, comparisons, or why something changed."
             {:true  "Example: \"analyze this chart\", \"why is conversion trending down?\", \"what stands out here?\""
              :false "The user wants new or different data, or a change to how results are displayed."})

   :intent-update-visualization
   (jev/noul "`prompt` asks to change how existing results look without changing the underlying query: chart type, axes, colors, labels, or formatting."
             {:true  "Example: \"make this a pie chart\", \"change the vertical axis to log\", \"use percentages on the labels\""
              :false "The user wants different data (new filters, groupings, or columns), or there is no existing chart in `state` or `conversation-history`."})

   :intent-needs-reasoning
   (jev/noul "`prompt` is an open-ended or multi-step request that an agent would need to plan through, rather than one direct action on data, a query, or a chart."
             {:true  "Several dependent steps, an ambiguous goal, or something outside querying and charting. Example: \"help me migrate from full app embedding to modular embedding\", \"which tools do you have access to?\""
              :false "A single clear request to fetch, change, describe, or explain data or a chart. Example: \"show me orders over time\""})

   :mentions-sql
   (jev/noul "`prompt` explicitly asks for SQL, a native query, or raw query code, or refers to SQL shown in `state` or `conversation-history`."
             {:true  "Example: \"write me SQL for monthly churn\", \"fix this SQL\", \"add a WHERE clause for test accounts\""
              :false "The user describes the data they want without asking for SQL. Example: \"show me orders over time\""})

   :needs-calculation
   (jev/noul "Handling `prompt` needs an aggregation beyond a plain count or listing, a filter comparison, a calculated expression, or grouping by a date unit."
             {:true  "Averages, distinct counts, percentiles, \"between\", \"contains\", \"is empty\", relative dates, grouping by week, month, or quarter. Example: \"average order value by month\", \"customers who signed up in the last 30 days\", \"orders over time\""
              :false "A plain count or list of rows, or no query change at all. Example: \"show me the orders table\""})

   :needs-multiple-sources
   (jev/noul "Handling `prompt` combines data from more than one kind of record, builds on an existing saved question, model, metric, or segment, or needs multi-step logic."
             {:true  "Connecting two or more tables, aggregating an aggregate (\"average of monthly totals\"), or comparing against a subset. Example: \"revenue per customer segment using the accounts table\", \"of the top 10 products, which had the most returns?\""
              :false "The request fits in one table with one set of filters and summaries. Example: \"show me orders over time\""})

   :rewrites-most-of-query
   (jev/noul "`prompt` asks to change an existing query in `state` or `conversation-history` so much that little of the original would survive."
             {:true  "A different question entirely, or a change touching most clauses. Example: \"scrap this and show retention cohorts instead\""
              :false "There is no existing query, or the change is local: one filter, column, grouping, sort, or fix. Example: \"also exclude test accounts\""})

   :needs-data-lookup
   (jev/noul "Answering `prompt` needs data sources (tables, models, metrics, or saved questions) other than those in `state.known_data_sources` or shown in `state.viewing`."
             {:true  "It asks about a subject none of the known or viewed data sources cover, or none are known yet. Example: \"show me orders over time\" when no data sources are known, or \"now show me product reviews\" when only an orders table is known."
              :false "It can be answered from the known or viewed data sources, or doesn't need data at all. Example: \"group it by year instead\" after a query on orders, \"make it a bar chart\", \"thanks!\""})

   :answer-is-the-chart
   (jev/noul "The chart or table answering `prompt` is the whole answer: the user asked to see data, not to have it explained, compared, or qualified in prose."
             {:true  "A direct request to see or shape data, where the result speaks for itself. Example: \"show me orders over time\", \"which drivers won a race in 2024?\", \"top 10 products by sales\""
              :false "The user asks why, whether, or how, or wants an interpretation, recommendation, or caveat that only prose can give. Example: \"why is churn up?\", \"is this normal?\", \"what should I look at next?\""})

   :single-chart-suffices
   (jev/noul "One chart or table answers `prompt` completely, without several separate queries, a dashboard, or a sequence of steps."
             {:true  "One result set answers it. Example: \"revenue by month\", \"how many drivers are in the database?\""
              :false "It asks for several different cuts of the data, a dashboard, or a multi-step investigation. Example: \"build me a sales dashboard\", \"compare these three segments across four metrics\""})

   :needs-clarification
   (jev/noul "`prompt` cannot be acted on until the user answers a question back: a choice that decides what to build is genuinely undecidable from the prompt and `conversation-history`."
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
  {:intent-find-or-create-query  #{"search" "retrieve_library_entities" "create_chart" :query-language}
   :intent-modify-previous-query #{"create_chart" :query-language}
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
              :edit-sql    [:edit-sql-query])))))

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
              :edit-sql    "edit_sql_query")))))

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
  "The latest user prompt, recent text turns, what the user is viewing, and the data sources the conversation
  already knows."
  [messages context known-data-sources]
  (let [texts  (text-turns messages)
        prompt (last (filter (comp #{"user"} :role) texts))]
    (when prompt
      {:prompt               (:message prompt)
       :conversation-history (vec (take-last history-limit (butlast texts)))
       :state                {:viewing            (not-empty (user-context/format-viewing-context context))
                              :known_data_sources (vec known-data-sources)}})))

(defn- routing-decision [answers context available-tools]
  (let [facts   {:sql-editor?     (some? (user-context/extract-sql-dialect context))
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
     ;; The turn can stop as soon as it has a chart: no prose is owed, so the closing text-only completion is
     ;; dead weight. A follow-up that edits the chart already in hand qualifies on its own — the edit is the
     ;; whole reply — and needs no clarification gate: the turn only ends on a *successful* chart tool call,
     ;; so a turn that has to ask the user something never triggers it.
     :chart-is-the-answer? (and (not (yes? answers :intent-analyze-results))
                                (or (follow-up-edit? answers)
                                    (and (yes? answers :answer-is-the-chart)
                                         (yes? answers :single-chart-suffices)
                                         (not (yes? answers :needs-clarification)))))}))

(defn route
  "Choose tools and skills for the latest user turn. Returns
  `{:intents :skills :tools :escalate? :needs-data-lookup? :chart-is-the-answer?}`, or nil when Jev is
  unavailable or fails. An `:escalate?` result keeps the profile's full tool set; `:needs-data-lookup?` means the
  prompt needs data sources beyond `:known-data-sources` and the viewing context; `:chart-is-the-answer?` that
  producing the chart ends the turn.

  `opts`:
    - `:known-data-sources` — the data sources the conversation already knows, as maps the model reads."
  ([messages context available-tools]
   (route messages context available-tools {}))
  ([messages context available-tools {:keys [known-data-sources]}]
   (when (jev/key-present?)
     (when-let [input (routing-input messages context known-data-sources)]
       (with-span :info {:name :metabot.agent/routing}
         (ait/eval-span "agent.routing" {}
                        (timing/timed {:kind :routing}
                                      (try
                                        (let [{:keys [ok answers error]} (jev/ask input questions {:timeout-ms 5000})]
                                          (if ok
                                            (routing-decision answers context available-tools)
                                            (log/warn "Metabot routing failed; running the agent unrouted" {:error error})))
                                        (catch Exception e
                                          (log/warn e "Metabot routing failed; running the agent unrouted")
                                          nil)))))))))
