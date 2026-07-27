(ns metabase-enterprise.table-remapping.middleware
  "QP middleware for table remapping.

   The job: when a query references a table (e.g. `public.orders`), redirect it to another
   table (e.g. `ws_alice.orders_copy`). Remappings are supplied programmatically by wrapping
   the QP call in [[metabase-enterprise.table-remapping.core/with-table-remapping]], which
   binds [[*remappings*]] for the duration of the body. When nothing is bound, both
   middleware phases are pass-throughs.

   The work is split across **two phases** because there is no single point in the QP
   pipeline where both structured query data AND fully-resolved SQL are available
   simultaneously:

   ## Phase 1 — [[apply-table-remapping]]  (preprocess; MBQL metadata mutation)

   Walks the cached metadata provider, finds each `:metadata/table` whose `(:schema, :name)`
   matches a remapping's from-side, and overrides `:schema`/`:name` with the to-side.
   Downstream HoneySQL compilation reads the overridden values and emits remapped
   identifiers directly. Native SQL is intentionally untouched here — at this stage it may
   still contain unresolved template tags that make it un-parseable.

   ## Phase 2 — [[apply-table-sql-remapping]]  (execute; authoritative SQL rewrite)

   Runs after every preprocess step — snippets expanded, card references resolved,
   parameters substituted, MBQL compiled to SQL — so the query is reduced to one canonical
   SQL string. Parses it via `sql-tools/replace-names` (SQLGlot), rewrites every matching
   table reference, re-emits. This covers both MBQL-origin and native-origin queries and is
   the only place native SQL is rewritten.

   ## Failure contract: fail closed

   On parse failure Phase 2 throws `ex-info` with `:type qp.error-type/qp`. The query never
   reaches the warehouse. There is no fallback to the original SQL — the caller asked for
   remapping, so silently running the un-remapped query would be a correctness (and
   potentially isolation) bug."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   ^{:clj-kondo/ignore [:discouraged-namespace :deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::remapping
  "A single table remapping. `:from-schema` / `:to-schema` are nil (or absent) for tables
   that live outside any schema (e.g. on schema-less drivers like MySQL)."
  [:map
   [:from-schema {:optional true} [:maybe :string]]
   [:from-table  :string]
   [:to-schema   {:optional true} [:maybe :string]]
   [:to-table    :string]])

(mr/def ::remappings
  [:sequential ::remapping])

(def ^:dynamic *remappings*
  "The active remappings for the current QP call, a sequence of [[::remapping]] maps, or nil
   when remapping is disabled. Bind via
   [[metabase-enterprise.table-remapping.core/with-table-remapping]]."
  nil)

;;; --------------------------------------- Phase 1: Preprocessing (MBQL only) ------------------------------------

(defn- table-remapper
  "Build a function that remaps table metadata according to `remappings`. The returned fn
   overrides `:schema` and `:name` on any table whose `(:schema, :name)` matches a
   remapping's from-side."
  [remappings]
  (let [index (into {}
                    (map (fn [{:keys [from-schema from-table to-schema to-table]}]
                           [[from-schema from-table] {:schema to-schema, :name to-table}]))
                    remappings)]
    (fn [table-metadata]
      (merge table-metadata (get index [(:schema table-metadata) (:name table-metadata)])))))

(defn- table-transform
  "Wrap a per-table function `f` into a transform suitable for
   [[lib.metadata/transforming-metadata-provider]]. Only applies `f` when the metadata
   spec's `:lib/type` is `:metadata/table`; all other types pass through."
  [f]
  (fn [{metadata-type :lib/type} results]
    (if (= metadata-type :metadata/table)
      (into [] (map f) results)
      results)))

(defn- install-remapped-metadata-provider!
  "Replace the QP store's metadata provider with one that overrides `:schema` and `:name` on
   table metadata for each remapping. Downstream HoneySQL compilation will read the
   overridden values."
  [remappings]
  (let [remapping-mp (lib.metadata/transforming-metadata-provider
                      (table-transform (table-remapper remappings))
                      (qp.store/metadata-provider))]
    (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
      (qp.store/with-metadata-provider remapping-mp))))

(defenterprise apply-table-remapping
  "**Phase 1 — preprocess.** Override cached table metadata so every QP middleware between
   here and execute sees remapped identifiers, not the original ones.

   Phase 1 is not the boundary that guarantees remapping — Phase 2 is. Phase 1 exists for
   *pipeline coherence*: middleware like sandboxing, permission checks, and cache-key
   generation may read `:schema`/`:name` off table metadata and make decisions on them.
   With Phase 1, the whole pipeline sees the same identifiers Phase 2 will emit.

   `:feature :none` — remapping is opt-in via [[*remappings*]]; there is nothing to gate on
   a token. The binding itself is the gate."
  :feature :none
  [query]
  (if (empty? *remappings*)
    query
    (do
      (install-remapped-metadata-provider! *remappings*)
      query)))

;;; ----------------------------- Phase 2: Post-Compilation SQL Rewrite (authoritative) ----------------------------

(defn- remapping->table-replacement
  "Project a [[::remapping]] into a `[from to]` entry for `sql-tools/replace-names`'
   `:tables` map. Nil schemas are omitted so SQLGlot treats the slot as a wildcard rather
   than matching a literal empty value."
  [{:keys [from-schema from-table to-schema to-table]}]
  [(cond-> {:table from-table}
     from-schema (assoc :schema from-schema))
   (cond-> {:table to-table}
     to-schema (assoc :schema to-schema))])

(defn- rewrite-sql
  "Parse `sql` and rewrite every table reference matching a remapping's from-side to its
   to-side. Returns the rewritten SQL. Fail-closed: throws `ex-info` with
   `:type qp.error-type/qp` on parse failure."
  [driver sql remappings]
  (try
    (let [replacements {:tables (into {} (map remapping->table-replacement) remappings)}]
      (sql-tools/replace-names driver sql replacements {:allow-unused? true}))
    (catch Exception e
      (throw (ex-info "Table remapping failed: cannot parse SQL"
                      {:type   qp.error-type/qp
                       :sql    sql
                       :driver driver}
                      e)))))

(defn- rewrite-stages
  "Recursively walk an MBQL 5 query's `:stages` and rewrite the `:native` SQL on every
   native stage, descending into each join's own `:stages` as well.

   The stage's `:native` is the source of truth for native-origin SQL:
   [[metabase.query-processor.execute/run]] calls `lib/->legacy-MBQL` immediately before
   driver dispatch, and that conversion rebuilds the legacy top-level `:native` from
   `(get-in query [:stages -1 :native])`. So patching legacy `:native` directly is futile —
   it gets overwritten. Patch the stage and the rewrite propagates to the legacy form
   naturally."
  [driver stages remappings]
  (mapv (fn [stage]
          (cond-> stage
            (and (= :mbql.stage/native (:lib/type stage))
                 (string? (:native stage)))
            (update :native #(rewrite-sql driver % remappings))

            (seq (:joins stage))
            (update :joins
                    (fn [joins]
                      (mapv (fn [join]
                              (cond-> join
                                (seq (:stages join))
                                (update :stages #(rewrite-stages driver % remappings))))
                            joins)))))
        stages))

(defenterprise apply-table-sql-remapping
  "**Phase 2 — execute (post-compilation).** The authoritative SQL rewriter.

   Runs in the execution middleware chain after every preprocess step, when the query is
   reduced to one canonical SQL string with no unresolved template syntax. Parses that SQL
   via `sql-tools/replace-names` (SQLGlot), rewrites every from-side table reference to its
   to-side counterpart, re-emits.

   Patches, in order:

     - stage `:native` — the source of truth; flows through `lib/->legacy-MBQL` to the
       legacy `:native` that JDBC reads.
     - `:qp/compiled` — a compile-time snapshot, not re-derived at execute time; read by
       `add-native-form-to-result-metadata` for the user-facing `:native_form` and by the
       rename branch in `qp.execute/run` for MBQL-origin queries.
     - `:qp/compiled-inline` — same, for the inlined-parameters form.

   **Failure contract: fail closed.** On parse failure throws `ex-info` with
   `:type qp.error-type/qp`; the query does not execute.

   `:feature :none` — see [[apply-table-remapping]]."
  :feature :none
  [qp]
  (fn [query rff]
    (let [remappings *remappings*]
      (if (empty? remappings)
        (qp query rff)
        (let [driver  driver/*driver*
              rewrite (fn [compiled-map]
                        (update compiled-map :query #(rewrite-sql driver % remappings)))
              query   (cond-> query
                        (:lib/type query)
                        (update :stages #(rewrite-stages driver % remappings))

                        (:qp/compiled query)
                        (update :qp/compiled rewrite)

                        (:qp/compiled-inline query)
                        (update :qp/compiled-inline rewrite))]
          (qp query rff))))))
