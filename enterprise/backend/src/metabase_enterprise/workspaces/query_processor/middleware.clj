(ns metabase-enterprise.workspaces.query-processor.middleware
  "QP middleware for workspace table remapping.

   The job: when a query references a canonical production table (e.g. `public.orders`) on a
   workspace child instance, redirect it to the workspace-isolated copy
   (e.g. `ws_alice.public__orders`). This is the security boundary that makes workspace
   isolation real — a silent miss here would let a workspace child read or write production.

   ## Phase 1 — [[apply-workspace-remapping]]  (around middleware; emission-time remapping)

   Position: around-middleware in `metabase.query-processor/around-middleware`.
   Wraps the entire pipeline (preprocess + compile + execute).

   What it does: binds [[metabase.workspaces.table-remapping/*table-remapper*]] to a
   a remapper function so that HoneySQL compilation emits workspace identifiers
   at the two SQL-emission points (`->honeysql [:sql :metadata/table]` and
   `field-source-table-aliases`). No metadata provider mutation — the table metadata stays
   canonical; only the SQL output is remapped.

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

     - Phase 1: negligible (protocol dispatch per table reference during compilation).
     - Phase 2: ~150ms per query when remappings exist (SQLGlot via GraalPy roundtrip).
       Amortized against query execution time, which is usually >150ms anyway."
  (:require
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.workspaces.table-remapping :as oss.table-remapping]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Helpers --------------------------------------------------
;;;
;;; SQL-rewrite primitives (`rewrite-sql`, `build-table-replacements`,
;;; `table-spec->sqlglot-key`) live in [[metabase-enterprise.workspaces.table-remapping]]
;;; alongside the `::table-spec` shape they consume. The native-transform exec hook
;;; needs the same primitives outside this QP middleware path.

;;; --------------------------------- Phase 1: Emission-time table remapping ------------------------------------

(defn- build-remap-lookup
  "Build a lookup map from `(denormalized-schema, table-name)` → `{:schema :name :db}` for
   fast matching at emission time. `denormalize-level` collapses the `\"\"` storage sentinel
   to nil so that a remapping row with `from_schema = \"\"` matches a schema-less driver's
   `:metadata/table :schema nil`."
  [remappings]
  (into {} (map (fn [[from-spec to-spec]]
                  (let [{from-schema :schema from-name :table} from-spec
                        {to-db :db to-schema :schema to-name :table} to-spec
                        from-db-dn (ws.table-remapping/denormalize-level (:db from-spec))
                        to-db-dn   (ws.table-remapping/denormalize-level to-db)]
                    [[(ws.table-remapping/denormalize-level from-schema) from-name]
                     (cond-> {:schema (ws.table-remapping/denormalize-level to-schema)
                              :name   to-name}
                       ;; Only inject :db when the to-side differs from the from-side.
                       ;; Drivers like BigQuery handle project/catalog qualification
                       ;; themselves; injecting :db when it hasn't changed would add
                       ;; an unexpected third component to the identifier. When :db
                       ;; genuinely changes (e.g. MySQL cross-DB workspaces), the
                       ;; injection is needed so ->honeysql emits the right qualifier.
                       (and to-db-dn (not= to-db-dn from-db-dn))
                       (assoc :db to-db-dn))])))
        remappings))

(defn workspace-table-remapper
  "Return a [[oss.table-remapping/TableRemapper]] suitable for binding to
   [[oss.table-remapping/*table-remapper*]]. Precomputes a lookup map from
   `remappings` for O(1) matching at emission time. When no remapping matches,
   passes coordinates through unchanged (same contract as the identity remapper)."
  [remappings]
  (let [lookup (build-remap-lookup remappings)]
    (reify oss.table-remapping/TableRemapper
      (remap-table [_ schema table-name]
        (or (get lookup [(ws.table-remapping/denormalize-level schema) table-name])
            {:schema schema :name table-name})))))

(defenterprise apply-workspace-remapping
  "**Phase 1 — around middleware.** Binds [[oss.table-remapping/*table-remapper*]] so HoneySQL
   compilation emits workspace identifiers instead of canonical ones.

   This wraps the entire inner pipeline (preprocess + compile + execute) so the
   binding is active during compilation. No metadata provider mutation.

   Phase 2 ([[apply-workspace-sql-remapping]]) remains the authoritative security
   boundary for native SQL.

   ## Why `:feature :none` and not `:feature :workspaces`

   Workspace child instances bootstrap from `config.yml` *before* their token is installed
   (see `metabase-enterprise.advanced-config.file/initialize!`). A child whose remap rows
   exist but whose `:workspaces` token isn't yet active must still rewrite reads — otherwise
   the child silently leaks production data. The internal
   `(ws.remapping/enabled-for-db? db-id)` check is the actual gate."
  :feature :none
  [qp]
  (fn [{db-id :database :as query} rff]
    (if-not (ws.remapping/enabled-for-db? db-id)
      (qp query rff)
      (let [remappings (ws.remapping/remappings-for-db db-id)]
        (if (empty? remappings)
          (qp query rff)
          (binding [oss.table-remapping/*table-remapper* (workspace-table-remapper remappings)]
            (qp query rff)))))))

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
