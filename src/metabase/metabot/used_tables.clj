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
  pair, normalizes the query to MBQL 5 and:
  - Collects `:source-table` ids via [[metabase.lib.walk.util/all-source-table-ids]].
  - Collects every `:field` id via [[metabase.lib.walk.util/all-field-ids]] and
    resolves them to their parent tables in one batched lookup at the end of
    the BFS. This recovers implicit-join targets (a breakout/filter like
    `[:field {:source-field <fk>} <field-in-joined-table>]` references a field
    whose table is not otherwise named in the query) — see the
    `MetabotAgentDataSourcePills` UI which uses the same trick via
    `field-ids->table-ids`.
  - Collects card refs — `:source-card` ids, template-tag `:card-id`s, and
    `:metric` ref ids — via [[metabase.lib.walk.util/all-source-card-ids]],
    then enqueues each unseen card's `:dataset_query` for recursive walking.
    This collapses questions, models, models-on-questions, metric refs, etc.
    down to their underlying source tables.
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

(defn- macaw-tables
  "Macaw-parse a raw SQL string and resolve to a set of underlying table ids.
  `nqa/tables-for-native` reads template tags via [[metabase.lib.native/template-tags]],
  which validates its argument against `::lib.schema/query` and rejects the
  legacy `{:type :native :native {...}}` shape — so we convert to MBQL 5
  first via [[lib/->mbql5]]."
  [database-id sql-text template-tags]
  (if (and database-id (seq sql-text))
    (try
      (let [legacy {:database database-id
                    :type     :native
                    :native   (cond-> {:query sql-text}
                                (seq template-tags) (assoc :template-tags template-tags))}
            result (nqa/tables-for-native (lib/->mbql5 legacy))]
        (if (:error result)
          (do (log/warnf "tables-for-native error: %s" (:error result))
              #{})
          (into #{} (keep :table-id) (:tables result))))
      (catch Exception e
        (log/warn e "Failed to extract tables from native SQL")
        #{}))
    #{}))

(defn- native-stage-tables
  "Run macaw against any native stages in `mbql5-query` and return their table ids.
  In MBQL 5 native stages, `:native` is the SQL string and `:template-tags`
  lives at the stage level alongside it (not nested under `:native`)."
  [database-id mbql5-query]
  (transduce
   (comp (filter #(= (:lib/type %) :mbql.stage/native))
         (map (fn [stage]
                (let [native (:native stage)
                      sql    (cond
                               (string? native) native
                               (map? native)    (:query native))
                      tags   (or (:template-tags stage)
                                 (when (map? native) (:template-tags native)))]
                  (macaw-tables database-id sql tags)))))
   into
   #{}
   (:stages mbql5-query)))

(defn- query-tables-and-cards
  "Walk one query (legacy or MBQL 5) and return
  `{:tables #{table-id ...} :cards #{card-id ...} :fields #{field-id ...}}`.
  `:cards` includes any `:source-card`, template-tag `:card-id`, and `:metric`
  ref ids; the outer loop in [[collect-tables]] follows them recursively.
  `:fields` is the set of every `:field` id referenced; the outer loop
  resolves these to parent table ids in one batched lookup so we surface
  implicit-join targets (which have no `:source-table` of their own — the
  joined table is only named via `:source-field` on a field ref)."
  [database-id query]
  (try
    (let [mbql5 (lib/->mbql5 query)]
      {:tables (set/union (or (lib/all-source-table-ids mbql5) #{})
                          (native-stage-tables database-id mbql5))
       :cards  (or (lib/all-source-card-ids mbql5) #{})
       :fields (or (lib/all-field-ids mbql5) #{})})
    (catch Exception e
      (log/warn e "Failed to walk query for used-table extraction")
      {:tables #{} :cards #{} :fields #{}})))

(defn- resolve-field-table-ids
  "Batch-resolve field ids to their parent table ids. Returns `#{}` on empty
  input or failure — never throws."
  [field-ids]
  (if (seq field-ids)
    (try
      (into #{}
            (keep :table_id)
            (t2/select [:model/Field :id :table_id] :id [:in field-ids]))
      (catch Exception e
        (log/warn e "Failed to resolve field ids to table ids for used-table extraction")
        #{}))
    #{}))

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
  ids. Field ids referenced anywhere in the walked queries are accumulated and
  resolved to parent tables in a single batched lookup at the end (this is how
  we capture implicit-join targets). Tracks visited card ids to break cycles.
  Never throws."
  [initial-pairs]
  (loop [tables  #{}
         fields  #{}
         queue   (vec initial-pairs)
         visited #{}]
    (if (empty? queue)
      (into tables (resolve-field-table-ids fields))
      (let [[db-id query]                     (first queue)
            queue'                            (subvec queue 1)
            {ts :tables cs :cards fs :fields} (query-tables-and-cards db-id query)
            new-cards                         (set/difference cs visited)
            new-pairs                         (keep (fn [card-id]
                                                      (when-let [{:keys [dataset-query database-id]} (card-info card-id)]
                                                        (when dataset-query
                                                          [(or database-id db-id) dataset-query])))
                                                    new-cards)]
        (recur (into tables ts)
               (into fields fs)
               (into queue' new-pairs)
               (into visited new-cards))))))

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
