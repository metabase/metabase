(ns metabase-enterprise.workspaces.query-processor.middleware
  "The workspace half of table remapping in the query processor: the default remappings are the workspace table
  remappings of the query's database, and reads of a workspace schema itself are refused."
  (:require
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.walk :as lib.walk]
   [metabase.premium-features.core :refer [defenterprise-schema]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.workspaces.core :as workspaces]))

(set! *warn-on-reflection* true)

(defenterprise-schema default-table-remappings :- [:sequential ::driver/table-remapping]
  "The workspace table remappings of the Database with `db-id`, empty unless workspaces are enabled."
  :feature :workspaces
  [db-id :- ::lib.schema.id/database]
  (mapv (fn [{:keys [from_schema from_table to_schema to_table]}]
          {:from-schema from_schema, :from-table from_table, :to-schema to_schema, :to-table to_table})
        (ws.impl/remappings-for-db db-id)))

(mu/defn- referenced-tables :- [:sequential ::sql-tools/table-spec]
  [driver :- :keyword
   sql    :- :string]
  (try
    (sql-tools/referenced-tables-raw driver sql)
    (catch Exception e
      (throw (ex-info (tru "Workspace table remapping failed: cannot parse the SQL query.")
                      {:type qp.error-type/qp, :driver driver}
                      e)))))

(mu/defn- reject-workspace-schema-reads :- :nil
  "Throw if a native stage of `query` names a table in one of `schemas`: a workspace schema is where transform runs
  write, and what is in there belongs to whoever wrote it."
  [query   :- ::lib.schema/query
   schemas :- [:set ::lib.schema.common/non-blank-string]]
  (lib.walk/walk-stages
   query
   (fn [_query _path stage]
     (when (and (lib/native-stage? stage)
                (string? (:native stage)))
       (doseq [{:keys [schema table]} (referenced-tables driver/*driver* (:native stage))
               :when (contains? schemas schema)]
         (throw (ex-info (tru "Queries cannot read {0}.{1} directly: it is a workspace schema." schema table)
                         {:type qp.error-type/qp}))))
     nil))
  nil)

(defenterprise-schema check-workspace-table-access :- ::lib.schema/query
  "Pre-processing middleware. Refuses a query that reads a workspace schema directly, or is routed while workspaces
  are on."
  :feature :workspaces
  [{db-id :database, :as query} :- ::lib.schema/query]
  (when (and (:destination-database/id query) (workspaces/enabled?))
    (throw (ex-info (tru "Database routing is not supported together with workspaces.")
                    {:type qp.error-type/qp, :database-id db-id})))
  (when-let [schemas (not-empty (into #{}
                                      (comp (filter (comp #{db-id} :db_id)) (map :schema))
                                      (ws.impl/workspace-schemas)))]
    (reject-workspace-schema-reads query schemas))
  query)
