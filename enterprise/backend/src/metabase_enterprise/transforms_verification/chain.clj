(ns metabase-enterprise.transforms-verification.chain
  "Synchronous orchestrator for *chained* (sub-graph) transform test runs.

  Entry points:
  - [[run-chain-test!]]      — transform-target: run the slice, diff the target's scratch output.
  - [[run-card-chain-test!]] — card-target: run the slice, compile + execute the card's query
                               under the scratch override, diff the result.

  The user picks boundary *source* transforms plus a single *target*; every node
  between them runs, fed by fixtures at the slice's leaves, and the target's
  output is diffed against an expected CSV. The single-transform case is the
  degenerate slice: `source-ids = #{}` → `slice = #{target-id}`.

  Errors are typed `ex-info` carrying `:error-type`."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.transforms-verification.assertions :as assertions]
   [metabase-enterprise.transforms-verification.card-refs :as card-refs]
   [metabase-enterprise.transforms-verification.diff :as diff]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase-enterprise.transforms-verification.execute :as execute]
   [metabase-enterprise.transforms-verification.fixtures :as fixtures]
   [metabase-enterprise.transforms-verification.inputs :as inputs]
   [metabase-enterprise.transforms-verification.resolve :as resolve]
   [metabase-enterprise.transforms-verification.scratch :as scratch]
   [metabase-enterprise.transforms-verification.subgraph :as subgraph]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Constants
;;; ---------------------------------------------------------------------------

(def ^:private default-test-run-timeout-ms
  "Statement-level timeout for a test-run execution. Override via `:timeout-ms`
  in `opts`."
  (u/minutes->ms 5))

;;; ---------------------------------------------------------------------------
;;; Internal helpers
;;; ---------------------------------------------------------------------------

(defn- assert-single-database!
  "Fail closed unless every node in `slice` shares `db-id`."
  [slice id->transform db-id]
  (let [offenders (into {}
                        (keep (fn [id]
                                (let [node-db (transforms-base.u/transform-source-database (id->transform id))]
                                  (when (not= node-db db-id)
                                    [id node-db]))))
                        slice)]
    (when (seq offenders)
      (throw (errors/ex ::errors/cross-database-subgraph
                        (tru "Chained test runs require all transforms in the sub-graph to use the same database. The target uses database {0} but these nodes do not: {1}."
                             db-id (pr-str offenders))
                        {:db-id     db-id
                         :offenders offenders})))))

(defn- leaf-table-infos
  "Resolve `leaf-deps` to deduped leaf table-infos, fail closed on an unsupported
  or unsynced leaf. Dedupes by table id (two slice nodes may share a leaf)."
  [leaf-deps]
  (into [] (m/distinct-by :id) (map inputs/resolve-table-dep leaf-deps)))

(defn- node-real-output-spec
  "The `{:schema :table}` of a transform node's real (production) output table."
  [transform]
  {:schema (-> transform :target :schema)
   :table  (-> transform :target :name)})

(defn- scratch-schema
  "Schema in which to create a run's scratch tables: the anchor transform's
  target schema. Nil — schemaless engines, or engines whose namespace travels
  in the `:db` slot (e.g. MySQL) — means bare table names in the connection's
  default namespace, matching production transform targets."
  [transform]
  (let [schema (-> transform :target :schema)]
    (when-not (str/blank? schema)
      schema)))

(defn- run-node!
  "Resolve, guard, and execute a single transform node against the accumulated
  `mapping`, writing its output to the `out-spec` scratch table.

  Returns the resolved artifact (with `:parser-backend`)."
  [{:keys [transform mapping out-spec db db-id driver input-tables]}]
  (let [artifact  (resolve/resolve-test-transform transform mapping out-spec
                                                  {:db db :input-tables input-tables})
        all-names (conj (mapv :table (vals mapping)) (:table out-spec))]
    (execute/assert-all-test-tables! all-names)
    ;; Elevate only the CTAS: build-transform-details captures the write-data
    ;; conn-spec + :transform pool from the active context, so both calls need
    ;; the elevated scope.
    (driver.conn/with-transform-connection
      (driver/run-transform! driver
                             (execute/build-transform-details (:compiled artifact) out-spec db-id db driver)
                             {:overwrite? true}))
    artifact))

(defn- run-slice!
  "Run the shared slice: seed leaves, execute each node in topo order, accumulate
  the mapping. Returns `{:mapping :outputs :parser-backend}` where `:mapping` is
  the leaf mapping plus per-node output redirects and `:outputs` is
  `{node-id out-spec}`.

  Every scratch table is registered in the caller-owned `mapping*` / `outputs*`
  atoms as soon as it is created (leaves) or about to be created (node outputs),
  so the caller's `finally` cleanup sees partial state when a node throws
  mid-slice. The write seams (`sweep-old-test-tables!`, `seed!`, the node CTAS)
  self-elevate to the transform connection; the caller runs in ambient `:default`
  and owns dropping everything in those atoms."
  [{:keys [order leaf-deps db db-id driver schema fixtures-by-table-id id->transform
           mapping* outputs*]}]
  (let [leaves      (leaf-table-infos leaf-deps)
        _           (inputs/match-fixtures leaves (set (keys fixtures-by-table-id)))
        seed-inputs (mapv (fn [{:keys [id columns] :as table-info}]
                            {:table-info table-info
                             :fixture    (fixtures/parse-fixture
                                          (get fixtures-by-table-id id) columns)})
                          leaves)
        nonce       (scratch/new-nonce)
        catalog     (driver.sql/db-slot-value driver db)]
    ;; Reap orphans left by prior runs that died before cleanup (JVM kill, timeout).
    (scratch/sweep-old-test-tables! db-id db schema)
    (reset! mapping* (scratch/seed! db-id db schema seed-inputs nonce))
    (reduce
     (fn [acc node-id]
       (let [node     (id->transform node-id)
             out-spec (scratch/scratch-output-target schema nonce (str "out_" (:id node)) catalog)]
         ;; Register before the CTAS so a failed execution still gets cleaned up.
         (swap! outputs* assoc node-id out-spec)
         (let [artifact (run-node! {:transform    node
                                    :mapping      (:mapping acc)
                                    :out-spec     out-spec
                                    :db           db
                                    :db-id        db-id
                                    :driver       driver
                                    :input-tables leaves})]
           (-> acc
               (assoc-in [:outputs node-id] out-spec)
               (assoc :parser-backend (:parser-backend artifact))
               ;; So downstream nodes redirect to this node's scratch output.
               (update :mapping assoc (node-real-output-spec node) out-spec)))))
     {:mapping @mapping* :outputs {} :parser-backend nil}
     order)))

;;; ---------------------------------------------------------------------------
;;; Card execution helpers
;;; ---------------------------------------------------------------------------

(defn- card-db-id
  "Database id from a card's dataset_query."
  [card]
  (lib/database-id (:dataset_query card)))

(defn- card-table-infos
  "Resolve the physical tables a card's query reads to table-info maps."
  [card]
  (let [table-ids (card-refs/card->tables card)]
    (into [] (m/distinct-by :id) (map #(inputs/resolve-table-dep {:table %}) table-ids))))

(defn- compile-card-sql
  "Compile the card's query to a SQL string that reads only the run's scratch tables.

  Native cards are rewritten; MBQL cards are compiled with scratch-qualified SQL.

  Throws `::errors/cannot-test-run` if any non-scratch table reference survives."
  [card db-id driver mapping input-tables]
  (let [backend   (sql-tools/parser-backend)
        dataset-q (:dataset_query card)
        ;; Build the lib query to detect native vs MBQL and extract native SQL — a
        ;; stored card's `:dataset_query` is lib-normalized (no raw `:type`/`:native`
        ;; keys), so go through the lib API rather than peeking at the raw map.
        query     (lib/query (lib-be/application-database-metadata-provider db-id) dataset-q)
        final-sql
        (if (lib/native-only-query? query)
          ;; Native path: rewrite the SQL string to scratch names.
          ;; Limitation: table-qualified column refs may produce dangling qualifiers
          ;; that `resolve/verify` rejects. Keep native cards free of `table.col` qualifiers.
          (resolve/rewrite-native-sql driver (lib/raw-native-query query) mapping backend)
          ;; MBQL path: compile under the override-provider so the compiler
          ;; emits scratch-qualified SQL without any string rewriting. The
          ;; provider rides on the query; qp.setup installs it.
          ;; Precondition: card's source tables must be synced (have a Table id)
          ;; so id->override can map them.
          (let [provider (resolve/override-provider db-id (resolve/id->override input-tables mapping))]
            (:query (qp.compile/compile (lib/query provider dataset-q)))))]
    ;; verify: every SQL ref must be a scratch table; no original table token survives.
    (resolve/verify driver mapping final-sql)
    final-sql))

(defn- run-card-query!
  "Execute the compiled card SQL via the QP; return the full QP result map.
  Throws `::errors/execution-failed` on a non-completed status."
  [db-id card-id driver card-sql]
  (log/debug "Running card query under scratch override" {:db-id db-id :driver driver})
  ;; Report-TZ-shifted temporal strings would spuriously mismatch the fixtures;
  ;; keep rows as java.time objects.
  (execute/run-native! (assoc (execute/native-query db-id card-sql)
                              :middleware {:format-rows? false})
                       ::errors/execution-failed
                       "Card query failed during test run"
                       {:card-id card-id}))

;;; ---------------------------------------------------------------------------
;;; Shared run frame
;;; ---------------------------------------------------------------------------

(defn- run-test!
  "Shared frame for both target types: run the slice, produce the target's
  actual rows, diff against the expected CSV, run assertions, and drop every
  scratch table in a `finally` — including partial state from a mid-slice
  failure (see [[run-slice!]]).

  `produce-actual` is called with `{:mapping :outputs :db-id :driver}` after the
  slice has run and must return
  `{:qp-result <QP result map> :output-sql <test_output SQL> :extra <map>}`;
  `:extra` is merged into the run record."
  [{:keys [resolution id->transform db-id schema fixtures-by-table-id expected-csv-file opts]}
   produce-actual]
  (let [{:keys [slice order leaf-deps]} resolution
        timeout-ms     (get opts :timeout-ms default-test-run-timeout-ms)
        ignore-cols    (get opts :ignore-columns #{})
        assertion-defs (get opts :assertions [])
        _              (assert-single-database! slice id->transform db-id)
        db             (t2/select-one :model/Database :id db-id)
        driver         (keyword (:engine db))
        mapping*       (atom {})
        outputs*       (atom {})]
    ;; Ambient scope stays at least-privilege :default (read) for the whole run;
    ;; the write seams (sweep, seed!, node CTAS, cleanup!) self-elevate to :transform.
    ;; The read-back, card query, and the user's assertion SQL — which must never
    ;; touch write-data credentials — run under the ambient default connection.
    ;;
    ;; One statement-level timeout for everything the run executes: the node
    ;; transforms, the read-back / card query, and the assertion queries. And one
    ;; parser backend pinned for every sql-tools call in the run (rewrite, verify,
    ;; assertions) — a mid-run settings flip must not mix backends.
    (sql-tools/with-parser-backend (sql-tools/parser-backend)
      (binding [driver.settings/*query-timeout-ms* timeout-ms]
        (try
          (let [{:keys [mapping outputs parser-backend]}
                (run-slice! {:order                order
                             :leaf-deps            leaf-deps
                             :db                   db
                             :db-id                db-id
                             :driver               driver
                             :schema               schema
                             :fixtures-by-table-id fixtures-by-table-id
                             :id->transform        id->transform
                             :mapping*             mapping*
                             :outputs*             outputs*})
                {:keys [qp-result output-sql extra]}
                (produce-actual {:mapping mapping :outputs outputs :db-id db-id :driver driver})
                actual-cols (get-in qp-result [:data :cols])
                actual-rows (get-in qp-result [:data :rows])
                report      (when expected-csv-file
                              (let [expected (fixtures/parse-fixture expected-csv-file
                                                                     (execute/actual->schema actual-cols)
                                                                     ignore-cols)]
                                (diff/diff actual-cols actual-rows expected {:ignore-columns ignore-cols})))
                ;; Run assertions while the scratch tables still exist: after
                ;; produce-actual, before cleanup.
                backend     (sql-tools/parser-backend)
                assertion-results (assertions/run-assertions! db-id driver backend mapping output-sql assertion-defs)
                overall     (assertions/overall-status (or (:status report) :passed)
                                                       assertion-results)]
            (merge {:status         overall
                    :diff           report
                    ;; nil, not [], when no assertions ran — the wire serializes null.
                    :assertions     (not-empty assertion-results)
                    :parser-backend parser-backend
                    :order          order}
                   extra))
          (finally
            ;; Drop node output scratch tables (one per slice node)...
            (doseq [out-spec (vals @outputs*)]
              (scratch/cleanup! db-id db {} out-spec))
            ;; ...then the leaf input scratch tables.
            (scratch/cleanup! db-id db @mapping* nil)))))))

;;; ---------------------------------------------------------------------------
;;; Public entry points
;;; ---------------------------------------------------------------------------

(defn subgraph-input-tables
  "Leaf input table-infos the caller must supply fixtures for, for the
  `(target-id, source-ids)` sub-graph selection. Fail closed on a bad selection
  or an unresolvable dep.

  Each is `{:id :schema :name :columns [...]}`."
  [target-id source-ids all-transforms]
  (-> (subgraph/resolve-subgraph target-id source-ids all-transforms)
      :leaf-deps
      leaf-table-infos))

(defn card-subgraph-input-tables
  "Leaf input table-infos the caller must supply fixtures for, for the
  `(card, source-ids)` sub-graph selection. Fail closed.

  Each is `{:id :schema :name :columns [...]}`."
  [card source-ids all-transforms]
  (-> (subgraph/resolve-card-subgraph card source-ids all-transforms)
      :leaf-deps
      leaf-table-infos))

(defn run-chain-test!
  "Execute a synchronous chained test run of the sub-graph from `source-ids` to
  `target-id`, against fixture data at the slice's leaves.

  Arguments:
  - `target-id`            — target transform id (its output is diffed).
  - `source-ids`           — set of selected boundary source transform ids.
  - `fixtures-by-table-id` — `{<table-id> <java.io.File>}` CSV files keyed by leaf
                             table id.
  - `expected-csv-file`    — `java.io.File` or nil, the expected output of the target.
                             When nil, the diff is skipped and only assertions determine
                             the run status (requires `assertions` to be non-empty).
  - `opts`                 — `{:ignore-columns #{...} :timeout-ms <ms> :assertions [...]}`.
    - `:assertions` — seq of `{:name :sql :severity}` maps (default `[]`).
  - `all-transforms`       — every `:model/Transform` row; one snapshot shared with
                             the caller's permission checks and slice resolution.

  Returns a run-record map (JSON-serializable):
  ```
  {:status         :passed | :failed
   :diff           <diff-report> | nil   ; nil when no expected-csv-file
   :assertions     [<assertion-result> ...] | nil
   :parser-backend <keyword>
   :order          [<transform-id> ...]   ; topological run order
   :output-table   <string>}              ; the target's scratch output table
  ```

  On error, throws a typed `ex-info` (`:error-type` in ex-data). Scratch tables
  are dropped on every path, including errors."
  [target-id source-ids fixtures-by-table-id expected-csv-file opts all-transforms]
  (let [id->transform (u/index-by :id all-transforms)
        target        (or (id->transform target-id)
                          (throw (errors/ex ::errors/target-not-found
                                            (str "Target transform " target-id " not found.")
                                            {:target-id target-id})))
        resolution    (subgraph/resolve-subgraph target-id source-ids all-transforms)
        db-id         (or (transforms-base.u/transform-source-database target)
                          (throw (errors/ex ::errors/missing-database-id
                                            "Cannot determine database id from target transform source query."
                                            {:target-id target-id})))]
    (run-test!
     {:resolution           resolution
      :id->transform        id->transform
      :db-id                db-id
      :schema               (scratch-schema target)
      :fixtures-by-table-id fixtures-by-table-id
      :expected-csv-file    expected-csv-file
      :opts                 opts}
     (fn [{:keys [outputs db-id driver]}]
       (let [target-out (get outputs target-id)]
         ;; The read-back SELECT is string-built, safe only because target-out is a
         ;; system-generated scratch spec (never user input).
         (assert (scratch/test-table-name? (:table target-out))
                 "read-back target must be a system-generated scratch table")
         {:qp-result  (execute/read-back-output db-id driver target-out)
          :output-sql (str "SELECT * FROM " (scratch/spec->sql-ref driver target-out))
          :extra      {:output-table (:table target-out)}})))))

(defn run-card-chain-test!
  "Execute a synchronous chained test run where the target is a Card (saved
  question / model).

  Runs the transform slice from `source-ids` up to the transforms that produce the
  card's tables, then executes the card's query under the scratch metadata-provider
  override (MBQL) or via SQL string rewrite (native), and diffs the result against
  an expected CSV.

  Arguments:
  - `card`                 — a `:model/Card` row; its `:dataset_query` must be a
                             lib-normalized MBQL 5 query (the shape the Card model
                             yields on read).
  - `source-ids`           — set of selected boundary source transform ids.
  - `fixtures-by-table-id` — `{<table-id> <java.io.File>}` CSV files keyed by leaf
                             table id.
  - `expected-csv-file`    — `java.io.File` or nil, the expected output of the card.
                             When nil, only assertions determine the run status.
  - `opts`                 — `{:ignore-columns #{...} :timeout-ms <ms> :assertions [...]}`.
    - `:assertions` — seq of `{:name :sql :severity}` maps (default `[]`).
  - `all-transforms`       — every `:model/Transform` row; one snapshot shared with
                             the caller's permission checks and slice resolution.

  Returns a run-record map (JSON-serializable):
  ```
  {:status         :passed | :failed
   :diff           <diff-report> | nil
   :assertions     [<assertion-result> ...] | nil
   :parser-backend <keyword> | nil        ; nil when the slice has no transforms
   :order          [<transform-id> ...]   ; topological run order of the transform slice
   :card-id        <integer>}             ; the card's id (for debugging)
  ```

  Security: the card is executed via raw `qp/process-query` (no card-caching
  middleware, no sandbox re-evaluation against scratch tables). Callers that expose
  this over an authenticated surface should `read-check :model/Card` first (the HTTP
  endpoint does). `resolve/verify` rejects the SQL if any non-scratch table
  reference survives.

  MBQL card precondition: the card's source tables must be materialized and synced
  so `id->override` can map them by table id.

  Native card limitation: table-qualified column refs (`orders.amount`) whose table
  was rewritten may produce dangling qualifiers. `resolve/verify` catches them and
  throws `::errors/cannot-test-run` with the offending token.

  SQL Server limitation: `:assertions` bind the card SQL as a CTE (`WITH
  test_output AS (<card sql>)`), and T-SQL rejects a bare top-level ORDER BY
  inside a CTE — a card query ending in one fails assertions there. Row order
  never affects the diff (a multiset), so drop the ORDER BY.

  On error, throws a typed `ex-info` (`:error-type` in ex-data). Scratch tables
  are dropped on every path, including errors."
  [card source-ids fixtures-by-table-id expected-csv-file opts all-transforms]
  (let [card-id       (:id card)
        db-id         (or (card-db-id card)
                          (throw (errors/ex ::errors/missing-database-id
                                            (str "Cannot determine database id from card " card-id
                                                 " dataset_query.")
                                            {:card-id card-id})))
        id->transform (u/index-by :id all-transforms)
        resolution    (subgraph/resolve-card-subgraph card source-ids all-transforms)]
    (run-test!
     {:resolution           resolution
      :id->transform        id->transform
      :db-id                db-id
      :schema               (scratch-schema (some-> (first (:order resolution)) id->transform))
      :fixtures-by-table-id fixtures-by-table-id
      :expected-csv-file    expected-csv-file
      :opts                 opts}
     (fn [{:keys [mapping db-id driver]}]
       (let [input-tables (card-table-infos card)
             ;; compile-card-sql produces the scratch-remapped SQL — reuse it for
             ;; both card execution and the assertion test_output binding
             ;; (avoiding a second compile call).
             card-sql     (compile-card-sql card db-id driver mapping input-tables)]
         {:qp-result  (run-card-query! db-id card-id driver card-sql)
          :output-sql card-sql
          :extra      {:card-id card-id}})))))
