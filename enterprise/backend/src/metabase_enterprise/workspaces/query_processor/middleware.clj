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
     - `ws.remapping/*skip-remapping?*` is bound true — both phases pass through. For
       display-oriented paths that want the user to see the SQL they authored, not the
       rewritten form. Never bound on an execution path.

   ## Cost

     - Phase 1: microseconds (a few in-memory map mutations).
     - Phase 2: ~150ms per query when remappings exist (SQLGlot via GraalPy roundtrip).
       Amortized against query execution time, which is usually >150ms anyway."
  (:require
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   ^{:clj-kondo/ignore [:discouraged-namespace :deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]))

(set! *warn-on-reflection* true)

(defn- table-remapper
  "Build a function that remaps table metadata according to `remappings`.
   The returned fn merges `:db`, `:schema`, and `:name` overrides onto any table whose
   `(:schema, :name)` matches a `from` spec."
  [remappings]
  (let [schema-table-index (into {}
                                 (map (fn [[from-spec to-spec]]
                                        (let [{from-schema :schema from-name :table}       from-spec
                                              {to-db :db to-schema :schema to-name :table} to-spec]
                                          [[(ws.table-remapping/denormalize-level from-schema)
                                            (ws.table-remapping/denormalize-level from-name)]
                                           {:db     (ws.table-remapping/denormalize-level to-db)
                                            :schema (ws.table-remapping/denormalize-level to-schema)
                                            :name   to-name}])))
                                 remappings)]
    (fn [table-metadata]
      (merge table-metadata
             (get schema-table-index [(ws.table-remapping/denormalize-level (:schema table-metadata))
                                      (ws.table-remapping/denormalize-level (:name table-metadata))])))))

(defn- table-transform
  "Wrap a per-table function `f` into a transform suitable for [[lib.metadata/transforming-metadata-provider]].
   Only applies `f` when the metadata spec's `:lib/type` is `:metadata/table`; all other types pass through."
  [f]
  (fn [{metadata-type :lib/type} results]
    (if (= metadata-type :metadata/table)
      (into [] (map f) results)
      results)))

;;; ------------------------------------------------- Helpers --------------------------------------------------
;;;
;;; SQL-rewrite primitives (`rewrite-sql`, `build-table-replacements`,
;;; `table-spec->sqlglot-key`) live in [[metabase-enterprise.workspaces.table-remapping]]
;;; alongside the `::table-spec` shape they consume. The native-transform exec hook
;;; needs the same primitives outside this QP middleware path.

(defn- install-remapped-metadata-provider!
  "Override `:db`, `:schema`, and `:name` on table metadata in the CachedMetadataProvider
   for each remapping. Downstream HoneySQL compilation will read the overridden values.

   Match key is `(:schema, :name)` — sync doesn't populate `:db` on `:metadata/table`,
   so the canonical from-side never carries it. The `to-spec`'s `:db` IS written when
   populated; the `[:sql :metadata/table]` ->honeysql handler reads it and emits a
   `db.schema.table` (or `db.table`) qualifier. That makes cross-DB workspaces
   (currently MySQL — iso namespace lives in `:db`) routable through Phase 1 without
   needing Phase 2's SQLGlot rewriter to insert a missing qualifier.

   `denormalize-level` collapses storage's `\"\"` sentinel to `nil` on both sides of
   the schema comparison, so a remapping row with `from_schema = \"\"` matches a
   schema-less driver's `:metadata/table.:schema = nil` (and a Postgres remapping
   row with `from_schema = \"public\"` matches the literal value)."
  [mp remappings]
  (let [remapping-mp (lib.metadata/transforming-metadata-provider
                      (table-transform (table-remapper remappings))
                      mp)]
    (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
      ;; this has no body so it looks like this is a no-op. But the with-metadata-provider sets the metadata provider and then
      ;; doesn't pop it. We could use the private function that this uses: qp.store/set-metadata-provider!, or we could use the
      ;; public function `(qp.store/store-miscellaneous-value! ::qp.store/metadata-provider remapping-mp)`. But the former is
      ;; private and the latter is too general. We want this usage to really stand out.
      (qp.store/with-metadata-provider remapping-mp))))

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

   Native queries are intentionally untouched here — see the namespace docstring for why.

   ## Why `:feature :none` and not `:feature :workspaces`

   Workspace child instances bootstrap from `config.yml` *before* their token is installed
   (see `metabase-enterprise.advanced-config.file/initialize!`). A child whose remap rows
   exist but whose `:workspaces` token isn't yet active must still rewrite reads — otherwise
   the child silently leaks production data. The same rationale documented on
   [[metabase-enterprise.workspaces.transform-hooks/resolve-transform-target]] applies here:
   if remap rows exist, isolation must engage regardless of token state. The internal
   `(ws.remapping/enabled-for-db? db-id)` check is the actual gate."
  :feature :none
  [{db-id :database, mp :lib/metadata, :as query}]
  (if-not (ws.remapping/enabled-for-db? db-id)
    query
    (let [remappings (ws.remapping/remappings-for-db db-id)]
      (if (empty? remappings)
        query
        (do
          (install-remapped-metadata-provider! mp remappings)
          query)))))

;;; ----------------------------- Phase 2: Post-Compilation SQL Rewrite (authoritative) ----------------------------

(defn- rewrite-compiled-map
  "Rewrite table references in a compiled query map ({:query sql, :params [...]}). Parses the
   complete SQL, replaces production schema/table refs with workspace equivalents, re-emits."
  [driver compiled-map remappings]
  (let [sql       (:query compiled-map)
        rewritten (ws.table-remapping/rewrite-sql driver sql remappings)]
    (assoc compiled-map :query rewritten)))

(defn- rewrite-stages
  "Recursively walk an MBQL 5 query's `:stages` and rewrite the `:native` SQL on every native
   stage, descending into each join's own `:stages` as well.

   The stage's `:native` is the **source of truth** for native-origin SQL.
   `[[metabase.query-processor.execute/run]]` calls `[[lib/->legacy-MBQL]]` immediately
   before driver dispatch; that conversion rebuilds the legacy top-level `:native` from
   `(get-in query [:stages -1 :native])`. So patching legacy `:native` directly is futile
   -- it gets overwritten. Patch the stage and `lib/->legacy-MBQL` propagates the rewrite
   to the legacy form naturally."
  [driver stages remappings]
  (mapv (fn [stage]
          (cond-> stage
            (and (= :mbql.stage/native (:lib/type stage))
                 (string? (:native stage)))
            (update :native #(ws.table-remapping/rewrite-sql driver % remappings))

            (seq (:joins stage))
            (update :joins
                    (fn [joins]
                      (mapv (fn [join]
                              (cond-> join
                                (seq (:stages join))
                                (update :stages #(rewrite-stages driver % remappings))))
                            joins)))))
        stages))

(defenterprise apply-workspace-sql-remapping
  "**Phase 2 — execute (post-compilation).** The authoritative SQL rewriter and the security
   boundary for workspace isolation.

   Runs in the execution middleware chain after every other preprocess step — snippets
   expanded, card refs resolved, parameters substituted, MBQL compiled to SQL. By this point
   the query is reduced to one canonical SQL string with no unresolved template syntax.

   Parses that SQL via `sql-tools/replace-names` (SQLGlot via GraalPy), walks the AST, and
   rewrites every `from` schema/table reference to its `to` counterpart. Re-emits.

   ## SQL carrier hierarchy (read this before changing what gets patched)

   Native SQL has three carriers in the query map and only one is the source of truth:

     - `(get-in query [:stages -1 :native])` — **source of truth**. Set by preprocess
       (`substitute-native-parameters*`); read by `compile*` and by `lib/->legacy-MBQL`.
     - `(:qp/compiled query :query)` — compile-time snapshot taken from the stage by
       `compile*`. Not re-derived at execute time. Read by
       `add-native-form-to-result-metadata` to produce the user-facing `:native_form`,
       and by the `(not (:native query)) (assoc :native (:qp/compiled query))` branch
       in `qp.execute/run` for MBQL-origin queries (where the stage isn't native).
     - `(:native query :query)` — legacy top-level. **Always re-derived** by
       `lib/->legacy-MBQL` in `qp.execute/run` from `(get-in query [:stages -1 :native])`.
       JDBC reads from this carrier. Patching it directly is futile: the rebuild from
       the stage clobbers any patch.

   Phase 2 patches **stage `:native` and `:qp/compiled`**, in that order. The stage patch
   is the security boundary (flows through `lib/->legacy-MBQL` to legacy `:native` to
   JDBC). The `:qp/compiled` patch keeps the user-visible `:native_form` consistent with
   what hits the warehouse and covers the MBQL-origin path through `qp.execute/run`'s
   rename branch.

   Runs unconditionally for queries against remapped databases — MBQL-origin and native-origin
   alike. This is the only place native SQL is rewritten.

   **Failure contract: fail closed.** On parse failure (via `rewrite-sql`) throws `ex-info`
   with `:type qp.error-type/qp`. The query does not execute. There is deliberately no
   fallback to the original SQL — a silent pass-through would breach workspace isolation.

   Short-circuits when `enabled-for-db?` is false (no remappings) or
   `ws.remapping/*skip-remapping?*` is bound true.

   ## Why `:feature :none` and not `:feature :workspaces`

   See the rationale on [[apply-workspace-remapping]]. Same answer: workspace children
   must rewrite reads even when the `:workspaces` token isn't active (boot sequence,
   token expiry, etc.). The internal `(enabled-for-db? db-id)` is the gate."
  :feature :none
  [qp]
  (fn [{:keys [database] :as query} rff]
    (cond
      (not (ws.remapping/enabled-for-db? database))
      (qp query rff)

      ;; Tier B fail-closed: workspace remap is incompatible with DB routing
      ;; (which swaps the destination connection — see GHY-3484 audit conflict
      ;; notes) and connection impersonation (which binds a warehouse role that
      ;; almost certainly lacks GRANT on workspace schemas).
      (qp.middleware.enterprise/currently-db-routed?)
      (throw (ex-info "Database routing is incompatible with workspace table remapping"
                      {:type qp.error-type/qp :database-id database}))

      ;; impersonation-enforced-for-db? throws when no current user is bound
      ;; (sync/transform contexts). Skip the check there; impersonation can't
      ;; engage without a user.
      (and api/*current-user-id*
           (perms/impersonation-enforced-for-db? {:id database}))
      (throw (ex-info "Connection impersonation is incompatible with workspace table remapping"
                      {:type qp.error-type/qp :database-id database}))

      :else
      (let [remappings (ws.remapping/remappings-for-db database)]
        (if (empty? remappings)
          (qp query rff)
          (let [driver  driver/*driver*
                rewrite #(rewrite-compiled-map driver % remappings)
                query   (cond-> query
                          ;; Stage `:native` is the source of truth for native-origin
                          ;; SQL. `lib/->legacy-MBQL` (in `qp.execute/run`) rebuilds the
                          ;; legacy top-level `:native` from `[:stages -1 :native]`, so
                          ;; this is the patch that actually reaches the warehouse.
                          (:lib/type query)
                          (update :stages #(rewrite-stages driver % remappings))

                          ;; `:qp/compiled` is a compile-time snapshot, not re-derived
                          ;; at execute time. Read by `add-native-form-to-result-metadata`
                          ;; for the user-facing `:native_form`, and by the rename branch
                          ;; in `qp.execute/run` when the stage isn't native (MBQL-origin).
                          (:qp/compiled query)
                          (update :qp/compiled rewrite)

                          (:qp/compiled-inline query)
                          (update :qp/compiled-inline rewrite))]
            (qp query rff)))))))
