(ns metabase-enterprise.transforms-verification.resolve
  "Resolve a transform into a fully-resolved, executable artifact for a test run.

  Entry point: [[resolve-test-transform]] — given a transform value, the
  scratch-table `mapping` from [[metabase-enterprise.transforms-verification.scratch/seed!]],
  and the redirected `output-target`, it produces the executable artifact.

  ## Two compile paths

  Native-SQL transforms are rewritten by string replacement; MBQL transforms are
  compiled under a metadata-provider override. Both paths run the same `verify`
  guards over the final SQL; see [[verify]].

  Any guard failure, or any compile/rewrite failure, becomes a single typed error:
  `ex-info` with `:error-type ::errors/cannot-test-run` (plus `:guard` and the offending
  tokens/refs)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Typed error
;;; ---------------------------------------------------------------------------

(defn- cannot-test-run!
  "Throw the single typed \"can't be test-run\" error.

  `:error-type` is `::errors/cannot-test-run`; `extra` carries guard-specific detail
  (`:guard`, offending tokens/refs). `cause` is the wrapped backend exception, if any."
  ([msg extra] (cannot-test-run! msg extra nil))
  ([msg extra cause]
   (throw (errors/ex ::errors/cannot-test-run msg extra cause))))

;;; ---------------------------------------------------------------------------
;;; Native path: build replacements + rewrite
;;; ---------------------------------------------------------------------------

(defn- quote-identifier
  "Render a bare identifier as a driver-quoted SQL identifier string; nil
  `name-str` → nil. Quoting preserves case so the rewritten scratch reference
  matches the quoted table that was created; unquoted, a folding driver would
  fold it to a different case."
  [driver ^String name-str]
  ;; nil must not reach format-honeysql: HoneySQL renders a nil form as the SQL
  ;; NULL literal, and the qualifier would come out as the identifier NULL.
  (when name-str
    (first (sql.qp/format-honeysql driver (keyword name-str)))))

(defn- bare-key-specs
  "`{real-table-name → real-spec}` for the table names whose unqualified reference
  resolves unambiguously: a name mapped once resolves to its single entry; a name
  mapped in several schemas resolves to the one entry in the driver's default
  schema (nil schema counts as default), iff exactly one such entry exists —
  mirroring warehouse search-path resolution. Names with no entry here get no bare
  replacement key, so an unqualified ref survives the rewrite and fails closed in
  [[verify]]."
  [driver mapping]
  (let [default-schema (sql.normalize/default-schema driver)]
    (into {}
          (keep (fn [[table-name specs]]
                  (let [candidates (if (= 1 (count specs))
                                     specs
                                     (filter #(= default-schema (or (:schema %) default-schema))
                                             specs))]
                    (when (= 1 (count candidates))
                      [table-name (first candidates)]))))
          (group-by :table (keys mapping)))))

(defn- mapping->replacements
  "Build a `sql-tools/replace-names` `:tables` replacements map from the scratch
  `mapping` (`{real-spec → scratch-spec}`, each spec `{:schema :table}`).

  For each real table we register a schema-qualified `{:schema :table}` key
  (matches `FROM public.orders` and quoted `\"public\".\"orders\"`), plus a bare
  `{:table <name>}` key (matches unqualified `FROM orders`) when the name resolves
  unambiguously per [[bare-key-specs]].

  Scratch-target `:schema`/`:table` values are driver-quoted via [[quote-identifier]]."
  [driver mapping]
  (let [bare-spec (bare-key-specs driver mapping)]
    {:tables
     (reduce-kv
      (fn [acc {real-schema :schema real-table :table :as real-spec} scratch-spec]
        (let [target {:schema (quote-identifier driver (:schema scratch-spec))
                      :table  (quote-identifier driver (:table scratch-spec))}]
          (cond-> acc
            (= real-spec (bare-spec real-table)) (assoc {:table real-table} target)
            real-schema (assoc {:schema real-schema :table real-table} target))))
      {}
      mapping)}))

(defn- ambiguous-bare-refs
  "Unqualified table references in `sql` whose name is mapped in several schemas
  with no unambiguous resolution (no [[bare-key-specs]] entry). Backends differ in
  how loosely a schema-qualified replacement key matches a bare reference (macaw
  redirects it to an arbitrary entry), so the rewrite cannot be trusted for such a
  ref on any backend — the caller must fail closed before rewriting."
  [driver sql mapping]
  (let [bare-ok      (bare-key-specs driver mapping)
        mapped-names (into #{} (map :table) (keys mapping))
        refs         (try (sql-tools/referenced-tables-raw driver sql)
                          (catch Throwable _ nil))]
    (into #{}
          (comp (remove :schema)
                (map :table)
                (map #(sql.normalize/normalize-name driver %))
                (filter mapped-names)
                (remove #(contains? bare-ok %)))
          refs)))

(defn rewrite-native-sql
  "Rewrite `sql`, redirecting the input-table references in `mapping`
  (`{real-spec → scratch-spec}`) to their scratch targets. `backend` is the pinned
  parser backend, used only for error reporting; backend-specific parse exceptions
  are wrapped as `::errors/cannot-test-run`."
  [driver sql mapping backend]
  (when-let [amb (seq (ambiguous-bare-refs driver sql mapping))]
    (cannot-test-run!
     (tru "This transform can''t be test-run: unqualified reference(s) to {0} are ambiguous — the name is mapped in more than one schema. Qualify the reference with a schema."
          (pr-str (vec amb)))
     {:guard ::ambiguous-bare-ref :ambiguous (vec amb)}))
  (sql-tools/rewrite-table-refs
   driver sql (mapping->replacements driver mapping)
   ;; Both a bare and a schema-qualified key are registered per table and at most one
   ;; is used per reference, so unused keys are expected — macaw errors on them
   ;; without :allow-unused?; sqlglot ignores them either way.
   {:allow-unused? true
    :on-parse-error
    (fn [_sql e]
      (cannot-test-run!
       (tru "This transform can''t be test-run: its SQL could not be parsed/rewritten. {0}" (ex-message e))
       {:guard ::rewrite :parser-backend backend} e))}))

;;; ---------------------------------------------------------------------------
;;; MBQL path: metadata-provider override compile
;;; ---------------------------------------------------------------------------

(defn override-provider
  "Return the application-database metadata provider for `db-id` with each mapped
  input table's `:name`/`:schema` overridden to its scratch spec. `id->override-map`
  maps a table id to its `{:name :schema}` scratch override. Attach the result to
  the query being compiled (`lib/query`)."
  [db-id id->override-map]
  (lib.metadata/table-overriding-metadata-provider
   (fn [t] (get id->override-map (:id t)))
   (lib-be/application-database-metadata-provider db-id)))

(defn id->override
  "Build `{table-id → {:name :schema}}` from the scratch `mapping` and the
  `input-tables` (which carry both `:id` and the real `:schema`/`:name`).
  Keyed by table id so the override matches on `(:id t)`, not name/schema pairs.

  An MBQL node reading an upstream scratch output has no synced Table id (that
  output was never materialized), so no override entry is built for it; the
  dangling ref then trips [[verify]]."
  [input-tables mapping]
  (into {}
        (keep (fn [{:keys [id schema name]}]
                (when-let [scratch (get mapping {:schema schema :table name})]
                  [id {:name (:table scratch) :schema (:schema scratch)}])))
        input-tables))

;;; ---------------------------------------------------------------------------
;;; Verify — four guards
;;; ---------------------------------------------------------------------------

(defn- normalize-ref
  "Normalize a `referenced-tables-raw` entry to a `{:schema :table}` tuple for
  set comparison: nil schema → driver default schema; driver-normalize each part
  (macaw reports quoted identifiers, sqlglot bare ones), then lowercase-fold
  (sufficient because scratch names are system-generated lowercase)."
  [driver {:keys [schema table]}]
  (let [norm #(u/lower-case-en (sql.normalize/normalize-name driver %))]
    {:schema (norm (or schema (sql.normalize/default-schema driver)))
     :table  (norm table)}))

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

(defn- qualifier-table-name
  "The table segment of a parser-reported qualifier name, driver-normalized and
  lowercased. Macaw reports the full quoted qualifier (`\"schema\".\"table\"`),
  sqlglot the bare table name — take the last dot segment and strip quoting."
  [driver ^String qualifier-name]
  (some->> (str/split qualifier-name #"\.")
           last
           (sql.normalize/normalize-name driver)
           u/lower-case-en))

(defn- dangling-qualifier-tokens
  "The `forbidden-lc` tokens (lowercased) that the parser reports as a
  `:missing-table-alias` in `sql` — i.e. a `schema.table.col` qualifier whose
  table is not in scope."
  [driver sql forbidden-lc]
  (let [errors (try
                 (:errors (sql-tools/field-references driver sql))
                 (catch Throwable e
                   ;; Fail closed, like guards 1/2: SQL we cannot parse for field
                   ;; references is SQL whose dangling qualifiers we cannot rule out;
                   ;; swallowing to `#{}` here would let guard 3 pass vacuously.
                   (cannot-test-run!
                    (tru "This transform can''t be test-run: the rewritten SQL could not be parsed for qualifier verification. {0}" (ex-message e))
                    {:guard ::token-survival :sql sql} e)))]
    (into #{}
          (keep (fn [{:keys [type name]}]
                  (when (= type :missing-table-alias)
                    (let [table-name (some->> name (qualifier-table-name driver))]
                      (when (contains? forbidden-lc table-name)
                        table-name)))))
          errors)))

(defn- token-as-cte-name?
  "True when `token` appears as a CTE definition name in `sql` — `WITH token AS (`
  or `, token (cols) AS (`. A CTE named like a real input table means the rewrite
  may have redirected references the user meant to hit the CTE;
  `referenced-tables-raw` excludes CTE names, so guards 1-3 cannot see it."
  [^String token ^String sql]
  ;; Case-insensitive (?i): on case-folding drivers `WITH Orders AS (...)` shadows a
  ;; stored `orders`, so the CTE-name match folds case too — consistent with guard 3's
  ;; lowercased comparison.
  (let [pat (re-pattern (str "(?i)(?<![A-Za-z0-9_])"
                             (java.util.regex.Pattern/quote token)
                             "(?![A-Za-z0-9_])"
                             "\\s*(?:\\([^)]*\\))?\\s+AS\\s*\\("))]
    (boolean (re-find pat sql))))

(defn verify
  "Run the reference-safety guards against `final-sql`. Returns `final-sql` on
  success; throws the typed `::errors/cannot-test-run` error (naming the guard +
  offending refs/token) on any failure. The four guards:

  1. non-empty refs — when `mapping` is non-empty but `final-sql` has no resolvable
     table references (e.g. it failed to parse), fail: a parse error on rewritten
     SQL loses refs that existed. A zero-table run skips this guard vacuously.
  2. refs ⊆ scratch — every table reference must be a scratch target from
     `mapping`, or a `safe-aliases` name.
  3. no dangling qualifier — no real table name survives as a `table.col` column
     qualifier whose table is not in scope.
  4. no shadowing CTE — no real table name survives as a CTE definition name
     (`referenced-tables-raw` excludes CTE names, so the rewrite may have
     redirected references meant for the CTE without guards 1-3 seeing it). A
     real table name as a column name or alias is parser-visible and guard 2/3
     territory; inside a string literal it is data, not a reference.

  - `driver`       — driver keyword (for default-schema + parsing).
  - `mapping`      — `{real-spec → scratch-spec}` from `seed!`.
  - `final-sql`    — the rewritten / override-compiled SQL string.
  - `safe-aliases` — bare table-name strings exempt from guard 2 (they are
                     CTE-bound by the caller, not real warehouse tables).
                     Default `#{}`."
  ([driver mapping final-sql]
   (verify driver mapping final-sql #{}))
  ([driver mapping final-sql safe-aliases]
   (let [allowed-refs (scratch-ref-set driver mapping)
         forbidden    (forbidden-tokens mapping)
         refs         (try
                        (sql-tools/referenced-tables-raw driver final-sql)
                        (catch Throwable e
                          ;; Fail closed: SQL we cannot enumerate refs for is SQL we
                          ;; cannot vouch for.
                          (cannot-test-run!
                           (tru "This transform can''t be test-run: the rewritten SQL could not be parsed for verification. {0}" (ex-message e))
                           {:guard ::non-empty-refs :sql final-sql} e)))]
     ;; Guard 1: non-empty refs (only when something is expected).
     (when (and (seq allowed-refs) (empty? refs))
       (cannot-test-run!
        (tru "This transform can''t be test-run: the rewritten SQL has no resolvable table references (it may have failed to parse).")
        {:guard ::non-empty-refs :sql final-sql}))
     ;; Guard 2: every ref ∈ scratch targets OR a known-safe alias.
     (let [safe-lc (into #{} (map u/lower-case-en) safe-aliases)
           stray   (remove (fn [{:keys [table] :as ref}]
                             (let [n (normalize-ref driver ref)]
                               (or (allowed-refs n)
                                   (contains? safe-lc (u/lower-case-en table)))))
                           refs)]
       (when (seq stray)
         (cannot-test-run!
          (tru "This transform can''t be test-run: the rewritten SQL references table(s) that are not allowed: {0}."
               (pr-str (mapv #(normalize-ref driver %) stray)))
          {:guard      ::refs-subset-scratch
           :stray-refs (mapv #(normalize-ref driver %) stray)
           :allowed    allowed-refs})))
     ;; Guards 3 + 4: no original token survives (dangling qualifier or CTE definition name).
     (let [forbidden-lc (into #{} (map u/lower-case-en) forbidden)
           dangling     (dangling-qualifier-tokens driver final-sql forbidden-lc)]
       (when-let [token (first dangling)]
         (cannot-test-run!
          (tru "This transform can''t be test-run: the original table {0} still appears as a dangling column qualifier (e.g. `{1}.col`) in the rewritten SQL."
               (pr-str token) token)
          {:guard ::token-survival :surviving-token token :sql final-sql}))
       (doseq [token forbidden-lc]
         (when (token-as-cte-name? token final-sql)
           (cannot-test-run!
            (tru "This transform can''t be test-run: a CTE in the rewritten SQL is named after the real table {0}, so the rewrite may have redirected references meant for the CTE."
                 (pr-str token))
            {:guard ::token-survival :surviving-token token :sql final-sql}))))
     final-sql)))

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
                      [[metabase-enterprise.transforms-verification.scratch/seed!]].
  - `output-target` — the redirected `:target` (passed through to the artifact).
  - `opts`          — map with:
    - `:db`           — the `:model/Database` row (for the driver keyword).
    - `:input-tables` — vector of table-info maps (needed for the MBQL
                        override, which keys overrides by table id). Required for
                        MBQL transforms; ignored for native.

  Returns:
  ```
  {:driver         <kw>
   :compiled       <::compiled>   ; qp.compile output, modified in place
   :target         <output-target>
   :parser-backend <kw>}          ; the parser backend this resolution used
  ```

  Reads the ambient parser backend; when the rewrite/verify/assertion calls of one
  run must agree, bind it via [[metabase.sql-tools.core/with-parser-backend]] around
  the run.

  Throws the typed `::errors/cannot-test-run` error on any compile/rewrite/verify
  failure, and an `::errors/unsupported-transform-type` error for non-`:query`
  (e.g. Python) transforms."
  [transform mapping output-target {:keys [db input-tables]}]
  (when-not (transforms-base.u/query-transform? transform)
    (throw (errors/ex ::errors/unsupported-transform-type
                      (tru "This transform can''t be test-run: only :query transforms (native SQL and MBQL) are supported.")
                      {:source-type (-> transform :source :type keyword)})))
  (let [driver  (source-driver db)
        ;; Record the backend for error reporting and the artifact.
        backend (sql-tools/parser-backend)
        native? (transforms-base.u/native-query-transform? transform)
        compiled
        (if native?
          ;; Native path: compile, then rewrite the SQL string to scratch names.
          ;; Carry qp.compile's output intact; only rewrite :query. Never deconstruct or
          ;; rebuild the :lib/type map.
          (let [compiled (transforms-base.u/compile-source transform nil)]
            (update compiled :query #(rewrite-native-sql driver % mapping backend)))
          ;; MBQL path: compile under a metadata-provider override (no string rewrite).
          ;; Input tables' :name/:schema are overridden to their scratch specs before
          ;; compilation, so the compiler emits scratch-qualified SQL natively.
          (let [db-id    (transforms-base.u/transform-source-database transform)
                provider (override-provider db-id (id->override input-tables mapping))]
            (transforms-base.u/compile-source transform nil provider)))]
    ;; Verify (both paths) — throws on any guard failure.
    (verify driver mapping (:query compiled))
    (log/debug "Resolved test transform" {:driver driver :parser-backend backend :native? native?})
    {:driver         driver
     :compiled       compiled
     :target         output-target
     :parser-backend backend}))
