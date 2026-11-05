(ns metabase-enterprise.workspaces.core
  "The workspace consumer: the workspace installed on this sidecar, and the EE implementations of the hooks in
  [[metabase.workspaces.core]].

  The installed workspace is a WorkspaceInstance: a name and, per database name, a main schema -> scratch namespace
  map. It lives in the `instance-workspace` setting, so it survives a restart. The hooks run on every EE instance
  whatever its token (`:feature :none`), because a sidecar whose token lapses must keep writing to scratch; each
  returns its OSS value without touching the app DB unless [[workspace-mode?]]."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.driver :as driver]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.settings.core :as setting]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.workspaces.core :as ws]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- name-decoder
  "The JSON body middleware keywordizes map keys; database and schema names are strings."
  [k]
  (cond-> k
    (keyword? k) u/qualified-name))

(def ^:private Name
  [:string {:min 1, :decode/api name-decoder}])

(defn- distinct-namespaces?
  "Each main schema maps to its own scratch namespace, and no scratch namespace is also a main schema."
  [{:keys [databases]}]
  ;; total over any input: malli may run this on a value that failed the map schema
  (every? (fn [database]
            (let [schema-map (when (map? database) (:schemas database))
                  scratch    (when (map? schema-map) (vals schema-map))]
              (and (= (count scratch) (count (set scratch)))
                   (not-any? (set (keys schema-map)) scratch))))
          (when (map? databases) (vals databases))))

(mr/def ::workspace-instance
  "A workspace as a sidecar sees it: the workspace's name and, keyed by the name of each database it covers, that
  database's main schema -> scratch namespace map."
  [:and
   [:map {:closed true}
    [:name Name]
    [:databases [:map-of {:min 1}
                 Name
                 [:map {:closed true}
                  [:schemas [:map-of {:min 1} Name Name]]]]]]
   ;; checked over the whole value: a failing check inside the map-of would make the API strip that database
   ;; instead of saying what is wrong with it
   [:fn {:error/message "each main schema needs its own scratch namespace, and no scratch namespace may be a main schema"}
    distinct-namespaces?]])

(mu/defn- json->workspace-instance :- ::workspace-instance
  [s :- :string]
  (let [{:strs [name databases]} (json/decode s)]
    {:name      name
     :databases (update-vals databases (fn [{:strs [schemas]}] {:schemas schemas}))}))

(defn instance-workspace
  "The WorkspaceInstance installed on this instance, or nil."
  []
  (some-> (ws.settings/instance-workspace) json->workspace-instance))

(defonce ^:private locked-by-config-file? (atom false))

(defn lock-by-config-file!
  "Record that a config.yml installed the workspace, at boot or through `POST /api/ee/workspace-instance/config`, so
  `POST` and `DELETE /current` refuse to change it. In memory: a boot reads config.yml again."
  []
  (reset! locked-by-config-file? true))

(defn workspace-lock
  "Which deployment config sets the workspace, so the API must not change it: `:env-var` (`MB_INSTANCE_WORKSPACE`),
  `:config-file` (a config.yml `workspace:` section), or nil."
  []
  (cond
    (some? (setting/env-var-value :instance-workspace)) :env-var
    @locked-by-config-file?                             :config-file))

(defn workspace-locked?
  "True when deployment config sets the workspace, which the API must not change."
  []
  (some? (workspace-lock)))

(defenterprise workspace-mode?
  "EE implementation: true when a workspace is installed."
  :feature :none
  []
  (some? (ws.settings/instance-workspace)))

;;; -------------------------------------------------- Hooks ------------------------------------------------------

(defn- row->specs
  "A TableRemapping row as a `[from-spec to-spec]` pair; `\"\"` in a schema column is a driver without schemas."
  [row]
  [{:schema (not-empty (:from_schema row)), :table (:from_table_name row)}
   {:schema (not-empty (:to_schema row)),   :table (:to_table_name row)}])

(defenterprise table-remappings
  "EE implementation: the remappings recorded for the database that the installed workspace's schema map still backs
  (the row's scratch namespace is the one the map gives its main schema), read only in workspace mode. A row the map
  no longer backs, e.g. after `MB_INSTANCE_WORKSPACE` changed without a POST to clear it, is ignored."
  :feature :none
  [database-id]
  (when (workspace-mode?)
    (when-let [schema-map (ws/workspace-schemas (ws.db/database-name-and-engine database-id))]
      (not-empty (into {}
                       (comp (filter #(= (:to_schema %) (get schema-map (:from_schema %))))
                             (map row->specs))
                       (ws.db/table-remappings-of-database database-id))))))

(defenterprise workspace-schemas
  "EE implementation: the schema map the installed workspace gives the database with `database`'s name."
  :feature :none
  [database]
  (when (workspace-mode?)
    (get-in (instance-workspace) [:databases (:name database) :schemas])))

(defn- supported-engine?
  "Engines whose workspace namespaces are schemas in `schema.table` SQL: the Postgres family. On MySQL and ClickHouse a
  scratch namespace is a database, and SQL Server, Snowflake and BigQuery name tables in three parts; their remapping
  comes with their own engine work."
  [engine]
  (isa? driver/hierarchy (keyword engine) :postgres))

(defn check-supported-engine!
  "Throw a 400 unless the database `{:name, :engine}` has an engine workspaces support."
  [{database-name :name, :keys [engine]}]
  (when-not (supported-engine? engine)
    (throw (ex-info (tru "Database {0} is a {1} database; workspaces support only Postgres-family databases so far."
                         (pr-str database-name) (name engine))
                    {:status-code 400, :database database-name, :engine engine}))))

(defn- workspace-scratch-target
  "On a workspace database, `target` moved to the scratch namespace mapped to its schema, with the main target it came
  from; nil outside workspace mode or on a database the workspace does not cover. Refuses (400) a target whose schema
  the workspace does not map and an engine it does not support: the main table must never be written or dropped."
  [database-id target]
  ;; the database lookup comes after the workspace-mode check, so an instance outside workspace mode reads nothing
  (when (workspace-mode?)
    (let [database (ws.db/database-name-and-engine database-id)]
      (when-let [schema-map (ws/workspace-schemas database)]
        (check-supported-engine! database)
        (let [main-schema (:schema target)
              scratch     (or (get schema-map main-schema)
                              (throw (ex-info (tru "This workspace can''t write to schema {0}: it maps only {1}."
                                                   (pr-str main-schema) (pr-str (vec (sort (keys schema-map)))))
                                              {:status-code 400, :schema main-schema})))]
          {:main target, :scratch (assoc target :schema scratch)})))))

(defenterprise resolve-transform-target
  "EE implementation: the target moved to its scratch namespace on a workspace database. Records nothing."
  :feature :none
  [database-id target]
  (or (:scratch (workspace-scratch-target database-id target))
      target))

(defenterprise record-transform-output!
  "EE implementation: on a workspace database, record that the main table of the scratch `target` a transform just
  wrote lives in the scratch namespace."
  :feature :none
  [database-id target]
  (when (workspace-mode?)
    (when-let [schema-map (ws/workspace-schemas (ws.db/database-name-and-engine database-id))]
      (let [main (ws/canonical-target schema-map target)]
        (when-not (= main target)
          (ws.db/upsert-table-remapping! {:database_id     database-id
                                          :from_db         ""
                                          :from_schema     (:schema main)
                                          :from_table_name (:name main)}
                                         {:to_db         ""
                                          :to_schema     (:schema target)
                                          :to_table_name (:name target)}))))))

(defenterprise transform-output-to-drop
  "EE implementation: on a workspace database, the scratch table."
  :feature :none
  [database-id target]
  (or (:scratch (workspace-scratch-target database-id target))
      target))

(defenterprise forget-transform-output!
  "EE implementation: delete the remapping of the main table `target`."
  :feature :none
  [database-id target]
  (when (and (workspace-mode?) (:schema target))
    (ws.db/delete-table-remapping! database-id (:schema target) (:name target))))

(defn- postgres-identifier
  "`identifier` as Postgres stores it unquoted: ASCII letters lower-cased (only A-Z), cut to 63 bytes on a UTF-8
  boundary. Applied whether or not the reference was quoted, which `referenced-tables-raw` doesn't say: refusing on
  a false match costs less than a missed one."
  [identifier]
  (u/truncate-string-to-byte-count (str/replace identifier #"[A-Z]" u/lower-case-en) 63))

(defn- unqualified-references-to-remapped-tables
  "The tables `sql` names without a schema whose name, as Postgres stores it, is the name of a remapped main table."
  [driver remappings sql]
  (let [remapped-names (into #{} (map (comp postgres-identifier :table)) (keys remappings))]
    (into []
          (filter (fn [{:keys [schema table]}]
                    (and (nil? schema) (contains? remapped-names (postgres-identifier table)))))
          (sql-tools/referenced-tables-raw driver sql {:fail-on-parse-error? true}))))

(defenterprise rewrite-sql
  "EE implementation: rewrite with SQLGlot's `replace-names`, failing closed. Refuses SQL that can't be parsed, and SQL
  that names a remapped table without its schema: a `replace-names` key without a schema matches that table name in
  every schema, so the reference can't be rewritten safely, and leaving it alone would read the main table."
  :feature :none
  [driver remappings sql]
  (let [unqualified (try
                      (unqualified-references-to-remapped-tables driver remappings sql)
                      (catch Exception e
                        (throw (ex-info (tru "This instance is a workspace, which must read remapped tables from their scratch copies, and it could not parse this SQL to find the tables it reads. Rewrite the query so it parses.")
                                        {:type qp.error-type/invalid-query}
                                        e))))]
    (when (seq unqualified)
      (throw (ex-info (tru "This instance is a workspace, and this SQL names {0} without a schema. Qualify it with its schema (for example public.{1}) so the workspace can read its scratch copy."
                           (pr-str (:table (first unqualified))) (:table (first unqualified)))
                      {:type qp.error-type/invalid-query})))
    (try
      ;; strict: rewrite only statements whose tables SQLGlot can all see, and match names as Postgres stores them
      ;; (workspaces support only the Postgres family)
      (sql-tools/replace-names driver sql {:tables remappings} {:allow-unused?         true
                                                                :strict-statements?    true
                                                                :postgres-identifiers? true})
      (catch Exception e
        (throw (ex-info (tru "This instance is a workspace, and it won''t run this SQL: {0}"
                             (str/replace (ex-message e) #"^sqlglot call failed: (ValueError: )?" ""))
                        {:type qp.error-type/invalid-query}
                        e))))))

;;; ---------------------------------------------- Install / remove -----------------------------------------------

(defn- database-id-named
  "The id of the one database named `database-name`; throws a 400 when none or several are, or when its engine is not
  supported."
  [database-name]
  (let [ids (ws.db/database-ids-named database-name)]
    (case (count ids)
      1 (let [id (first ids)]
          (check-supported-engine! (ws.db/database-name-and-engine id))
          id)
      0 (throw (ex-info (tru "No database is named {0}." (pr-str database-name))
                        {:status-code 400, :database database-name}))
      (throw (ex-info (tru "Several databases are named {0}: {1}." (pr-str database-name) (pr-str ids))
                      {:status-code 400, :database database-name, :database_ids ids})))))

(defn- stale-remapping-ids
  "Ids of the remapping `rows` that `instance` (with database names resolved to ids by `name->id`) no longer backs:
  their database or main schema is gone from it, or it maps the schema to another scratch namespace."
  [instance name->id rows]
  (let [schema-maps (into {}
                          (map (fn [[database-name {:keys [schemas]}]] [(name->id database-name) schemas]))
                          (:databases instance))]
    (into #{}
          (keep (fn [{:keys [id database_id from_schema to_schema]}]
                  (when-not (= to_schema (get-in schema-maps [database_id from_schema]))
                    id)))
          rows)))

(defonce ^:private instance-workspace-lock (Object.))

(defn call-with-instance-workspace-lock
  "Call `f` holding the lock that serializes changes to the installed workspace, so a check (e.g. that deployment
  config does not lock it) and the change it guards happen together. Every path that installs or clears the workspace
  takes it."
  [f]
  (locking instance-workspace-lock
    (f)))

(defn- write-instance-workspace!
  "Write the read-only `instance-workspace` setting. Only [[set-instance-workspace!]] and [[clear-instance-workspace!]]
  call this."
  [value]
  (setting/set! :instance-workspace value :bypass-read-only? true))

(defn in-one-transaction!
  "Run `f`, which changes the remappings and the `instance-workspace` setting (and, applying a config.yml, whatever its
  sections write), in one app-DB transaction, so no query sees the new map with the old remappings or the other way
  round. Writing the setting updates this instance's
  in-memory settings cache at once, before the commit; when the transaction rolls back, the cache is reloaded from the
  app DB so it does not keep a value that was never committed."
  [f]
  (try
    (t2/with-transaction [_conn]
      (f))
    (catch Throwable e
      (setting/restore-cache!)
      (throw e))))

(mu/defn set-instance-workspace! :- ::workspace-instance
  "Install `instance` on this instance, after checking each of its database names names exactly one database. Deletes
  the remappings the new schema maps no longer back. Returns the installed workspace."
  [instance :- ::workspace-instance]
  (let [name->id (into {} (map (juxt identity database-id-named)) (keys (:databases instance)))]
    (in-one-transaction!
     (fn []
       (ws.db/delete-table-remappings! (stale-remapping-ids instance name->id (ws.db/table-remappings)))
       (write-instance-workspace! (json/encode instance))))
    (instance-workspace)))

(defn clear-instance-workspace!
  "Turn workspace mode off: remove the installed workspace and every remapping."
  []
  (in-one-transaction!
   (fn []
     (write-instance-workspace! nil)
     (ws.db/delete-all-table-remappings!)))
  nil)

(defn table-remapping-rows
  "Every TableRemapping row, ordered by id."
  []
  (ws.db/table-remappings))
