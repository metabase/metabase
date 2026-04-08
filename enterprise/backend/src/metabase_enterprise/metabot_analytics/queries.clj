(ns metabase-enterprise.metabot-analytics.queries
  "Extractor that walks `MetabotMessage` `:data` blocks and produces a vector
  of generated-query rows for the analytics conversation detail endpoint.

  A 'generated query' is one tool call to a query-construction tool
  (`create_sql_query`, `edit_sql_query`, `replace_sql_query`, or
  `construct_notebook_query`). For each successful call we emit a row
  describing what the bot built — its raw SQL or pMBQL/legacy MBQL — so the
  admin UI can render it inline.

  Reads only the in-app metabot native-parts shape produced by
  `metabase.metabot.api/store-native-parts!`. Slackbot conversations
  (`src/metabase/slackbot/streaming.clj`) persist via a lossy AISDK
  round-trip that drops `:structured-output`, so they yield no rows here. See
  the v1 follow-up note in the analytics PR for the slackbot fix."
  (:require
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def query-generation-tool-names
  "Tool names that produce a runnable query inside a Metabot conversation.
  Both the in-app and slackbot variants of `construct_notebook_query`
  register under the same `:tool-name`, so a single string covers both."
  #{"create_sql_query" "edit_sql_query" "replace_sql_query"
    "construct_notebook_query"})

(defn- tool-output->structured
  "Pull `:structured-output` (or its snake-case alias) out of a persisted
  `tool-output` block's `:result`. Returns nil if the result lacks structured
  data — that signals a tool that errored out before validating."
  [result]
  (when (map? result)
    (or (:structured-output result) (:structured_output result))))

(defn- ->legacy-mbql
  "Coerce a stored `:query` map to legacy MBQL. The notebook tool persists a
  pMBQL query whose schema-namespaced values (e.g. `:lib/type`) come back as
  STRINGS after the JSON round-trip — `lib-be/normalize-query` re-keywords
  them so `lib/->legacy-MBQL` can dispatch correctly. SQL tools always
  persist legacy MBQL, which passes through unchanged. Returns nil on
  failure rather than throwing — extraction is best-effort."
  [query-map]
  (when (map? query-map)
    (try
      (if (contains? query-map :lib/type)
        #_{:clj-kondo/ignore [:discouraged-var]}
        (-> query-map lib-be/normalize-query lib/->legacy-MBQL)
        query-map)
      (catch Throwable e
        (log/warn e "Failed to coerce stored :query map to legacy MBQL")
        nil))))

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
    (when (contains? query-generation-tool-names tool-name)
      (let [arguments  (:arguments input-block)
            result     (:result output-block)
            structured (tool-output->structured result)
            failed?    (or (nil? output-block)
                           (some? (:error output-block))
                           (nil? structured))]
        (when-not failed?
          (let [legacy-query (->legacy-mbql (:query structured))
                notebook?    (= tool-name "construct_notebook_query")
                ;; Edit tool only emits diffs as input, so the input arg
                ;; fallback only helps create/replace.
                sql          (when-not notebook?
                               (or (:query-content structured)
                                   (case tool-name
                                     "create_sql_query"  (:sql_query arguments)
                                     "replace_sql_query" (:new_query arguments)
                                     nil)))
                database-id  (or (:database structured)
                                 (:database legacy-query))]
            {:tool        tool-name
             :call_id     (:id input-block)
             :message_id  message-id
             :query_id    (:query-id structured)
             :query_type  (if notebook? "notebook" "sql")
             :sql         sql
             :mbql        (when notebook? legacy-query)
             :database_id database-id
             :tables      (if notebook?
                            []
                            (referenced-table-names database-id sql))}))))))

(defn- message->generated-queries
  "Extract generated-query rows from a single `MetabotMessage`. Pairs each
  `tool-input` block with its matching `tool-output` block by `:id`."
  [message]
  (let [blocks        (or (:data message) [])
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
