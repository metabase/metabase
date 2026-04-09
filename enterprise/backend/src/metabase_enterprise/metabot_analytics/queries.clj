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

(defn- query-block-pair->row
  "Build a generated-query row from an in-app metabot tool-input/tool-output
  pair. Returns nil for tools we don't track or for failed/missing outputs
  (errored rows are filtered out at the source — v1 doesn't render them)."
  [{:keys [message-id]} input-block output-block]
  (let [tool-name (:function input-block)]
    (when (contains? metabot.tools/query-generation-tool-names tool-name)
      (let [arguments  (:arguments input-block)
            result     (:result output-block)
            structured (tool-output->structured result)]
        (when (and structured (not (:error output-block)))
          (let [query       (:query structured)
                notebook?   (= tool-name "construct_notebook_query")
                ;; Edit tool only emits diffs as input, so the input arg
                ;; fallback only helps create/replace.
                sql         (when-not notebook?
                              (or (:query-content structured)
                                  (case tool-name
                                    "create_sql_query"  (:sql_query arguments)
                                    "replace_sql_query" (:new_query arguments)
                                    nil)))
                database-id (or (:database structured) (:database query))]
            {:tool        tool-name
             :call_id     (:id input-block)
             :message_id  message-id
             :query_id    (:query-id structured)
             :query_type  (if notebook? "notebook" "sql")
             :sql         sql
             :mbql        (when notebook? query)
             :database_id database-id
             :tables      (if notebook?
                            []
                            (referenced-table-names database-id sql))}))))))

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
