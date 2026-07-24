(ns metabase-enterprise.metabot-analytics.queries
  "Extracts the queries metabot generated during a conversation, for the
  conversation detail endpoint. One row per successful query-construction
  tool call."
  (:require
   [metabase.driver.util :as driver.u]
   [metabase.metabot.schema.v2 :as schema.v2]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- tool-part->structured
  "Pull the structured output out of a v2 tool part's `:output`. New writes
  canonicalize the key to `:structured_output`; rows migrated from v1 keep
  their original result map, which may use kebab-case `:structured-output`
  instead. Returns nil if the output lacks structured data — that signals a
  tool that errored out before validating."
  [part]
  (let [output (:output part)]
    (when (map? output)
      (or (:structured_output output) (:structured-output output)))))

(defn- referenced-table-names
  "Extract distinct referenced table names from a SQL string using sql-tools.
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

(defn- successful-tool-part?
  "True when the call resolved successfully and carries structured output."
  [part]
  (and (= "output-available" (:state part))
       (some? (tool-part->structured part))))

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
  [{:keys [message-id]} tool-name part structured database-id]
  (let [sql (sql-for-tool-call tool-name (:input part) structured)]
    {:tool        tool-name
     :call_id     (:toolCallId part)
     :message_id  message-id
     :query_id    (:query-id structured)
     :query_type  "sql"
     :sql         sql
     :mbql        nil
     :display     nil
     :database_id database-id
     :tables      (referenced-table-names database-id sql)}))

(defn- notebook-query-row
  [{:keys [message-id]} tool-name part structured query database-id]
  (let [chart-type (:chart-type structured)]
    {:tool        tool-name
     :call_id     (:toolCallId part)
     :message_id  message-id
     :query_id    (:query-id structured)
     :query_type  "notebook"
     :sql         nil
     :mbql        query
     :display     (some-> chart-type name)
     :database_id database-id
     :tables      []}))

(defn- query-part->row
  "Build a generated-query row from a v2 tool part. Returns nil for tools we
  don't track or for failed/unresolved calls (errored rows are filtered out at
  the source — v1 doesn't render them)."
  [{:keys [message-id]} part]
  (let [tool-name (schema.v2/tool-part-name part)]
    (when (and (query-generation-tool? tool-name)
               (successful-tool-part? part))
      (let [structured  (tool-part->structured part)
            query       (:query structured)
            database-id (or (:database structured) (:database query))]
        (if (notebook-tool? tool-name)
          (notebook-query-row {:message-id message-id} tool-name part structured query database-id)
          (sql-query-row {:message-id message-id} tool-name part structured database-id))))))

(defn- message->generated-queries
  "Extract generated-query rows from a single `MetabotMessage`'s v2 tool parts."
  [message]
  (let [ctx {:message-id (:id message)}]
    (into []
          (comp (filter schema.v2/tool-part?)
                (keep #(query-part->row ctx %)))
          (:data message))))

(defn messages->generated-queries
  "Walk a seq of `MetabotMessage` instances and return a flat vector of
  generated-query rows in chronological/insertion order, one per
  query-construction tool call. Failed and slackbot-shape blocks are
  filtered out."
  [messages]
  (into [] (mapcat message->generated-queries) messages))

(defn count-tool-invocations
  "Count v2 tool parts across a seq of `MetabotMessage` instances, regardless
   of how the call resolved. `tool-names` may be a single tool-name string or
   a set of tool-name strings."
  [messages tool-names]
  (let [counted? (if (set? tool-names) tool-names #{tool-names})]
    (transduce
     (comp (mapcat :data)
           (filter schema.v2/tool-part?)
           (filter (comp counted? schema.v2/tool-part-name)))
     (completing (fn [acc _] (inc acc)))
     0
     messages)))
