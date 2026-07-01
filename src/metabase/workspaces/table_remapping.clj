(ns metabase.workspaces.table-remapping
  "OSS namespace for workspace table remapping.

  Holds two things:

  - The `defenterprise` sync/display hooks (EE implementation in
    `metabase-enterprise.workspaces.table-remapping`).
  - Shared table-remapping building blocks used by both the workspaces and
    transform test-run features: the metadata-provider override
    ([[override-metadata-provider]]), the native-SQL rewrite
    ([[rewrite-table-refs]]), and the reference-safety check
    ([[verify-only-references]])."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]))

;;; ============================================================================
;;; Shared table-remapping building blocks
;;; ============================================================================

;;; --------------------------------- MBQL override ---------------------------------

(defn override-metadata-provider
  "Wrap `parent-provider` so every `:metadata/table` it returns is `merge`d with
  `(table->overrides table-metadata)`. A nil return from `table->overrides` is a
  passthrough (the table is unchanged); all non-`:metadata/table` results pass
  through untouched. Returns the wrapped provider."
  [table->overrides parent-provider]
  (lib.metadata/transforming-metadata-provider
   (fn [{metadata-type :lib/type} results]
     (if (= metadata-type :metadata/table)
       (mapv (fn [t] (merge t (table->overrides t))) results)
       results))
   parent-provider))

;;; --------------------------------- Native rewrite ---------------------------------

(defn rewrite-table-refs
  "Rewrite table references in `sql` via `sql-tools/replace-names`, redirecting each
  `from`-key in `replacements` to its `to`-value. Returns the rewritten SQL.

  `replacements` is a `sql-tools/replace-names` map: `{:tables {<from> <to>}}`,
  each `from`/`to` a `{:schema <s> :table <t>}` (or bare `{:table <t>}`) spec.

  `opts`:
  - `:allow-unused?`   — forwarded to `replace-names` (default false): when true,
                         replacement entries that don't appear in `sql` are allowed.
  - `:on-parse-error`  — `(fn [sql cause])` called when `replace-names` throws, to
                         translate the failure into a caller-specific error. If
                         omitted, the original exception propagates."
  ([driver sql replacements]
   (rewrite-table-refs driver sql replacements {}))
  ([driver sql replacements {:keys [allow-unused? on-parse-error]}]
   (try
     (sql-tools/replace-names driver sql replacements {:allow-unused? (boolean allow-unused?)})
     (catch Throwable e
       (if on-parse-error
         (on-parse-error sql e)
         (throw e))))))

;;; --------------------------------- Verify guard ---------------------------------

(defn- dangling-qualifier-tokens
  "The `forbidden-lc` tokens (lowercased) that the parser reports as a
  `:missing-table-alias` in `sql` — i.e. a `schema.table.col` qualifier whose
  table is not in scope."
  [driver sql forbidden-lc]
  (let [errors (try
                 (:errors (sql-tools/field-references driver sql))
                 (catch Throwable _ #{}))]
    (into #{}
          (keep (fn [{:keys [type name]}]
                  (when (and (= type :missing-table-alias)
                             (contains? forbidden-lc (some-> name u/lower-case-en)))
                    (u/lower-case-en name))))
          errors)))

(defn- token-survives-as-string-literal?
  "True when `token` appears in `sql` as a whole identifier — case-sensitive, with
  identifier boundaries (underscore counts as an identifier char)."
  [^String token ^String sql]
  (let [pat (re-pattern (str "(?<![A-Za-z0-9_])"
                             (java.util.regex.Pattern/quote token)
                             "(?![A-Za-z0-9_])"))]
    (boolean (re-find pat sql))))

(defn verify-only-references
  "Guard `sql` so it references only allowed tables and leaks no forbidden token.
  Returns `sql` on success; on any violation calls `on-violation` (which is
  expected to throw the caller's typed error). The four guards:

  1. **non-empty refs** — when `allowed-refs` is non-empty but `sql` has no
     resolvable table references (e.g. it failed to parse), fire. A zero-table
     caller passes an empty `allowed-refs` and skips this guard vacuously.
  2. **refs ⊆ allowed** — every table reference in `sql`, after `normalize-ref`,
     must be in `allowed-refs` or its bare table name in `safe-aliases`.
  3. **no dangling qualifier** — no `forbidden-tokens` token survives as a dangling
     column qualifier.
  4. **no surviving string-literal token** — no `forbidden-tokens` token survives
     as a whole identifier in a string literal (case-sensitive).

  The options map:
  - `normalize-ref`    — `(fn [{:keys [schema table]}])` → a canonical
                         `{:schema :table}` tuple, applied to each table reference in
                         `sql`. The caller must pass `allowed-refs` already
                         normalized the same way.
  - `allowed-refs`     — set of already-`normalize-ref`d `{:schema :table}` tuples.
  - `forbidden-tokens` — set of original identifier-token strings that must not
                         survive (guards 3 and 4).
  - `safe-aliases`     — set of bare table-name strings exempt from guard 2 (e.g. a
                         caller-bound CTE name). Default `#{}`.
  - `on-violation`     — `(fn [msg ex-data])` → throws the caller's typed error."
  [driver sql {:keys [normalize-ref allowed-refs forbidden-tokens safe-aliases on-violation]
               :or   {safe-aliases #{}}}]
  (let [refs (sql-tools/referenced-tables-raw driver sql)]
    ;; Guard 1: non-empty refs (only when something is expected). A parse error on a
    ;; rewritten SQL loses refs that existed, so the guard must fire.
    (when (and (seq allowed-refs) (empty? refs))
      (on-violation
       (str "The rewritten SQL has no resolvable table references"
            " (it may have failed to parse).")
       {:guard ::non-empty-refs :sql sql}))
    ;; Guard 2: every ref ∈ allowed-refs OR a known-safe alias.
    (let [safe-lc (into #{} (map u/lower-case-en) safe-aliases)
          stray   (remove (fn [{:keys [table] :as ref}]
                            (let [n (normalize-ref ref)]
                              (or (allowed-refs n)
                                  (contains? safe-lc (u/lower-case-en table)))))
                          refs)]
      (when (seq stray)
        (on-violation
         (str "The rewritten SQL references table(s) that are not allowed: "
              (pr-str (mapv normalize-ref stray)) ".")
         {:guard ::refs-subset-allowed :stray-refs (mapv normalize-ref stray) :allowed allowed-refs})))
    ;; Guard 3 + 4: no original token survives (dangling qualifier or string literal).
    (let [forbidden-lc (into #{} (map u/lower-case-en) forbidden-tokens)
          dangling     (dangling-qualifier-tokens driver sql forbidden-lc)]
      (when-let [token (first dangling)]
        (on-violation
         (str "The original table " (pr-str token) " still appears as a dangling"
              " column qualifier (e.g. `" token ".col`) in the rewritten SQL.")
         {:guard ::token-survival :surviving-token token :sql sql}))
      (doseq [token forbidden-tokens]
        (when (token-survives-as-string-literal? token sql)
          (on-violation
           (str "The original identifier " (pr-str token) " still appears in the"
                " rewritten SQL (e.g. inside a string literal).")
           {:guard ::token-survival :surviving-token token :sql sql}))))
    sql))

;;; ============================================================================
;;; Sync / display defenterprise hooks (EE-impl in metabase-enterprise.*)
;;; ============================================================================

(defenterprise workspace-remap-schema+name
  "In workspace mode, a Table at the canonical identity `from-spec` may be backed
  by a physically-different warehouse table recorded in `table_remapping`. Returns
  a `{:db :schema :name}` map for the workspace destination when a remapping
  exists so sync asks the driver about the isolated warehouse location; returns
  nil otherwise (OSS fallback) so the driver is queried at the logical identity.

  Both input and output are the same `{:db :schema :name}` shape — symmetric so
  call sites don't have to translate between vector tuples and maps. Slot values
  are normalized to the form `:model/Table` rows actually carry: a string for
  engines that emit that AST position; `nil` for engines that don't. For MySQL,
  both `:db` and `:schema` are `nil` on a Table row (the connection's bound DB
  serves as the implicit catalog; MySQL has no schemas)."
  metabase-enterprise.workspaces.table-remapping
  [_db-id _from-spec]
  nil)

(defenterprise filter-workspace-side-tables
  "Drop tuples from a `describe-database` result whose `(schema, name)` matches
  the to-side of any active TableRemapping for `db-id`. The workspace's physical
  isolation tables are surfaced by the warehouse driver but must not become
  `:model/Table` rows in app-db -- they back canonical Tables via remap, not
  their own identity. OSS fallback is identity (no filtering). See DEV-1898."
  metabase-enterprise.workspaces.table-remapping
  [tuples _db-id]
  tuples)

(defenterprise expand-schema-names-with-workspace
  "Augment a list of `:schema-names` with workspace-isolation schemas
  (`to_schema` values) for any remap whose `from_schema` appears in the input.
  Lets sync's FK fetch reach the warehouse tables that physically back canonical
  Tables on a workspace child. OSS fallback is identity."
  metabase-enterprise.workspaces.table-remapping
  [schema-names _db-id]
  schema-names)

(defenterprise inject-workspace-canonical-tuples
  "Augment a `describe-database` result with synthetic canonical-side tuples for
  any `from_*` remap row whose to-side is materialized in the warehouse. The
  canonical name doesn't physically exist on a workspace child (only the
  isolation-schema copy does), so without this it'd be diffed against app-db's
  Table rows and silently retired. OSS fallback is identity."
  metabase-enterprise.workspaces.table-remapping
  [tuples _db-id]
  tuples)

(defenterprise rewrite-fk-result-canonical
  "Translate workspace-side identifiers in a `describe-fks` result back to canonical
  names. When sync redirects FK lookups to the workspace warehouse table, the
  returned rows reference workspace-side `(schema, name)` on both sides; app-db's
  view needs them in canonical terms so subsequent FK resolution finds the
  matching `:model/Table`. OSS fallback is identity (no rewriting)."
  metabase-enterprise.workspaces.table-remapping
  [rows _db-id]
  rows)

(defenterprise call-with-display-context
  "Invoke `thunk` with workspace remapping suppressed. Used by display-only paths
  (the QB's `POST /api/dataset/native` SQL preview, anywhere we surface compiled
  SQL to the user) so users see canonical-schema SQL instead of the workspace
  isolation schema. The query still executes against the isolation schema at
  warehouse time -- this only affects what the user *sees* in the SQL preview.

  OSS fallback: just calls the thunk. EE impl binds
  `ws.remapping/*skip-remapping?*` true around it, which short-circuits both
  Phase 1 (metadata override) and Phase 2 (SQLGlot rewrite).

  Use [[with-display-context]] for the macro form."
  metabase-enterprise.workspaces.table-remapping
  [thunk]
  (thunk))

(defmacro with-display-context
  "Suppress workspace remapping inside `body` so compiled SQL surfaces in canonical
  vocabulary instead of isolation-schema vocabulary. Wrapper around
  [[call-with-display-context]]."
  [& body]
  `(call-with-display-context (fn [] ~@body)))

(defenterprise call-with-fk-probe-iso-dbs
  "Invoke `f` once per iso-`:db` slot the FK probe needs to visit on a workspaced
  database. `f` is called with no arguments inside a `with-swapped-connection-details`
  scope (or no swap if iso-`:db` equals the canonical bound `:db`). Callers collect
  results across invocations and merge.

  On MySQL workspaces with a cross-DB swap, the iso table lives in a different
  bound database than the canonical one; describe-fks must run with the JDBC
  connection pointed at the iso DB to discover its FKs.

  OSS fallback: just calls `f` once with no swap -- the warehouse FK probe runs
  against the canonical connection only."
  metabase-enterprise.workspaces.table-remapping
  [_db-id f]
  [(f)])

(defenterprise canonical-schema+name
  "Inverse of `workspace-remap-schema+name`. Given an isolation-side
  `to-spec` (`{:db :schema :name}` for the workspace destination), return a
  `{:db :schema :name}` map for the canonical table if a `TableRemapping` row
  records that pair as the workspace destination of a canonical table; return
  nil otherwise.

  Use at write-side `:model/Table` lookups where the transform pipeline has
  already mutated `:target.schema` to the workspace output schema, but the
  app-db Table row lives at the canonical schema. OSS fallback is nil so
  callers fall through to the unchanged identity.

  Both input and output are the same `{:db :schema :name}` shape — symmetric
  with `workspace-remap-schema+name` and matches `:model/Table` row vocabulary.
  Slot values are driver-normalized: a string for engines that emit that AST
  position; `nil` for engines that don't. For MySQL, both `:db` and `:schema`
  are `nil` because that's what `:model/Table` rows on MySQL store, and a
  Table-row predicate on `:schema \"\"` will not match a row stored as
  `:schema nil`.

  Caveats (tracked separately):
  - Trusts the active `TableRemapping` row set. If a `WorkspaceDatabase`
    deprovision leaves stale rows behind, this hook will still translate
    against them. See the deprovision-clears-remappings cleanup in
    `workspaces-v2.md` worklog.
  - The H7 second half (cross-DB workspaces on BigQuery) needs
    callers to thread `:db` through the spec end-to-end. Both this hook and
    `add-transform-target-mapping!` now carry the slot."
  metabase-enterprise.workspaces.table-remapping
  [_db-id _to-spec]
  nil)
