(ns metabase-enterprise.workspaces.query-processor.middleware
  "QP middleware rewriting the SQL of native stages so they read the workspace tables, joins included. Runs at the
  end of preprocessing, once native SQL has its template tags, snippets and card references resolved, so every
  consumer of `qp.compile/compile` -- transforms included -- gets the rewritten SQL.

  MBQL stages need nothing here: they compile from Table metadata, and `metabase.warehouse-schema-overlay.core`
  already reads a remapped Table as the table its data is in."
  (:require
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.walk :as lib.walk]
   [metabase.premium-features.core :refer [defenterprise-schema]]
   [metabase.query-processor.error-type :as qp.error-type]
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.workspaces.core :as workspaces]
   [metabase.workspaces.schema :as ws.schema]))

(set! *warn-on-reflection* true)

;;; Native SQL

(mu/defn- sql-table-spec :- ::sql-tools/table-spec
  [schema :- [:maybe :string]
   table  :- ::lib.schema.common/non-blank-string]
  (cond-> {:table table}
    (some? schema) (assoc :schema schema)))

(mu/defn- default-schema :- [:maybe :string]
  [driver :- :keyword]
  (when (get-method sql.normalize/default-schema driver)
    (sql.normalize/default-schema driver)))

(mu/defn- sql-table-replacements :- [:map-of ::sql-tools/table-spec ::sql-tools/table-spec]
  "The `:tables` replacements for `sql-tools/replace-names`. A table in the driver's default schema also matches
  unqualified."
  [driver     :- :keyword
   remappings :- [:sequential ::ws.schema/workspace-table-remapping]]
  (let [default-schema (default-schema driver)]
    (into {}
          (mapcat (fn [{:keys [from_schema from_table to_schema to_table]}]
                    (let [to (sql-table-spec to_schema to_table)]
                      (cond-> [[(sql-table-spec from_schema from_table) to]]
                        (and (some? from_schema) (= from_schema default-schema))
                        (conj [(sql-table-spec nil from_table) to])))))
          remappings)))

(mu/defn- parse-failure :- :some
  "A QP error for SQL sqlglot could not read, so a query runs against nothing rather than the canonical tables."
  [driver :- :keyword
   e      :- :some]
  (ex-info (tru "Workspace table remapping failed: cannot parse the SQL query.")
           {:type qp.error-type/qp, :driver driver}
           e))

(mu/defn- reject-workspace-schema-access
  "Throw if `tables` includes one in a workspace schema.

  A workspace schema is where transform runs write; nothing in it is a table anyone should be naming. Query the
  canonical table and [[rewrite-sql]] points it at whichever output backs it -- reaching into the schema directly
  would read whatever happens to be there, another workspace's output included."
  [tables  :- [:sequential ::sql-tools/table-spec]
   schemas :- [:set ::lib.schema.common/non-blank-string]]
  (doseq [{:keys [schema table]} tables
          :when (contains? schemas schema)]
    (throw (ex-info (tru "Queries cannot read {0}.{1} directly: it is a workspace schema." schema table)
                    {:type qp.error-type/qp}))))

(mu/defn- rewrite-sql :- :string
  "Rewrite references to canonical tables of `remappings` in `sql` to their workspace tables, having first refused
  any direct reach into a workspace schema."
  [driver     :- :keyword
   sql        :- :string
   remappings :- [:sequential ::ws.schema/workspace-table-remapping]
   schemas    :- [:set ::lib.schema.common/non-blank-string]]
  (reject-workspace-schema-access (try
                                    (sql-tools/referenced-tables-raw driver sql)
                                    (catch Exception e
                                      (throw (parse-failure driver e))))
                                  schemas)
  (try
    (sql-tools/replace-names driver sql {:tables (sql-table-replacements driver remappings)} {:allow-unused? true})
    (catch Exception e
      (throw (parse-failure driver e)))))

(mu/defn- rewrite-sql-stages :- ::lib.schema/query
  "Rewrite the native stages of `query`, joins and nested queries included, to read the workspace tables."
  [query      :- ::lib.schema/query
   driver     :- :keyword
   remappings :- [:sequential ::ws.schema/workspace-table-remapping]
   schemas    :- [:set ::lib.schema.common/non-blank-string]]
  (lib.walk/walk-stages
   query
   (fn [_query _path stage]
     (when (and (lib/native-stage? stage)
                (string? (:native stage)))
       (update stage :native #(rewrite-sql driver % remappings schemas))))))

(mu/defn- table-transform :- [:=> [:cat :map [:sequential :any]] [:sequential :any]]
  "A [[metabase.lib.metadata/transforming-metadata-provider]] transform moving a `:metadata/table` result to the
  workspace table backing it, so MBQL stages compile against the table the data is in.

  A table already in a workspace schema is refused unless one of `remappings` points at it: `table-query` keeps those
  out of everything a person can pick, so reaching one means a stale id, and what is in there belongs to whoever
  wrote it."
  [remappings :- [:sequential ::ws.schema/workspace-table-remapping]
   schemas    :- [:set ::lib.schema.common/non-blank-string]]
  (let [canonical->workspace (into {} (map (juxt (juxt :from_schema :from_table) identity)) remappings)
        ours?                (into #{} (map (juxt :to_schema :to_table)) remappings)]
    (fn [{metadata-type :lib/type} results]
      (if (= metadata-type :metadata/table)
        (mapv (fn [{:keys [schema name] :as table}]
                (if-let [{:keys [to_schema to_table]} (canonical->workspace [schema name])]
                  (assoc table :schema to_schema, :name to_table)
                  (do
                    (when (and (contains? schemas schema) (not (ours? [schema name])))
                      (throw (ex-info (tru "Table {0}.{1} belongs to another workspace." schema name)
                                      {:type qp.error-type/qp})))
                    table)))
              results)
        results))))

(defn- install-metadata-provider!
  "Put `mp` in the QP store for the rest of the query, which `with-metadata-provider` alone would restore."
  [mp]
  (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
    (qp.store/with-metadata-provider mp)))

;;; Middleware

(defenterprise-schema apply-workspace-remapping :- ::lib.schema/query
  "Pre-processing middleware. Points the query at the workspace tables backing the canonical tables it names -- the
  metadata provider for MBQL stages, a SQL rewrite for native ones -- and refuses the workspace tables that are not
  ours on both paths."
  :feature :workspaces
  [{db-id :database, :as query} :- ::lib.schema/query]
  ;; checked before the remappings, and against the setting rather than them: a routed query still names the router
  ;; database here, and the router holds no transform output of its own, so waiting for its remappings would let
  ;; every routed query through -- to read the destination's remapped tables under their canonical names
  (when (and (:destination-database/id query)
             (workspaces/enabled?))
    (throw (ex-info (tru "Database routing is not supported together with workspaces.")
                    {:type qp.error-type/qp, :database-id db-id})))
  (if-let [remappings (when (workspaces/allow-table-remapping?)
                        (ws.impl/remappings-for-db db-id))]
    (let [schemas (into #{} (comp (filter (comp #{db-id} :db_id)) (map :schema)) (ws.impl/workspace-schemas))
          mp      (lib.metadata/transforming-metadata-provider
                   (table-transform remappings schemas)
                   (:lib/metadata query))]
      (install-metadata-provider! mp)
      (-> query
          (assoc :lib/metadata mp)
          (rewrite-sql-stages driver/*driver* remappings schemas)))
    query))
