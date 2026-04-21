(ns metabase-enterprise.workspaces.query-processor.middleware
  "QP preprocessing middleware that rewrites table references in native SQL queries for workspace transforms.

  When a query carries a `:workspace-remapping` key in its `:middleware` map (attached by workspace execute
  code), this middleware rewrites table names in the native SQL using [[sql-tools/replace-names]]."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
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
  "Pre-processing middleware. Redirects MBQL table references to workspace copies by overriding
   table metadata in the cached metadata provider attached to the query. `:source-table <id>`
   entries in the query are not rewritten - downstream HoneySQL compilation reads the overridden
   `:schema` and `:name` when it resolves the table by id.

   Runs after sandboxing so that production sandbox filters materialize against production
   schema before the final table reference resolves to the workspace copy.

   Expects `[:middleware :workspace-table-remapping :tables]` to be a map of
   `table-id -> {:schema \"ws_schema\" :name \"table_name\"}`."
  :feature :workspaces
  [{{remapping :workspace-table-remapping} :middleware, mp :lib/metadata, :as query}]
  (if (or (not remapping) (empty? (:tables remapping)))
    query
    (do
      (doseq [[table-id {:keys [schema name]}] (:tables remapping)]
        (when-let [original (lib.metadata/table mp table-id)]
          (lib.metadata.protocols/store-metadata!
           mp
           (assoc original :schema schema :name name))))
      query)))
