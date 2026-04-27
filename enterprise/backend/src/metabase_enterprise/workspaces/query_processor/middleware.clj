(ns metabase-enterprise.workspaces.query-processor.middleware
  "QP middleware for workspace table remapping. Two phases:

   Phase 1 — [[apply-workspace-remapping]] (preprocessing):
   Handles MBQL queries only. Overrides `:schema`/`:name` on cached table metadata so
   HoneySQL compilation emits workspace identifiers. Does NOT attempt native SQL rewriting
   because at this stage the SQL may still contain unresolved template tags and snippet
   placeholders.

   Phase 2 — [[apply-workspace-sql-remapping]] (execution, post-compilation):
   The authoritative SQL rewriter. By this point all snippets are expanded, card references
   resolved, parameters substituted, and MBQL compiled to SQL. Parses the complete SQL,
   rewrites table references at the AST level, and re-emits. Runs unconditionally for all
   queries against remapped databases."
  (:require
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase.driver :as driver]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.sql-tools.core :as sql-tools]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Helpers --------------------------------------------------

(defn- build-table-replacements
  "Convert remappings map into the format expected by `sql-tools/replace-names`.
   SQLGlot handles quoting internally based on the dialect, so we pass raw identifiers."
  [remappings]
  (into {}
        (map (fn [[[from-schema from-table] [to-schema to-table]]]
               [{:schema from-schema :table from-table}
                {:schema to-schema :table to-table}]))
        remappings))

(defn- rewrite-sql
  "Parse and rewrite table references in a complete SQL string. Returns the rewritten SQL.
   Throws on parse failure — we never silently pass through a query we can't understand."
  [driver sql remappings]
  (try
    (let [replacements {:tables (build-table-replacements remappings)}]
      (sql-tools/replace-names driver sql replacements {:allow-unused? true}))
    (catch Exception e
      (throw (ex-info "Workspace table remapping failed: cannot parse SQL"
                      {:type   qp.error-type/qp
                       :sql    sql
                       :driver driver}
                      e)))))

(defn- remap-mbql-table-metadata!
  "Override `:schema` and `:name` on table metadata in the CachedMetadataProvider for each
   remapping. Downstream HoneySQL compilation will read the overridden values."
  [metadata-provider remappings]
  (doseq [[[from-schema from-name] [to-schema to-name]] remappings
          :let [candidates (lib.metadata.protocols/metadatas
                            metadata-provider
                            {:lib/type :metadata/table, :name #{from-name}})
                table      (some #(when (= (:schema %) from-schema) %) candidates)]
          :when table]
    (lib.metadata.protocols/store-metadata!
     metadata-provider
     (assoc table :schema to-schema :name to-name))))

;;; --------------------------------------- Phase 1: Preprocessing (MBQL only) ------------------------------------

(defenterprise apply-workspace-remapping
  "Pre-processing middleware (Phase 1). Swaps MBQL table metadata for workspace isolation.

   Only handles MBQL queries — overrides table metadata in the CachedMetadataProvider so
   that HoneySQL compilation emits workspace schema/table identifiers.

   Does NOT rewrite native SQL here. At this point in the pipeline, native queries may still
   contain unresolved template tags ({{snippet: ...}}, {{#card-id}}) that make the SQL
   unparseable. Native SQL rewriting happens in Phase 2 after all substitution and compilation."
  :feature :workspaces
  [{db-id :database, mp :lib/metadata, :as query}]
  (if-not (ws.remapping/enabled-for-db? db-id)
    query
    (let [remappings (ws.remapping/remappings-for-db db-id)]
      (if (empty? remappings)
        query
        (do
          (remap-mbql-table-metadata! mp remappings)
          query)))))

;;; ----------------------------- Phase 2: Post-Compilation SQL Rewrite (authoritative) ----------------------------

(defn- rewrite-compiled-map
  "Rewrite table references in a compiled query map ({:query sql, :params [...]}). Parses the
   complete SQL, replaces production schema/table refs with workspace equivalents, re-emits."
  [driver compiled-map remappings]
  (let [sql       (:query compiled-map)
        rewritten (rewrite-sql driver sql remappings)]
    (assoc compiled-map :query rewritten)))

(defenterprise apply-workspace-sql-remapping
  "Execution middleware (Phase 2). The authoritative SQL rewriter for workspace isolation.

   By this point all snippets are expanded, card references resolved, parameters substituted,
   and MBQL compiled to SQL. We have one complete SQL string. Parse it, rewrite table
   references at the AST level, re-emit.

   Runs unconditionally for all queries against remapped databases — MBQL-origin and
   native-origin alike. This is the only place where native SQL rewriting happens."
  :feature :workspaces
  [qp]
  (fn [{:keys [database] :as query} rff]
    (if-not (ws.remapping/enabled-for-db? database)
      (qp query rff)
      (let [remappings (ws.remapping/remappings-for-db database)]
        (if (empty? remappings)
          (qp query rff)
          (let [driver  driver/*driver*
                rewrite (fn [compiled-map]
                          (rewrite-compiled-map driver compiled-map remappings))
                query   (cond-> query
                          (:qp/compiled query)
                          (update :qp/compiled rewrite)

                          (:qp/compiled-inline query)
                          (update :qp/compiled-inline rewrite))]
            (qp query rff)))))))
