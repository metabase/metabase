(ns metabase.metabot.megabot-context
  "Knowledge primed into the experimental `:megabot` system prompt so each conversation doesn't start by
  rediscovering Metabase's application database.

  Three tiers:
  - the **app-db map** — a curated, static description of the core app-db tables, their key columns, and
    \"where to find what\" routing, read from `resources/metabot/megabot/app-db-map.edn`. It is identical on
    every request, so it lives in the cached system-prompt prefix;
  - the **full schema on demand** — `describe_app_db` (in `metabase.metabot.tools.megabot`) reads the live
    schema from `metabase.metabot.db/app-db-schema` and merges in the curated notes from [[curated-table]];
  - the **instance snapshot** — this instance's app-db dialect, the current user's personal collection (where new
    content goes by default), the warehouse databases and tables they can query (with columns on a small instance),
    and the metrics and models they can see. It changes and is per-user, so it renders after the cache breakpoint.

  [[megabot-system-context]] is the profile's `:system-prompt-context` hook; it composes these with the
  persistent-notes catalog from `metabase.metabot.tools.memory`."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.memory :as tools.memory]
   [metabase.permissions.core :as perms]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- App-db map ----------------------------------------------------

(def ^:private app-db-map-resource "metabot/megabot/app-db-map.edn")

(def app-db-map
  "The curated app-db map: `{:domains [{:name :tables [{:table :purpose :columns [[col note] …]}]}] :routing
  [[question where] …] :gotchas [str …]}`."
  (delay (edn/read-string (slurp (io/resource app-db-map-resource)))))

(def ^:private curated-tables-by-name
  (delay (into {}
               (for [domain (:domains @app-db-map)
                     table  (:tables domain)]
                 [(:table table) table]))))

(defn curated-table
  "The curated entry for app-db `table-name` — `{:table :purpose :columns [[col note] …]}` — or nil."
  [table-name]
  (get @curated-tables-by-name table-name))

(defn unmaintained-note
  "Why app-db `table-name` shouldn't be relied on — it exists but nothing keeps it up to date — or nil."
  [table-name]
  (get (:unmaintained @app-db-map) table-name))

(defn- render-column [[column note]]
  (if note (str column " (" note ")") column))

(defn- render-table [{:keys [table purpose columns]}]
  (str "- **" table "** — " purpose "\n  " (str/join ", " (map render-column columns))))

(defn render-app-db-map
  "Render the curated app-db map as the markdown section primed into the megabot system prompt."
  []
  (let [{:keys [domains routing gotchas]} @app-db-map]
    (te/lines
     "## Metabase application database"
     (str "`query_app_db` reads this schema. The core tables are below, so you rarely need to discover them. "
          "For any other table, or a table's full column list, call `describe_app_db`.")
     (for [{domain-name :name tables :tables} domains]
       ["" (str "### " domain-name) (map render-table tables)])
     ""
     "### Where to find what"
     (for [[question where] routing]
       (str "- " question " → " where))
     ""
     "### Gotchas"
     (for [gotcha gotchas]
       (str "- " gotcha)))))

(def ^:private rendered-app-db-map
  (delay (render-app-db-map)))

;;; ------------------------------------------------- Instance snapshot -------------------------------------------------

(def ^:private max-snapshot-databases 50)
(def ^:private max-tables-per-database
  "Most-viewed tables listed per database; the rest are left to query_app_db."
  40)
(def ^:private max-tables-listed
  "Cap on tables listed across all databases, so a big instance can't blow up the prompt."
  150)
(def ^:private max-tables-with-columns
  "When at most this many tables are listed in total, their columns are inlined too, so a small instance needs no
  metadata lookups at all."
  30)
(def ^:private max-columns-per-table 40)
(def ^:private max-metrics-and-models 40)
(def ^:private max-description-chars 120)
(def ^:private snapshot-ttl-ms (* 5 60 1000))

(defn- qualified-table-name [{:keys [schema] table-name :name}]
  (if (str/blank? schema) table-name (str schema "." table-name)))

(defn- listed-tables
  "The most-viewed queryable tables of each database in `dbs` (maps with :id and :table_count), capped per database and
  in total. Returns a map of database id -> tables. Query-builder access is enough to be listed: a user who can't write
  SQL still queries these with run_warehouse_query."
  [dbs]
  (loop [[db & more] dbs, budget max-tables-listed, acc {}]
    (if (or (nil? db) (<= budget 0))
      acc
      (let [tables (metabot.db/most-viewed-tables-visible-to-current-user
                    (:id db) (min max-tables-per-database budget) :query-builder)]
        (recur more (- budget (count tables)) (assoc acc (:id db) tables))))))

(defn- column-renderer
  "Fn rendering a field as `name #<field id>`, plus ` (PK)` or ` → schema.table.column` (FKs resolved among
  `fields`). The field id is what a structured query references the column by."
  [fields table-by-id]
  (let [field-by-id (into {} (map (juxt :id identity)) fields)]
    (fn [{:keys [id semantic_type fk_target_field_id] field-name :name}]
      (let [target (some-> fk_target_field_id field-by-id)]
        (str field-name " #" id
             (cond
               target
               (str " → " (qualified-table-name (table-by-id (:table_id target))) "." (:name target))

               (= :type/PK (keyword semantic_type))
               " (PK)"))))))

(defn- sql-allowed?
  "Whether the current user may write SQL against `database-id`: the check the query processor applies to a native
  query."
  [database-id]
  (= :query-builder-and-native
     (perms/full-database-permission-for-user api/*current-user-id* :perms/create-queries database-id)))

(defn- render-database
  [{:keys [id engine table_count sql-marker] db-name :name} tables fields-by-table render-column]
  (let [more (- table_count (count tables))]
    (te/lines
     ""
     (str "**" db-name "** — id " id ", " (some-> engine name) ", " table_count " tables" sql-marker)
     (for [{table-id :id :as table} tables
           :let [fields (get fields-by-table table-id)]]
       (str "- " table-id " " (qualified-table-name table)
            (when (seq fields)
              (str ": " (str/join ", " (map render-column (take max-columns-per-table fields)))
                   (when (> (count fields) max-columns-per-table) ", …")))))
     (when (pos? more)
       (str "- …and " more " more tables: find them with query_app_db on metabase_table (db_id = " id ").")))))

(defn- render-databases []
  (let [dbs             (take max-snapshot-databases (metabot.db/queryable-warehouse-databases))
        counts          (metabot.db/visible-table-counts-for-current-user (mapv :id dbs))
        ;; a database the user can query no table of is no use to the agent
        dbs             (keep #(when-let [n (counts (:id %))] (assoc % :table_count n)) dbs)
        tables          (listed-tables dbs)
        all             (mapcat val tables)
        fields          (when (<= (count all) max-tables-with-columns)
                          (metabot.db/visible-field-summaries (mapv :id all)))
        fields-by-table (group-by :table_id fields)
        render          (column-renderer fields (into {} (map (juxt :id identity)) all))
        _               (perms/prime-database-perms-cache {:db-ids (into #{} (map :id) dbs)})
        sql-ids         (into #{} (comp (map :id) (filter sql-allowed?)) dbs)
        ;; with SQL allowed nowhere one line says so; otherwise only the exceptions are marked
        dbs             (cond->> dbs
                          (seq sql-ids) (map #(cond-> %
                                                (not (sql-ids (:id %)))
                                                (assoc :sql-marker ", structured queries only (no SQL permission)"))))]
    (if (empty? dbs)
      "You can't query any warehouse database: none is connected, or the current user has access to none."
      (te/lines
       "### Warehouse databases you can query"
       (str "Tables are listed as `<table id> schema.table`, most viewed first. Structured queries take the numeric "
            "ids; SQL takes the physical names, with the database id as `database_id`."
            (when (seq fields)
              " Columns are listed as `name #<field id>`, with primary keys and foreign keys marked."))
       (when (empty? sql-ids)
         "You can't write SQL on any of these databases: query them with run_warehouse_query.")
       (for [db dbs]
         (render-database db (get tables (:id db)) fields-by-table render))))))

(defn- truncate-description [description]
  (when-not (str/blank? description)
    (te/ellipsize (str/replace (str/trim description) #"\s+" " ") max-description-chars)))

(defn- metric-source-renderer
  "Fn rendering where a metric card can be used: `source-card <id>` for a metric built on a model or saved question,
  `source-table <id> schema.table` for one built on a table, nil when neither is known. A metric only works on its
  own source, so this is the part of the recipe the model can't guess."
  [cards]
  (let [table-ids (into [] (comp (filter (comp #{:metric} keyword :type))
                                 (remove :source_card_id)
                                 (keep :table_id)
                                 (distinct))
                        cards)
        table-by-id (when (seq table-ids)
                      (into {} (map (juxt :id identity)) (metabot.db/table-summaries table-ids)))]
    (fn [{:keys [source_card_id table_id]}]
      (cond
        source_card_id (str "source-card " source_card_id)
        table_id       (str "source-table " table_id
                            (when-let [table (get table-by-id table_id)]
                              (str " " (qualified-table-name table))))))))

(defn- render-metrics-and-models []
  (when-let [cards (seq (metabot.db/visible-metrics-and-models-for-current-user max-metrics-and-models))]
    (let [metric-source (metric-source-renderer cards)]
      (te/lines
       "### Metrics and models"
       (str "This organization's own definitions, most used first. When one matches the question, answer with it "
            "instead of recomputing it from raw tables, so the number matches the organization's definition. In a "
            "structured query, use a metric as `[\"metric\", {}, <metric id>]` in `aggregation`, on the source "
            "listed next to it, and query a model with `\"source-card\": <model id>` (see \"Structured warehouse "
            "queries\").")
       (for [{:keys [id type database_id description] card-name :name :as card} cards
             :let [source (when (= :metric (keyword type)) (metric-source card))]]
         (str "- " (name type) " " id ": " card-name " (database " database_id (when source (str ", " source)) ")"
              (when-let [d (truncate-description description)] (str " — " d))))))))

(defn- render-personal-collection
  "Where new content goes by default: the current user's personal collection, the same default `save_result` uses
  when `destination` is omitted. Without it, a `call_api` create lands in the shared root collection, which
  non-admins can't write to. API-key users have no personal collection, so there is no line for them."
  []
  (when-let [{:keys [id] collection-name :name} (some-> api/*current-user-id* collection/user->personal-collection)]
    (str "Your personal collection: " collection-name " (id " id "). Save new questions, dashboards, and documents "
         "there unless the user names another place: `save_result` does when you omit `destination`, and with "
         "`call_api` pass this id as `collection_id`.")))

(defn instance-snapshot
  "Render the live instance snapshot for the current user: the app-db dialect, their personal collection, the warehouse
  databases and tables they can query, and the metrics and models they can see."
  []
  (te/lines
   "## This instance"
   (str "App database dialect: " (name (mdb/db-type)) ". Write `query_app_db` SQL for this dialect.")
   (render-personal-collection)
   ""
   (render-databases)
   (when-let [cards (render-metrics-and-models)]
     ["" cards])))

(def ^:private cached-instance-snapshot
  ;; The system prompt is rebuilt on every agent-loop iteration, so don't re-query the app db each time. The snapshot
  ;; is permission-filtered, so it is cached per user; `_user-id` is only the cache key.
  (memoize/ttl (fn [_user-id] (instance-snapshot)) :ttl/threshold snapshot-ttl-ms))

;;; ------------------------------------------------ System-prompt hook ------------------------------------------------

(defn megabot-system-context
  "The `:megabot` profile's `:system-prompt-context` hook. Returns the template vars for `megabot.selmer`:
  `:megabot_app_db_map` (static; cached prompt prefix), `:megabot_instance` (live snapshot), and
  `:megabot_notes` / `:megabot_notes_more` (the persistent-notes catalog, as data)."
  [context]
  (merge (tools.memory/megabot-notes-system-context context)
         {:megabot_app_db_map @rendered-app-db-map
          ;; the snapshot is a convenience; a failing app-db query must not take the whole agent loop down
          :megabot_instance   (try
                                (cached-instance-snapshot api/*current-user-id*)
                                (catch Exception e
                                  (log/warn e "Could not build the megabot instance snapshot")
                                  nil))}))
