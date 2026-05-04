(ns metabase-enterprise.metabot-analytics.queries
  "Extracts the queries metabot generated during a conversation, for the
  conversation detail endpoint. One row per successful query-construction
  tool call."
  (:require
   [metabase.driver.util :as driver.u]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- tool-output->structured
  "Pull `:structured-output` (or its snake-case alias) out of a persisted
  `tool-output` block's `:result`. Returns nil if the result lacks structured
  data — that signals a tool that errored out before validating."
  [result]
  (when (map? result)
    (or (:structured-output result) (:structured_output result))))

(defn- referenced-table-names
  "Use Macaw to extract distinct referenced table names from a SQL string.
  Returns `[]` on parse failure or when the database id can't be resolved
  to a driver — we degrade gracefully so the SQL still renders without a
  Tables line."
  [database-id sql]
  (if (and database-id (seq sql))
    (try
      (let [driver (driver.u/database->driver database-id)
            refs   (sql-tools/referenced-tables-raw driver sql)]
        (->> refs (map :table) (remove nil?) distinct vec))
      (catch Throwable e
        (log/warn e "Failed to extract referenced tables from generated SQL")
        []))
    []))

(defn- query-generation-tool?
  "True when `tool-name` is one of the metabot tools that emits a query."
  [tool-name]
  (contains? metabot.tools/query-generation-tool-names tool-name))

(defn- notebook-tool?
  "True when `tool-name` is the notebook-query construction tool."
  [tool-name]
  (= tool-name "construct_notebook_query"))

(defn- successful-tool-output?
  "True when `output-block` exists, is not marked errored, and carries
   structured output."
  [output-block]
  (and output-block
       (not (:error output-block))
       (tool-output->structured (:result output-block))))

(defn- sql-for-tool-call
  "Best-effort SQL text for a successful SQL tool call. Prefer the structured
   output's final query text; for create/replace we can fall back to input args.
   Edit tool only persists diffs in input, so no fallback there."
  [tool-name arguments structured]
  (or (:query-content structured)
      (case tool-name
        "create_sql_query"  (:sql_query arguments)
        "replace_sql_query" (:new_query arguments)
        nil)))

(defn- sql-query-row
  [{:keys [message-id]} tool-name input-block structured database-id]
  (let [sql (sql-for-tool-call tool-name (:arguments input-block) structured)]
    {:tool        tool-name
     :call_id     (:id input-block)
     :message_id  message-id
     :query_id    (:query-id structured)
     :query_type  "sql"
     :sql         sql
     :mbql        nil
     :display     nil
     :database_id database-id
     :tables      (referenced-table-names database-id sql)}))

(defn- notebook-query-row
  [{:keys [message-id]} tool-name input-block structured query database-id]
  (let [chart-type (:chart-type structured)]
    {:tool        tool-name
     :call_id     (:id input-block)
     :message_id  message-id
     :query_id    (:query-id structured)
     :query_type  "notebook"
     :sql         nil
     :mbql        query
     :display     (some-> chart-type name)
     :database_id database-id
     :tables      []}))

(defn- query-block-pair->row
  "Build a generated-query row from an in-app metabot tool-input/tool-output
  pair. Returns nil for tools we don't track or for failed/missing outputs
  (errored rows are filtered out at the source — v1 doesn't render them)."
  [{:keys [message-id]} input-block output-block]
  (let [tool-name (:function input-block)]
    (when (and (query-generation-tool? tool-name)
               (successful-tool-output? output-block))
      (let [structured  (tool-output->structured (:result output-block))
            query       (:query structured)
            database-id (or (:database structured) (:database query))]
        (if (notebook-tool? tool-name)
          (notebook-query-row {:message-id message-id} tool-name input-block structured query database-id)
          (sql-query-row {:message-id message-id} tool-name input-block structured database-id))))))

(defn- message->generated-queries
  "Extract generated-query rows from a single `MetabotMessage`. Pairs each
  `tool-input` block with its matching `tool-output` block by `:id`."
  [message]
  (let [blocks        (:data message)
        outputs-by-id (->> blocks
                           (filter #(= "tool-output" (:type %)))
                           (into {} (map (juxt :id identity))))
        ctx           {:message-id (:id message)}]
    (into []
          (comp (filter #(= "tool-input" (:type %)))
                (keep #(query-block-pair->row ctx % (get outputs-by-id (:id %)))))
          blocks)))

(defn messages->generated-queries
  "Walk a seq of `MetabotMessage` instances and return a flat vector of
  generated-query rows in chronological/insertion order, one per
  query-construction tool call. Failed and slackbot-shape blocks are
  filtered out."
  [messages]
  (into [] (mapcat message->generated-queries) messages))

(def new-query-tool-names
  "Tools that construct a fresh query. Excludes `edit_sql_query` and
   `replace_sql_query`, which refine an existing query rather than create
   a new one."
  #{"create_sql_query" "construct_notebook_query"})

(defn- tool-input-block? [block tool-names]
  (and (= "tool-input" (:type block))
       (if (set? tool-names)
         (contains? tool-names (:function block))
         (= tool-names (:function block)))))

(defn count-tool-invocations
  "Count `tool-input` blocks across a seq of `MetabotMessage` instances.
   `tool-names` may be a single tool-name string or a set of tool-name
   strings — a block counts if its `:function` matches."
  [messages tool-names]
  (transduce
   (comp (mapcat :data)
         (filter #(tool-input-block? % tool-names)))
   (completing (fn [acc _] (inc acc)))
   0
   messages))
