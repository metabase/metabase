(ns metabase.transforms.test-run.resolve
  "Resolve a transform into a fully-resolved, executable artifact for a test run.

  Entry point: [[resolve-test-transform]] — given a transform value, the
  scratch-table `mapping` from [[metabase.transforms.test-run.scratch/seed!]],
  and the redirected `output-target`, it produces the executable artifact.

  ## Two compile paths

  Native-SQL transforms are rewritten by string replacement; MBQL transforms are
  compiled under a metadata-provider override. Both paths run the same three
  `verify` guards over the final SQL (defense-in-depth); see [[verify]] and its
  guard comments.

  Any guard failure, or any compile/rewrite failure, becomes a single typed error:
  `ex-info` with `:error-type ::cannot-test-run` (plus `:guard` and the offending
  tokens/refs)."
  (:require
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
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

(defn- quote-identifier
  "Render a bare identifier as a driver-quoted SQL identifier string. Quoting preserves
  case so the rewritten scratch reference matches the quoted table that was created; an
  unquoted reference would fold to a different case on folding drivers."
  [driver ^String name-str]
  (first (sql.qp/format-honeysql driver (keyword name-str))))

(defn- mapping->replacements
  "Build a `sql-tools/replace-names` `:tables` replacements map from the scratch
  `mapping` (`{real-spec → scratch-spec}`, each spec `{:schema :table}`).

  For each real table we register two keys, both pointing at the scratch target:
  a bare `{:table <name>}` key (matches unqualified `FROM orders`) and a
  schema-qualified `{:schema :table}` key (matches `FROM public.orders` and
  quoted `\"public\".\"orders\"`).

  Scratch-target `:schema`/`:table` values are driver-quoted via [[quote-identifier]]."
  [driver mapping]
  {:tables
   (reduce-kv
    (fn [acc {real-schema :schema real-table :table} scratch-spec]
      (let [target {:schema (quote-identifier driver (:schema scratch-spec))
                    :table  (quote-identifier driver (:table scratch-spec))}]
        ;; Register both bare and qualified forms: on the sqlglot backend an unused
        ;; key is a no-op, so registering both is safe and covers every qualification
        ;; form a native transform might use.
        (cond-> (assoc acc {:table real-table} target)
          real-schema (assoc {:schema real-schema :table real-table} target))))
    {}
    mapping)})

(defn rewrite-native-sql
  "Rewrite `sql` with `sql-tools/replace-names`, redirecting input-table refs in
  `mapping` (`{real-spec → scratch-spec}`) to their scratch targets. `backend` is
  the pinned parser backend (used only for error reporting). Wraps backend-specific
  parse exceptions into the typed `::cannot-test-run` error.

  Public so the native rewrite can be exercised directly in tests
  without a live compile."
  [driver sql mapping backend]
  (try
    (sql-tools/replace-names driver sql (mapping->replacements driver mapping))
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
  `:name`/`:schema` to its scratch spec. The caller binds this provider exactly
  once via `qp.store/with-metadata-provider`."
  [db-id id->override]
  (lib.metadata/transforming-metadata-provider
   (table-override-fn id->override)
   (lib-be/application-database-metadata-provider db-id)))

(defn- id->override
  "Build `{table-id → {:name :schema}}` from the scratch `mapping` and the
  required `input-tables` (which carry both `:id` and the real `:schema`/`:name`).
  Keyed by table id so the override matches on `(:id t)`, not name/schema pairs."
  ;; V1 limitation: MBQL nodes reading an upstream scratch output lack a synced
  ;; Table id (the upstream output was never materialized), so id->override cannot
  ;; build an entry for it. The verify guards catch the dangling ref and throw
  ;; ::cannot-test-run. Native chains do not have this issue.
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
  parts (sufficient because scratch names are system-generated lowercase)."
  [driver {:keys [schema table]}]
  {:schema (u/lower-case-en (or schema (sql.normalize/default-schema driver)))
   :table  (u/lower-case-en table)})

(defn- scratch-ref-set
  "Set of normalized `{:schema :table}` tuples for the scratch targets in `mapping`."
  [driver mapping]
  (into #{} (map #(normalize-ref driver %)) (vals mapping)))

(defn- forbidden-tokens
  "Original (real) identifier tokens that must never survive in the final SQL.

  For each mapping entry the real table name is always forbidden (the scratch
  name differs by construction). The real schema is forbidden only when the
  scratch table lives in a different schema — when scratch tables share the real
  schema (the common case: same `public`), that schema legitimately appears
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

  This is scope-aware and precise: it flags only genuine dangling qualifiers,
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
                             (contains? forbidden-lc (some-> name u/lower-case-en)))
                    (u/lower-case-en name))))
          errors)))

(defn- token-survives-as-string-literal?
  "True when `token` survives in `sql` as a whole identifier (identifier-boundary
  aware: underscore is an identifier char), matched case-sensitively.

  String-literal occurrences (`WHERE x = 'orders'`) fail closed by design — the
  caller names this guard explicitly for that reason. Case-sensitive matching
  avoids false-positives on case-different quoted identifiers; genuine dangling
  qualifiers are caught precisely by [[dangling-qualifier-tokens]]."
  [^String token ^String sql]
  (let [pat (re-pattern (str "(?<![A-Za-z0-9_])"
                             (java.util.regex.Pattern/quote token)
                             "(?![A-Za-z0-9_])"))]
    (boolean (re-find pat sql))))

(defn verify
  "Run the three verify guards against `final-sql`. Returns `final-sql` on success;
  throws the typed `::cannot-test-run` error (naming the guard + offending
  refs/token) on any failure.

  - `driver`  — driver keyword (for default-schema + parsing).
  - `mapping` — `{real-spec → scratch-spec}` from `seed!`.
  - `final-sql` — the rewritten / override-compiled SQL string."
  [driver mapping final-sql]
  (let [refs (sql-tools/referenced-tables-raw driver final-sql)]
    ;; Guard 1: non-empty refs — but only when mapping is non-empty.
    ;; A parse error on a rewritten SQL loses refs that existed (guard must fire).
    ;; A zero-table transform has an empty mapping and empty refs vacuously — safe,
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
          forbidden-lc (into #{} (map u/lower-case-en) forbidden)
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
  "Driver keyword for the run, read from the resolved Database row's `:engine`."
  [db]
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
  {:driver         <kw>
   :compiled       <::compiled>   ; qp.compile output, modified in place
   :target         <output-target>
   :parser-backend <kw>}          ; backend pinned for this run
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
  (let [driver  (source-driver db)
        ;; Pin + record the parser backend at resolve time.
        backend (sql-tools/parser-backend)
        native? (transforms-base.u/native-query-transform? transform)
        compiled
        (if native?
          ;; Native path: compile, then rewrite the SQL string to scratch names.
          ;; Carry qp.compile's output intact; only rewrite :query. Never deconstruct or
          ;; rebuild the :lib/type map (mirrors the workspace hook in transforms_base/query.clj).
          (let [compiled (transforms-base.u/compile-source transform nil)]
            (update compiled :query #(rewrite-native-sql driver % mapping backend)))
          ;; MBQL path: compile under a metadata-provider override (no string rewrite).
          ;; Input tables' :name/:schema are overridden to their scratch specs before
          ;; compilation, so the compiler emits scratch-qualified SQL natively.
          (let [db-id    (-> transform :source :query :database)
                provider (override-provider db-id (id->override input-tables mapping))]
            (qp.store/with-metadata-provider provider
              (transforms-base.u/compile-source transform nil))))]
    ;; Verify (both paths, defense-in-depth) — throws on any guard failure.
    (verify driver mapping (:query compiled))
    (log/debug "Resolved test transform" {:driver driver :parser-backend backend :native? native?})
    ;; :compiled is qp.compile/compile's output, passed verbatim to driver/run-transform!
    ;; by the orchestrator — never deconstructed or rebuilt here.
    {:driver         driver
     :compiled       compiled
     :target         output-target
     :parser-backend backend}))
