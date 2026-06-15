(ns metabase.transforms.test-run.resolve
  "Resolve a transform into a fully-resolved, executable artifact for a test run.

  Given a transform value, the scratch-table `mapping` produced by
  [[metabase.transforms.test-run.scratch/seed!]], and the redirected
  `output-target`, [[resolve-test-transform]] produces:

  ```
  {:driver         <keyword>
   :compiled       <::compiled>   ; the qp.compile/compile output, modified in place
   :target         <output-target>
   :parser-backend <keyword>}     ; the parser backend pinned for this run
  ```

  The `:compiled` map is `qp.compile/compile`'s output carried **intact** — the
  same `{:query <sql-string> :params <vec> :lib/type ...}` shape the production
  execute path consumes. We modify it only via `(update compiled :query ...)`,
  mirroring the workspace hook idiom at `transforms_base/query.clj:104-107`. We
  never deconstruct it or hand-rebuild a `:lib/type` map. Step 6 hands `:compiled`
  to `driver/run-transform!` verbatim.

  ## Two compile paths (see the Native/MBQL split decision in the plan)

  - **Native-SQL transforms** compile via `transforms-base.u/compile-source`,
    then the compiled SQL string is rewritten with
    `sql-tools/replace-names` to point input-table references at scratch tables.
    Table-qualified-column native SQL (`SELECT orders.id FROM orders`) leaves a
    dangling qualifier after the FROM-only rewrite; guard 3 (token-survival)
    catches that and fails closed with a typed error — an accepted PoC
    limitation.

  - **MBQL transforms** compile under a metadata-provider override: the input
    tables' `:name`/`:schema` are overridden to their scratch specs *before*
    compilation, so the compiler emits scratch-qualified SQL natively. No string
    rewrite. (Validated by the plan's Step 0b2 spike.)

  Both paths run the same three verify guards (defense-in-depth).

  ## Verify — three guards (both paths)

  1. **non-empty refs.** `sql-tools/referenced-tables-raw` of the final SQL must
     be non-empty. (A parse error returns `[]`, which must FAIL, not pass
     vacuously.)
  2. **refs ⊆ scratch.** Every referenced table, after normalization (nil schema
     → driver default schema; lowercase fold), must be a scratch table.
  3. **token-survival.** No original (real) schema/table identifier may survive
     anywhere in the final SQL, identifier-boundary-aware (underscore is an
     identifier char; quoted identifiers count). String-literal occurrences
     (`WHERE x = 'orders'`) fail closed BY DESIGN — the error names the surviving
     token.

  Any guard failure, or any compile/rewrite failure, becomes ONE typed error:
  `ex-info` with `:error-type ::cannot-test-run` (plus `:guard` and the offending
  tokens/refs), consistent with the error taxonomy of
  [[metabase.transforms.test-run.inputs]]."
  (:require
   [clojure.string :as str]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.settings :as sql-tools.settings]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.log :as log])
  (:import
   (clojure.lang ExceptionInfo)
   (org.graalvm.polyglot PolyglotException)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Typed error
;;; ---------------------------------------------------------------------------

(defn- cannot-test-run!
  "Throw the single typed \"can't be test-run\" error.

  `:error-type` is `::cannot-test-run`; `extra` carries guard-specific detail
  (`:guard`, offending tokens/refs). `cause` is the wrapped backend exception, if any."
  ([msg extra] (cannot-test-run! msg extra nil))
  ([msg extra cause]
   (throw (ex-info msg (assoc extra :error-type ::cannot-test-run) cause))))

;;; ---------------------------------------------------------------------------
;;; Native path: build replacements + rewrite
;;; ---------------------------------------------------------------------------

(defn- mapping->replacements
  "Build a `sql-tools/replace-names` `:tables` replacements map from the scratch
  `mapping` (`{real-spec → scratch-spec}`, each spec `{:schema :table}`).

  For each real table we register TWO keys, both pointing at the scratch target:
  a bare `{:table <name>}` key (matches unqualified `FROM orders`) and a
  schema-qualified `{:schema :table}` key (matches `FROM public.orders` and
  quoted `\"public\".\"orders\"`). On the sqlglot backend an unused key is a
  no-op, so registering both is safe and covers every qualification form a native
  transform might use."
  [mapping]
  {:tables
   (reduce-kv
    (fn [acc {real-schema :schema real-table :table} scratch-spec]
      (let [target {:schema (:schema scratch-spec) :table (:table scratch-spec)}]
        (cond-> (assoc acc {:table real-table} target)
          real-schema (assoc {:schema real-schema :table real-table} target))))
    {}
    mapping)})

(defn rewrite-native-sql
  "Rewrite `sql` with `sql-tools/replace-names`, redirecting input-table refs in
  `mapping` (`{real-spec → scratch-spec}`) to their scratch targets. `backend` is
  the pinned parser backend (used only for error reporting). Wraps backend-specific
  parse exceptions into the typed `::cannot-test-run` error.

  Public so the native rewrite can be exercised directly (the Step 0b SQL-shape
  catalogue) without a live compile."
  [driver sql mapping backend]
  (try
    (sql-tools/replace-names driver sql (mapping->replacements mapping))
    (catch PolyglotException e
      ;; sqlglot fail-closed shape: PolyglotException, message starts "ParseError", ex-data nil.
      (cannot-test-run!
       (str "This transform can't be test-run: its SQL could not be parsed/rewritten. " (ex-message e))
       {:guard ::rewrite :parser-backend backend} e))
    (catch ExceptionInfo e
      ;; macaw fail-closed shape: ExceptionInfo "Unable to parse" / "Unknown rename".
      (cannot-test-run!
       (str "This transform can't be test-run: its SQL could not be parsed/rewritten. " (ex-message e))
       {:guard ::rewrite :parser-backend backend} e))))

;;; ---------------------------------------------------------------------------
;;; MBQL path: metadata-provider override compile
;;; ---------------------------------------------------------------------------

(defn- table-override-fn
  "Build the `f` for `transforming-metadata-provider`. `id->override` maps a
  table id to the `{:name :schema}` overrides to merge onto its `:metadata/table`.
  All non-table metadata passes through untouched."
  [id->override]
  (fn [{metadata-type :lib/type} results]
    (if (= metadata-type :metadata/table)
      (mapv (fn [t] (merge t (get id->override (:id t)))) results)
      results)))

(defn- override-provider
  "Wrap the BASE application-database provider for `db-id` with a
  `transforming-metadata-provider` that overrides each mapped input table's
  `:name`/`:schema` to its scratch spec. Bound ONCE by the caller (we own the
  outer binding, so no DANGER flag is needed)."
  [db-id id->override]
  (lib.metadata/transforming-metadata-provider
   (table-override-fn id->override)
   (lib-be/application-database-metadata-provider db-id)))

(defn- id->override
  "Build `{table-id → {:name :schema}}` from the scratch `mapping` and the
  required `input-tables` (which carry both `:id` and the real `:schema`/`:name`).
  Keyed by table id so the override matches on `(:id t)`, not name/schema pairs."
  [input-tables mapping]
  (into {}
        (keep (fn [{:keys [id schema name]}]
                (when-let [scratch (get mapping {:schema schema :table name})]
                  [id {:name (:table scratch) :schema (:schema scratch)}])))
        input-tables))

;;; ---------------------------------------------------------------------------
;;; Verify — three guards
;;; ---------------------------------------------------------------------------

(defn- normalize-ref
  "Normalize a `referenced-tables-raw` entry to a `{:schema :table}` tuple for
  set comparison: nil schema → driver default schema; lowercase fold of both
  parts (Step 0b rule — sufficient for system-generated lowercase scratch names)."
  [driver {:keys [schema table]}]
  {:schema (str/lower-case (or schema (sql.normalize/default-schema driver)))
   :table  (str/lower-case table)})

(defn- scratch-ref-set
  "Set of normalized `{:schema :table}` tuples for the scratch targets in `mapping`."
  [driver mapping]
  (into #{} (map #(normalize-ref driver %)) (vals mapping)))

(defn- forbidden-tokens
  "Original (real) identifier tokens that must NOT survive in the final SQL.

  For each mapping entry the real TABLE name is always forbidden (the scratch
  name differs by construction). The real SCHEMA is forbidden only when the
  scratch table lives in a DIFFERENT schema — when scratch tables share the real
  schema (the common PoC case: same `public`), that schema legitimately appears
  in scratch-qualified output and must not be flagged."
  [mapping]
  (reduce-kv
   (fn [acc {real-schema :schema real-table :table} {scratch-schema :schema}]
     (cond-> (conj acc real-table)
       (and real-schema (not= real-schema scratch-schema)) (conj real-schema)))
   #{}
   mapping))

(defn- dangling-qualifier-tokens
  "Parser-based detection of dangling table qualifiers. Returns the set of
  forbidden tokens (lowercased) that the parser reports as `:missing-table-alias`
  — i.e. a column qualifier (`schema.table.col`) whose table is not in scope
  because the FROM-only rewrite retargeted the table source but left the
  qualifier behind.

  This is scope-aware and precise: it flags ONLY genuine dangling qualifiers,
  never legitimate lib-generated join aliases (e.g. a derived-subquery alias
  `\"Products\"`), which a blunt string match would false-positive on. The
  parser normalizes identifier case, so we compare against lowercased forbidden
  tokens."
  [driver sql forbidden-lc]
  (let [errors (try
                 (:errors (sql-tools/field-references driver sql))
                 (catch Throwable _ #{}))]
    (into #{}
          (keep (fn [{:keys [type name]}]
                  (when (and (= type :missing-table-alias)
                             (contains? forbidden-lc (some-> name str/lower-case)))
                    (str/lower-case name))))
          errors)))

(defn- token-survives-as-string-literal?
  "True when `token` survives in `sql` as a whole identifier (identifier-boundary
  aware: underscore is an identifier char), matched CASE-SENSITIVELY.

  This is the residual string-based guard that catches a real table token
  surviving in a SQL string literal (`WHERE x = 'orders'`) — a fail-closed-by-
  design false positive, documented. Case-sensitive matching avoids colliding
  with case-different quoted identifiers (a `\"Products\"` join alias must not
  match a lowercased `products` token); genuine dangling QUALIFIERS are caught
  precisely by [[dangling-qualifier-tokens]] regardless of case."
  [^String token ^String sql]
  (let [pat (re-pattern (str "(?<![A-Za-z0-9_])"
                             (java.util.regex.Pattern/quote token)
                             "(?![A-Za-z0-9_])"))]
    (boolean (re-find pat sql))))

(defn verify
  "Run the three verify guards against `final-sql`. Returns `final-sql` on success;
  throws the typed `::cannot-test-run` error (naming the guard + offending
  refs/token) on any failure. Pure with respect to the database — parses only.

  - `driver`  — driver keyword (for default-schema + parsing).
  - `mapping` — `{real-spec → scratch-spec}` from `seed!`.
  - `final-sql` — the rewritten / override-compiled SQL string."
  [driver mapping final-sql]
  (let [refs (sql-tools/referenced-tables-raw driver final-sql)]
    ;; Guard 1: non-empty refs — but only when mapping is non-empty.
    ;; A parse error on a rewritten SQL loses refs that existed (guard must fire).
    ;; A zero-table transform has an empty mapping AND empty refs vacuously — safe,
    ;; nothing to protect; Guard 2 still catches any stray refs if they appear.
    (when (and (seq mapping) (empty? refs))
      (cannot-test-run!
       (str "This transform can't be test-run: the rewritten SQL has no resolvable"
            " table references (it may have failed to parse).")
       {:guard ::non-empty-refs :sql final-sql}))
    ;; Guard 2: every ref ∈ scratch specs.
    (let [scratch     (scratch-ref-set driver mapping)
          normalized  (map #(normalize-ref driver %) refs)
          stray       (remove scratch normalized)]
      (when (seq stray)
        (cannot-test-run!
         (str "This transform can't be test-run: the rewritten SQL references"
              " table(s) that are not scratch tables: " (pr-str (vec stray))
              ". An input table was not mapped to a scratch table.")
         {:guard ::refs-subset-scratch :stray-refs (vec stray) :scratch scratch})))
    ;; Guard 3: no original schema/table token survives.
    ;; (a) Parser-based, scope-aware: a dangling table qualifier left behind by a
    ;;     FROM-only rewrite surfaces as a `:missing-table-alias` error. This is
    ;;     precise — it never flags legitimate lib-generated join aliases.
    ;; (b) String-based, case-sensitive: catches a real table token surviving in a
    ;;     string literal (fail-closed-by-design) without colliding with
    ;;     case-different quoted identifiers.
    (let [forbidden    (forbidden-tokens mapping)
          forbidden-lc (into #{} (map str/lower-case) forbidden)
          dangling     (dangling-qualifier-tokens driver final-sql forbidden-lc)]
      (when-let [token (first dangling)]
        (cannot-test-run!
         (str "This transform can't be test-run: the original table " (pr-str token)
              " still appears as a dangling column qualifier (e.g. `" token ".col`)"
              " in the rewritten SQL. The FROM-only rewrite retargeted the table"
              " source but left the qualifier behind, producing unrunnable SQL.")
         {:guard ::token-survival :surviving-token token :sql final-sql}))
      (doseq [token forbidden]
        (when (token-survives-as-string-literal? token final-sql)
          (cannot-test-run!
           (str "This transform can't be test-run: the original identifier "
                (pr-str token) " still appears in the rewritten SQL (e.g. inside a"
                " string literal). It cannot be safely test-run.")
           {:guard ::token-survival :surviving-token token :sql final-sql}))))
    final-sql))

;;; ---------------------------------------------------------------------------
;;; Public entry point
;;; ---------------------------------------------------------------------------

(defn- source-driver
  "Resolve the driver keyword from the transform's source query database id."
  [transform db]
  (keyword (:engine db)))

(defn resolve-test-transform
  "Produce the fully-resolved execution artifact for `transform`.

  Arguments:
  - `transform`     — a `:query` transform value (native SQL or MBQL).
  - `mapping`       — `{real-spec → scratch-spec}` from
                      [[metabase.transforms.test-run.scratch/seed!]].
  - `output-target` — the redirected `:target` (passed through to the artifact).
  - `opts`          — map with:
    - `:db`           — the `:model/Database` row (for the driver keyword).
    - `:input-tables` — the `required-input-tables` vector (needed for the MBQL
                        override, which keys overrides by table id). Required for
                        MBQL transforms; ignored for native.

  Returns:
  ```
  {:driver <kw> :compiled <::compiled> :target output-target :parser-backend <kw>}
  ```

  Throws the typed `::cannot-test-run` error on any compile/rewrite/verify
  failure, and an `::unsupported-transform-type` error for non-`:query`
  (e.g. Python) transforms."
  [transform mapping output-target {:keys [db input-tables]}]
  (when-not (transforms-base.u/query-transform? transform)
    (throw (ex-info
            (str "This transform can't be test-run: only :query transforms"
                 " (native SQL and MBQL) are supported.")
            {:error-type  ::unsupported-transform-type
             :source-type (-> transform :source :type keyword)})))
  (let [driver  (source-driver transform db)
        ;; Pin + record the parser backend at resolve time.
        backend (sql-tools.settings/current-parser-backend)
        native? (transforms-base.u/native-query-transform? transform)
        compiled
        (if native?
          ;; Native path: compile, then rewrite the SQL string to scratch names.
          (let [compiled (transforms-base.u/compile-source transform nil)]
            (update compiled :query #(rewrite-native-sql driver % mapping backend)))
          ;; MBQL path: compile under a metadata-provider override (no string rewrite).
          (let [db-id    (-> transform :source :query :database)
                provider (override-provider db-id (id->override input-tables mapping))]
            (qp.store/with-metadata-provider provider
              (transforms-base.u/compile-source transform nil))))]
    ;; Verify (both paths, defense-in-depth) — throws on any guard failure.
    (verify driver mapping (:query compiled))
    (log/debug "Resolved test transform" {:driver driver :parser-backend backend :native? native?})
    {:driver         driver
     :compiled       compiled
     :target         output-target
     :parser-backend backend}))
