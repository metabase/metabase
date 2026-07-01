(ns metabase.transforms.test-run.resolve
  "Resolve a transform into a fully-resolved, executable artifact for a test run.

  Entry point: [[resolve-test-transform]] — given a transform value, the
  scratch-table `mapping` from [[metabase.transforms.test-run.scratch/seed!]],
  and the redirected `output-target`, it produces the executable artifact.

  ## Two compile paths

  Native-SQL transforms are rewritten by string replacement; MBQL transforms are
  compiled under a metadata-provider override. Both paths run the same three
  `verify` guards over the final SQL; see [[verify]].

  Any guard failure, or any compile/rewrite failure, becomes a single typed error:
  `ex-info` with `:error-type ::cannot-test-run` (plus `:guard` and the offending
  tokens/refs)."
  (:require
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib-be.core :as lib-be]
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.workspaces.table-remapping :as ws.remap]))

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
        ;; Register both bare and qualified forms; an unused key is a no-op on the
        ;; sqlglot backend.
        (cond-> (assoc acc {:table real-table} target)
          real-schema (assoc {:schema real-schema :table real-table} target))))
    {}
    mapping)})

(defn rewrite-native-sql
  "Rewrite `sql`, redirecting the input-table references in `mapping`
  (`{real-spec → scratch-spec}`) to their scratch targets. `backend` is the pinned
  parser backend, used only for error reporting; backend-specific parse exceptions
  are wrapped as `::cannot-test-run`."
  [driver sql mapping backend]
  (ws.remap/rewrite-table-refs
   driver sql (mapping->replacements driver mapping)
   {:on-parse-error
    (fn [_sql e]
      (cannot-test-run!
       (str "This transform can't be test-run: its SQL could not be parsed/rewritten. " (ex-message e))
       {:guard ::rewrite :parser-backend backend} e))}))

;;; ---------------------------------------------------------------------------
;;; MBQL path: metadata-provider override compile
;;; ---------------------------------------------------------------------------

(defn override-provider
  "Return the application-database metadata provider for `db-id` with each mapped
  input table's `:name`/`:schema` overridden to its scratch spec. `id->override-map`
  maps a table id to its `{:name :schema}` scratch override. Bind the result once
  via `qp.store/with-metadata-provider`."
  [db-id id->override-map]
  (ws.remap/override-metadata-provider
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

(def ^:private remap-guard->resolve-guard
  {::ws.remap/non-empty-refs     ::non-empty-refs
   ::ws.remap/refs-subset-allowed ::refs-subset-scratch
   ::ws.remap/token-survival     ::token-survival})

(defn verify
  "Run the reference-safety guards against `final-sql`. Returns `final-sql` on
  success; throws the typed `::cannot-test-run` error (naming the guard + offending
  refs/token) on any failure.

  - `driver`       — driver keyword (for default-schema + parsing).
  - `mapping`      — `{real-spec → scratch-spec}` from `seed!`.
  - `final-sql`    — the rewritten / override-compiled SQL string.
  - `safe-aliases` — bare table-name strings exempt from the no-real-table guard
                     (they are CTE-bound by the caller, not real warehouse tables).
                     Default `#{}`."
  ([driver mapping final-sql]
   (verify driver mapping final-sql #{}))
  ([driver mapping final-sql safe-aliases]
   (ws.remap/verify-only-references
    driver final-sql
    {:normalize-ref    #(normalize-ref driver %)
     :allowed-refs     (scratch-ref-set driver mapping)
     :forbidden-tokens (forbidden-tokens mapping)
     :safe-aliases     safe-aliases
     :on-violation     (fn [msg {:keys [guard] :as extra}]
                         (cannot-test-run!
                          (str "This transform can't be test-run: " msg)
                          (assoc extra :guard (remap-guard->resolve-guard guard guard))))})))

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
          ;; rebuild the :lib/type map.
          (let [compiled (transforms-base.u/compile-source transform nil)]
            (update compiled :query #(rewrite-native-sql driver % mapping backend)))
          ;; MBQL path: compile under a metadata-provider override (no string rewrite).
          ;; Input tables' :name/:schema are overridden to their scratch specs before
          ;; compilation, so the compiler emits scratch-qualified SQL natively.
          (let [db-id    (-> transform :source :query :database)
                provider (override-provider db-id (id->override input-tables mapping))]
            (qp.store/with-metadata-provider provider
              (transforms-base.u/compile-source transform nil))))]
    ;; Verify (both paths) — throws on any guard failure.
    (verify driver mapping (:query compiled))
    (log/debug "Resolved test transform" {:driver driver :parser-backend backend :native? native?})
    ;; :compiled is qp.compile/compile's output, passed verbatim to driver/run-transform!.
    {:driver         driver
     :compiled       compiled
     :target         output-target
     :parser-backend backend}))
