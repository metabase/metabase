(ns metabase.metabot.used-tables
  "Extract underlying-table references from the parts vector that
  [[metabase.metabot.persistence/finalize-assistant-turn!]] is about to persist.
  Returned rows are inserted into `metabot_used_table`.

  Walks `:tool-input` / `:tool-output` pairs, dispatches on tool name:
  - `construct_notebook_query` — MBQL 5 query in `:structured-output.query`.
  - `create_sql_query` / `replace_sql_query` / `edit_sql_query` — native SQL.
  - `write_transform_sql` — MBQL 5 native query in
    `:structured-output.transform.source.query`, walked through macaw.
  - `write_transform_python` — table ids declared explicitly in the
    `:source_tables` tool-input argument (the agent declares each source table
    by id; Python source is not parsed).

  Both query paths feed a single recursive collector that, for each `[db-id, query]`
  pair, attaches an application-DB metadata provider and:
  - Collects table and card ids via [[metabase.lib.core/all-referenced-entity-ids]],
    which folds in source-tables, template-tag table/card refs, and the
    parent tables of implicit-join targets (resolved internally via
    `bulk-metadata` on the attached metadata provider). The provider is
    shared across BFS iterations via [[metabase.lib-be.core/with-metadata-provider-cache]],
    so per-database field/table lookups are memoized.
  - Treats `:metric` refs as cards for recursion — metric models live in the
    `Card` table, so enqueueing their `:dataset_query` collapses metric
    references down to their underlying source tables alongside questions
    and models.
  - For native stages, runs the macaw parser via
    [[metabase.metabot.query-analyzer/tables-for-native]] to recover tables
    the lib walker cannot see inside raw SQL text.

  Visited card ids are tracked to break cycles. The collector never throws —
  lib walker, macaw parser, and DB failures are caught internally and degrade
  to dropped tables.

  This namespace expects the **pre-strip** parts vector — i.e. before
  [[metabase.metabot.persistence/strip-tool-output-bloat]] discards keys outside
  [[metabase.metabot.persistence/persisted-structured-output-keys]]. The
  transform path in particular relies on the un-stripped `:transform` key,
  which is not persisted."
  (:require
   [clojure.set :as set]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.query-analyzer :as nqa]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private notebook-tool-name "construct_notebook_query")
(def ^:private transform-sql-tool-name "write_transform_sql")
(def ^:private transform-python-tool-name "write_transform_python")

(def ^:private transform-tool-names
  #{transform-sql-tool-name transform-python-tool-name})

(def ^:private tracked-tool-names
  "Union of every tool name whose successful invocation we mine for table
  references. We keep the transform tools out of
  [[metabase.metabot.tools/query-generation-tool-names]] because the
  metabot_analytics module makes shape assumptions about that set
  (`:query-content`/`:database`/etc. in structured-output) that transform
  outputs do not satisfy."
  (into transform-tool-names metabot.tools/query-generation-tool-names))

(defn- tool-output->structured
  [result]
  (when (map? result)
    (or (:structured-output result)
        (:structured_output result))))

(defn- successful-tracked-output?
  "True when `tool-input`/`tool-output` is a successful invocation of a tool
  whose output we mine for table references."
  [input-block output-block]
  (and output-block
       (contains? tracked-tool-names (:function input-block))
       (not (:error output-block))
       (some? (tool-output->structured (:result output-block)))))

(defn- native-tables
  "If `query` is native, run macaw against it and return its underlying table ids."
  [query]
  (if (lib/native? query)
    (try
      (let [result (nqa/tables-for-native query)]
        (if (:error result)
          (do (log/warnf "tables-for-native error: %s" (:error result))
              #{})
          (into #{} (keep :table-id) (:tables result))))
      (catch Exception e
        (log/warn e "Failed to extract tables from native SQL")
        #{}))
    #{}))

(defn- query-tables-and-cards
  "Walk one query (legacy or MBQL 5) and return
  `{:tables #{table-id ...} :cards #{card-id ...}}`. `:tables` includes
  `:source-table` ids, template-tag table ids, the parent tables of
  implicitly-joined field refs (resolved internally via `bulk-metadata`
  through the attached metadata provider), and any tables found by macaw
  in native stages. `:cards` includes `:source-card`, template-tag
  `:card-id`, and `:metric` ref ids (metric models live in `Card`, so the
  outer loop follows them as cards)."
  [database-id query]
  (try
    (let [mp     (lib-be/application-database-metadata-provider database-id)
          mbql5  (lib/query mp query)
          ids    (lib/all-referenced-entity-ids [mbql5])]
      {:tables (set/union (:table ids)
                          (native-tables mbql5))
       :cards  (set/union (:card ids) (:metric ids))})
    (catch Exception e
      (log/warn e "Failed to walk query for used-table extraction")
      {:tables #{} :cards #{}})))

(defn- card-info
  "Fetch a card's `:dataset_query` and `:database_id` by id. Warns and returns
  nil if the card cannot be loaded."
  [card-id]
  (try
    (if-let [card (t2/select-one [:model/Card :dataset_query :database_id] :id card-id)]
      {:dataset-query (:dataset_query card)
       :database-id   (:database_id card)}
      (do (log/warnf "Card %s referenced by Metabot query was not found" card-id)
          nil))
    (catch Exception e
      (log/warnf e "Failed to look up card %s for used-table extraction" card-id)
      nil)))

(defn- collect-tables
  "BFS over a queue of `[db-id, query]` pairs, accumulating underlying table
  ids. Implicit-join targets are recovered by [[query-tables-and-cards]] via
  the attached metadata provider's `bulk-metadata`. The provider cache is
  shared across iterations so repeated walks against the same database
  reuse one cached provider instance. Tracks visited card ids to break
  cycles. Never throws."
  [initial-pairs]
  (lib-be/with-metadata-provider-cache
    (loop [tables  #{}
           queue   (vec initial-pairs)
           visited #{}]
      (if (empty? queue)
        tables
        (let [[db-id query]          (first queue)
              queue'                 (subvec queue 1)
              {ts :tables cs :cards} (query-tables-and-cards db-id query)
              new-cards              (set/difference cs visited)
              new-pairs              (keep (fn [card-id]
                                             (when-let [{:keys [dataset-query database-id]} (card-info card-id)]
                                               (when dataset-query
                                                 [(or database-id db-id) dataset-query])))
                                           new-cards)]
          (recur (into tables ts)
                 (into queue' new-pairs)
                 (into visited new-cards)))))))

(defn- notebook-starting-point
  "Starting `[db-id query]` for a `construct_notebook_query` tool output."
  [structured]
  (when-let [query (:query structured)]
    (when-let [db-id (:database query)]
      [db-id query])))

(defn- sql-starting-point
  "Starting `[db-id query]` for a SQL tool output. The agent's structured
  output typically carries the full native MBQL map under `:query`; if not we
  synthesize a minimal native wrapper so the recursive collector can still run
  macaw + walk template tags."
  [tool-name arguments structured]
  (let [structured-query (:query structured)
        database-id      (or (:database structured)
                             (:database structured-query))
        raw-sql          (or (:query-content structured)
                             (case tool-name
                               "create_sql_query"  (:sql_query arguments)
                               "replace_sql_query" (:new_query arguments)
                               nil))
        query (or structured-query
                  (when (and database-id (seq raw-sql))
                    {:database database-id
                     :type     :native
                     :native   {:query raw-sql}}))]
    (when (and database-id query)
      [database-id query])))

(defn- transform-sql-starting-point
  "Starting `[db-id, query]` for a `write_transform_sql` tool output. The
  suggested transform's `[:source :query]` is a full MBQL 5 native query
  (built via `lib/native-query` and updated with the new SQL), so feeding it
  to `collect-tables` runs macaw against the native stage."
  [structured]
  (let [query (get-in structured [:transform :source :query])
        db-id (or (:database query)
                  (get-in structured [:transform :source :source-database]))]
    (when (and db-id query)
      [db-id query])))

(defn- transform-declared-table-ids
  "Read `:table_id` values from a write_transform_* tool's `:source_tables`
  argument. Required by the Python tool's schema; absent from the SQL tool's
  closed schema but read defensively in case future revisions add it."
  [arguments]
  (into #{} (keep :table_id) (:source_tables arguments)))

(defn- pair->table-ids
  [input-block output-block]
  (let [tool-name  (:function input-block)
        arguments  (:arguments input-block)
        structured (tool-output->structured (:result output-block))]
    (cond
      (= tool-name notebook-tool-name)
      (if-let [start (notebook-starting-point structured)]
        (collect-tables [start])
        #{})

      (= tool-name transform-sql-tool-name)
      (let [declared  (transform-declared-table-ids arguments)
            sql-start (transform-sql-starting-point structured)]
        (cond-> declared
          sql-start (into (collect-tables [sql-start]))))

      (= tool-name transform-python-tool-name)
      (transform-declared-table-ids arguments)

      :else
      (if-let [start (sql-starting-point tool-name arguments structured)]
        (collect-tables [start])
        #{}))))

(defn- ->rows
  "One row per distinct `(message-id, table-id)` pair."
  [message-id table-ids]
  (mapv (fn [id] {:message_id message-id :table_id id}) table-ids))

(defn extract-used-tables
  "Walk the pre-strip `parts` vector and return insertion-ready row maps for
  `metabot_used_table`. One row per distinct `(message-id, table-id)` pair.
  Returns `[]` when nothing was referenced. Never throws — walker, parser, and
  DB failures are caught internally and degrade to dropped tables.

  Must run before [[metabase.metabot.persistence/strip-tool-output-bloat]]
  trims tool-output `:structured-output`; the transform path needs the
  un-trimmed `:transform` key, which is not in
  [[metabase.metabot.persistence/persisted-structured-output-keys]]."
  [message-id parts]
  (let [outputs-by-id (->> parts
                           (filter #(= :tool-output (:type %)))
                           (into {} (map (juxt :id identity))))
        pairs         (->> parts
                           (filter #(= :tool-input (:type %)))
                           (keep (fn [input]
                                   (let [output (get outputs-by-id (:id input))]
                                     (when (successful-tracked-output? input output)
                                       [input output])))))
        all-tables    (reduce (fn [acc [input output]]
                                (into acc (pair->table-ids input output)))
                              #{}
                              pairs)]
    (->rows message-id all-tables)))
