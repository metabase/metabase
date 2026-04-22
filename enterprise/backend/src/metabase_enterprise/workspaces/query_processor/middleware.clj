(ns metabase-enterprise.workspaces.query-processor.middleware
  "QP preprocessing middleware for workspace table remapping. Two entry points:

  - `apply-workspace-remapping` (legacy, transforms-driven): triggered when a query carries a
    `:workspace-remapping` key in its `:middleware` map. Rewrites identifiers in native SQL only,
    using [[sql-tools/replace-names]].

  - `apply-workspace-table-remapping` (app-DB-driven): reads `TableRemapping` rows for the query's
    `:database` and redirects table references to their workspace copies. Handles both MBQL
    (overrides `:schema`/`:name` on cached metadata so HoneySQL compilation emits the workspace
    identifiers) and native queries (identifier rewrite via [[sql-tools/replace-names]])."
  (:require
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defenterprise apply-workspace-remapping
  "Pre-processing middleware. Rewrites table references in native SQL queries for workspace transforms."
  :feature :workspaces
  [{{remapping :workspace-remapping} :middleware :as query}]
  (cond
    ;; Not in a workspace that requires remapping, or no tables to remap.
    (or (not remapping) (empty? (:tables remapping)))
    query

    (not (lib.schema/native-only-query? query))
    (throw (ex-info "Workspace remapping is currently only supported for native queries"
                    {:query query, :remapping remapping}))

    :else
    ;; Replacement identifiers must be quoted to preserve case — e.g., Snowflake uppercases
    ;; unquoted identifiers, so `mb__isolation_xxx` would become `MB__ISOLATION_XXX`.
    ;; TODO (2026-03-07): We pre-quote here with HoneySQL, but sql-tools/replace-names strips
    ;; and re-quotes using its own dialect convention. Consider adding a :force-quote? flag to
    ;; replace-names so it can handle quoting internally without this round-trip.
    (let [quote-id  (fn [s] (if s (sql.u/quote-name driver/*driver* :table s) s))
          remapping (update remapping :tables update-vals #(update-vals % quote-id))]
      (u/update-in-if-exists query [:stages 0 :native]
                             (fn [sql] (sql-tools/replace-names driver/*driver*
                                                                sql
                                                                remapping
                                                                {:allow-unused? true}))))))

(defenterprise apply-workspace-table-remapping
  "Pre-processing middleware. Redirects table references to workspace copies using the
   `TableRemapping` app-DB table. Handles both MBQL and native queries:

   - MBQL: overrides `:schema`/`:name` on table metadata in the cached provider attached at
     `:lib/metadata`. Downstream HoneySQL compilation reads the overridden values when it
     resolves `:source-table <id>` via `->honeysql [:sql :metadata/table]`.
   - Native: rewrites table identifiers in the SQL string via `sql-tools/replace-names`.

   Mappings are keyed on the query's `:database` id plus each table's `(:schema, :name)`.

   Runs after sandboxing so that production sandbox filters materialize against production
   schema before the final table reference resolves to the workspace copy."
  :feature :workspaces
  [{db-id :database, mp :lib/metadata, :as query}]
  (let [mappings (when db-id
                   (ws.table-remapping/all-mappings-for-db db-id))]
    (cond
      (empty? mappings)
      query

      (lib.schema/native-only-query? query)
      ;; Pre-quote target identifiers so case survives dialects like Snowflake (matches the
      ;; legacy `apply-workspace-remapping` idiom above — only the *to* side is quoted; keys
      ;; stay raw so `replace-names` can match them against parsed SQL identifiers).
      ;; `:allow-unused? true` so mappings for tables not referenced by the SQL don't error.
      (let [quote-id  (fn [s] (if s (sql.u/quote-name driver/*driver* :table s) s))
            tables    (into {}
                            (map (fn [[[from-s from-t] [to-s to-t]]]
                                   [{:schema from-s :table from-t}
                                    {:schema (quote-id to-s) :table (quote-id to-t)}]))
                            mappings)
            sql       (lib/raw-native-query query)
            rewritten (sql-tools/replace-names driver/*driver* sql
                                               {:tables tables}
                                               {:allow-unused? true})]
        (lib/with-native-query query rewritten))

      :else
      (do
        (doseq [table (lib.metadata/tables mp)
                :let [[to-schema to-name] (get mappings [(:schema table) (:name table)])]
                :when to-schema]
          (lib.metadata.protocols/store-metadata!
           mp
           (assoc table :schema to-schema :name to-name)))
        query))))
