(ns metabase-enterprise.workspaces.query-processor.middleware
  "QP middleware for workspace table remapping.

   The job: when a query references a canonical production table (e.g. `public.orders`) on a
   workspace child instance, redirect it to the workspace-isolated copy
   (e.g. `ws_alice.public__orders`). This is the security boundary that makes workspace
   isolation real — a silent miss here would let a workspace child read or write production.

   The work is split across **two phases** because there is no single point in the QP pipeline
   where both structured query data AND fully-resolved SQL are available simultaneously:

   ## Phase 1 — [[apply-workspace-remapping]]  (preprocess; MBQL metadata mutation)

   Position: preprocessing pipeline (`metabase.query-processor.preprocess`).

   What it does: walks the cached metadata provider, finds each `:metadata/table` whose
   `(:schema, :name)` matches a remapping `from` pair, and mutates `:schema`/`:name` in place
   to the `to` pair. Downstream HoneySQL compilation reads those overridden values and emits
   workspace identifiers directly.

   Why it exists (Phase 2 alone is sufficient for the security guarantee):
     1. **Pipeline coherence.** Other middleware between preprocess and execute may read
        `:schema`/`:name` off table metadata (sandboxing, permissions checks, cache key
        generation, audit logging). Phase 1 ensures they all see the same identifiers Phase 2
        will emit, preventing subtle bugs where intermediate decisions are made against
        canonical names while the final SQL targets workspace names.
     2. **Cost is essentially zero.** A few `store-metadata!` calls; no string parsing.

   Phase 1 deliberately **does not touch native SQL**. At this stage native queries may still
   contain unresolved template tags (`{{snippet:foo}}`, `{{#42}}`, `{{date_filter}}`) that
   make the SQL un-parseable by SQLGlot. Any preprocess-time SQL rewrite would be fragile.

   ## Phase 2 — [[apply-workspace-sql-remapping]]  (execute; authoritative SQL rewrite)

   Position: execution middleware chain (`metabase.query-processor.execute`), at position 0.
   Runs after every other preprocess step — snippets expanded, card references resolved,
   parameters substituted, MBQL compiled to SQL — so the query is reduced to one canonical
   SQL string with no unresolved bits.

   What it does: parses the SQL via `sql-tools/replace-names` (SQLGlot via GraalPy), walks the
   AST, rewrites every table reference to its workspace counterpart, re-emits.

   This is the **authoritative** rewriter — it covers both MBQL-origin and native-origin
   queries, and it is the only place native SQL is rewritten.

   ## Failure contract: fail closed

   On parse failure Phase 2 throws `ex-info` with `:type qp.error-type/qp`. The query never
   reaches the warehouse. There is no fallback to the original SQL — that would silently
   breach workspace isolation. **Better a loud error than a silent leak to production.**

   ## Short-circuits (escape hatches)

     - `enabled-for-db?` is false (no remappings exist for this DB) — both phases pass through.
     - `ws.remapping/*skip-remapping?*` is bound true — both phases pass through. Used by
       display-oriented callers like `POST /api/dataset/native` that want the user to see the
       SQL they authored, not the rewritten form. Never bound on an execution path.

   ## Cost

     - Phase 1: microseconds (a few in-memory map mutations).
     - Phase 2: ~150ms per query when remappings exist (SQLGlot via GraalPy roundtrip).
       Amortized against query execution time, which is usually >150ms anyway."
  (:require
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase.driver :as driver]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.sql-tools.core :as sql-tools]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Helpers --------------------------------------------------

(def ^:private no-level
  "Empty-string sentinel for `from_db`/`from_schema` etc. when a driver doesn't emit
   that level — see [[metabase-enterprise.workspaces.table-remapping]] namespace docstring."
  "")

(defn- prune-no-level
  "Remove keys whose value is the no-level sentinel so they aren't passed to SQLGlot.
   SQLGlot's matcher only treats absent keys as wildcards; an empty-string would be
   matched literally and never hit anything in the AST."
  [m]
  (into {} (remove (fn [[_ v]] (= no-level v))) m))

(defn- build-table-replacements
  "Convert remappings map into the format expected by `sql-tools/replace-names`.
   SQLGlot handles quoting internally based on the dialect, so we pass raw identifiers.

   Remapping tuples are 3-wide: `[db schema table]`. Sentinel `\"\"` levels are pruned
   so SQLGlot treats them as wildcards rather than matching the literal empty string."
  [remappings]
  (into {}
        (map (fn [[[from-db from-schema from-table] [to-db to-schema to-table]]]
               [(prune-no-level {:db from-db :schema from-schema :table from-table})
                (prune-no-level {:db to-db   :schema to-schema   :table to-table})]))
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
   remapping. Downstream HoneySQL compilation will read the overridden values.

   Match key is `(:schema, :name)`. The `db` level isn't tracked on `:metadata/table`
   (it's a property of the database connection, not the table), so a remapping that
   only differs by `db` is invisible to Phase 1; Phase 2 catches it.

   Schema-less drivers store nil in `:metadata/table.:schema`, while remapping rows use
   the `\"\"` sentinel — they're treated as equal here so the match succeeds."
  [metadata-provider remappings]
  (doseq [[[_from-db from-schema from-name] [_to-db to-schema to-name]] remappings
          :let [norm              #(if (or (nil? %) (= no-level %)) ::absent %)
                from-schema-match (norm from-schema)
                candidates        (lib.metadata.protocols/metadatas
                                   metadata-provider
                                   {:lib/type :metadata/table, :name #{from-name}})
                table             (some #(when (= (norm (:schema %)) from-schema-match) %) candidates)]
          :when table]
    (lib.metadata.protocols/store-metadata!
     metadata-provider
     (assoc table
            :schema (when-not (= no-level to-schema) to-schema)
            :name to-name))))

;;; --------------------------------------- Phase 1: Preprocessing (MBQL only) ------------------------------------

(defenterprise apply-workspace-remapping
  "**Phase 1 — preprocess.** Mutate cached table metadata so every QP middleware between here
   and execute sees workspace identifiers, not canonical ones.

   For each remapping, walks the cached metadata provider, finds the `:metadata/table` that
   matches the `from` (schema, name) pair, and stores it back with `:schema`/`:name` set to
   the `to` pair. Downstream HoneySQL compilation reads the mutated values and emits workspace
   identifiers in the compiled SQL.

   Phase 1 is **not** the security boundary — Phase 2 is. Phase 1 exists for *pipeline
   coherence*: middleware like sandboxing, permission checks, and cache-key generation may
   read `:schema`/`:name` off table metadata and make decisions on them. Without Phase 1
   those decisions would be made against canonical names, which is invisible bug-bait. With
   Phase 1, the whole pipeline sees the same identifiers Phase 2 will emit.

   Native queries are intentionally untouched here — see the namespace docstring for why."
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
  "**Phase 2 — execute (post-compilation).** The authoritative SQL rewriter and the security
   boundary for workspace isolation.

   Runs in the execution middleware chain after every other preprocess step — snippets
   expanded, card refs resolved, parameters substituted, MBQL compiled to SQL. By this point
   the query is reduced to one canonical SQL string with no unresolved template syntax.

   Parses that SQL via `sql-tools/replace-names` (SQLGlot via GraalPy), walks the AST, and
   rewrites every `from` schema/table reference to its `to` counterpart. Re-emits. Touches
   both `:qp/compiled` and `:qp/compiled-inline`.

   Runs unconditionally for queries against remapped databases — MBQL-origin and native-origin
   alike. This is the only place native SQL is rewritten.

   **Failure contract: fail closed.** On parse failure (via `rewrite-sql`) throws `ex-info`
   with `:type qp.error-type/qp`. The query does not execute. There is deliberately no
   fallback to the original SQL — a silent pass-through would breach workspace isolation.

   Short-circuits when `enabled-for-db?` is false (no remappings) or
   `ws.remapping/*skip-remapping?*` is bound true."
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
