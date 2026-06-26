(ns metabase.transforms.test-run.chain
  "Synchronous orchestrator for *chained* (sub-graph) transform test runs.

  Entry points:
  - [[run-chain-test!]]      — transform-target: run the slice, diff the target's scratch output.
  - [[run-card-chain-test!]] — card-target: run the slice, compile + execute the card's query
                               under the scratch override, diff the result.

  Generalizes the single-transform orchestrator ([[metabase.transforms.test-run.core/run-test!]])
  to a connected slice of the transform DAG. The user picks boundary *source*
  transforms plus a single *target*; every node between them runs, fed by fixtures
  at the slice's leaves, and the target's output is diffed against an expected CSV.

  The accumulating mapping is the heart of the chain: topo order guarantees an
  upstream output is registered before any downstream node resolves, so a
  downstream node's reference to an upstream output table is transparently
  redirected to the upstream's scratch output.

  ## v1 scope

  - **Single database.** All slice nodes must share the target's source database;
    a cross-DB slice fails closed (`::cross-database-subgraph`).
  - **Materialized leaves only.** A leaf that is another transform's *unmaterialized*
    output (a never-run sibling) has no synced Table to derive a fixture schema
    from; `inputs/resolve-table-dep` fails closed on it
    (`::transform-dep-not-supported`).
  - **MBQL nodes reading upstream outputs** are not supported and fail at
    `resolve` time with `::cannot-test-run`. Native chains are the clean v1 path.
  - **Card target / MBQL card:** the card's source tables must be synced;
    `id->override` keys by table id — an unsynced output has no id to key on.
  - **Card target / native card:** a table-qualified column ref (`orders.amount`)
    whose table was rewritten may produce a dangling qualifier, rejected at verify
    time with `::cannot-test-run`.

  Errors are typed `ex-info` carrying `:error-type`."
  (:require
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.core :as qp]
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms.test-run.card-refs :as card-refs]
   [metabase.transforms.test-run.core :as core]
   [metabase.transforms.test-run.diff :as diff]
   [metabase.transforms.test-run.execute :as execute]
   [metabase.transforms.test-run.fixtures :as fixtures]
   [metabase.transforms.test-run.inputs :as inputs]
   [metabase.transforms.test-run.resolve :as resolve]
   [metabase.transforms.test-run.scratch :as scratch]
   [metabase.transforms.test-run.subgraph :as subgraph]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Internal helpers
;;; ---------------------------------------------------------------------------

(defn- node-db-id
  "The source database id of a transform node (native and MBQL both carry it on
  the source query)."
  [transform]
  (-> transform :source :query :database))

(defn- assert-single-database!
  "Fail closed unless every node in `slice` shares `db-id`. Cross-database
  sub-graphs are out of scope for v1."
  [slice id->transform db-id]
  (let [offenders (into {}
                        (keep (fn [id]
                                (let [node-db (node-db-id (id->transform id))]
                                  (when (not= node-db db-id)
                                    [id node-db]))))
                        slice)]
    (when (seq offenders)
      (throw (ex-info
              (str "Chained test runs require all transforms in the sub-graph to use the"
                   " same database. The target uses database " db-id
                   " but these nodes do not: " (pr-str offenders) ".")
              {:error-type ::cross-database-subgraph
               :db-id      db-id
               :offenders  offenders})))))

(defn- leaf-table-infos
  "Resolve `leaf-deps` (raw dep maps) to deduped leaf table-infos, fail closed.

  Reuses `inputs/resolve-table-dep`, which throws a typed error on an unsupported
  leaf (e.g. an unmaterialized upstream/sibling output → `::transform-dep-not-supported`,
  or an unsynced table → `::table-not-found`). Dedupes by table id since two slice
  nodes may reference the same leaf table."
  [leaf-deps]
  (into [] (m/distinct-by :id) (map inputs/resolve-table-dep leaf-deps)))

(defn- node-real-output-spec
  "The `{:schema :table}` of a transform node's real (production) output table,
  used as the mapping key that downstream nodes' inputs are redirected from."
  [transform]
  {:schema (-> transform :target :schema)
   :table  (-> transform :target :name)})

(defn- run-node!
  "Resolve, guard, and execute a single transform node against the accumulated
  `mapping`, writing its output to a fresh per-node scratch table.

  Returns the resolved artifact (with `:target` = the node's `{:schema :table}`
  scratch output spec and `:parser-backend`). Appends nothing to shared state —
  the caller threads the mapping and tracks scratch tables."
  [{:keys [transform mapping db db-id drv schema nonce input-tables timeout-ms]}]
  (let [catalog   (driver.sql/db-slot-value drv db)
        out-spec  (scratch/scratch-output-target schema nonce
                                                 (str "out_" (:id transform))
                                                 catalog)
        artifact  (resolve/resolve-test-transform transform mapping out-spec
                                                  {:db db :input-tables input-tables})
        all-names (conj (mapv :table (vals mapping)) (:table out-spec))]
    (execute/assert-all-test-tables! all-names)
    (binding [driver.settings/*query-timeout-ms* timeout-ms]
      (driver/run-transform! drv
                             (execute/build-transform-details (:compiled artifact) out-spec db-id db drv)
                             {:overwrite? true}))
    artifact))

(defn- run-slice-inner!
  "Run the shared slice: seed leaves, execute each node in topo order, accumulate
  the mapping. Returns `{:mapping :db :db-id :drv :schema :outputs :nonce :leaves}`.

  Caller is responsible for wrapping in `driver.conn/with-transform-connection`
  and for `finally` cleanup of the returned mapping and outputs."
  [{:keys [order leaf-deps db-id db-from-id fixtures-by-table-id id->transform timeout-ms schema]}]
  (let [schema    (or schema
                      (some-> (first (keep #(-> (id->transform %) :target :schema) order))
                              identity)
                      "public")
        db        (or db-from-id (t2/select-one :model/Database :id db-id))
        drv       (keyword (:engine db))
        leaves    (leaf-table-infos leaf-deps)
        _         (inputs/match-fixtures leaves (set (keys fixtures-by-table-id)))
        seed-inputs (mapv (fn [{:keys [id columns] :as table-info}]
                            {:table-info table-info
                             :fixture    (fixtures/parse-fixture
                                          (get fixtures-by-table-id id) columns)})
                          leaves)
        nonce     (scratch/new-nonce)
        mapping*  (atom {})
        outputs*  (atom {})]
    (reset! mapping* (scratch/seed! db-id db schema seed-inputs nonce))
    (let [last-backend* (atom nil)]
      (doseq [node-id order]
        (let [node     (id->transform node-id)
              artifact (run-node! {:transform    node
                                   :mapping      @mapping*
                                   :db           db
                                   :db-id        db-id
                                   :drv          drv
                                   :schema       schema
                                   :nonce        nonce
                                   :input-tables leaves
                                   :timeout-ms   timeout-ms})
              out-spec (:target artifact)]
          (swap! outputs* assoc node-id out-spec)
          (reset! last-backend* (:parser-backend artifact))
          ;; Register this node's real output → its scratch output for downstream nodes.
          (swap! mapping* assoc (node-real-output-spec node) out-spec)))
      {:mapping        @mapping*
       :db             db
       :db-id          db-id
       :drv            drv
       :schema         schema
       :outputs        @outputs*
       :nonce          nonce
       :leaves         leaves
       :parser-backend @last-backend*})))

;;; ---------------------------------------------------------------------------
;;; Card execution helpers
;;; ---------------------------------------------------------------------------

(defn- card-db-id
  "Database id from a card's dataset_query."
  [card]
  (get-in card [:dataset_query :database]))

(defn- card-table-infos
  "Resolve the physical tables a card's query reads to table-info maps."
  [card]
  (let [table-ids (card-refs/card->tables card)]
    (into [] (m/distinct-by :id) (map #(inputs/resolve-table-dep {:table %}) table-ids))))

(defn- run-card-query!
  "Compile the card's query to SQL under the scratch override — MBQL via the
  metadata provider, native via SQL rewrite — verify it, then execute it.

  `resolve/verify` is the safety proof: it fails closed if any non-scratch table
  reference survives the rewrite. No DDL guard — the card path issues no CTAS.

  Returns the raw QP result `{:status :completed :data {:cols [...] :rows [...]}}`.
  Throws `::cannot-test-run` on a guard or compile failure."
  [card db-id drv mapping input-tables]
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
          (resolve/rewrite-native-sql drv (lib/raw-native-query query) mapping backend)
          ;; MBQL path: compile under the override-provider so the compiler
          ;; emits scratch-qualified SQL without any string rewriting.
          ;; Precondition: card's source tables must be synced (have a Table id)
          ;; so id->override can map them.
          (let [provider (resolve/override-provider db-id (resolve/id->override input-tables mapping))]
            (qp.store/with-metadata-provider provider
              (:query (qp.compile/compile dataset-q)))))]
    ;; verify: every SQL ref must be a scratch table; no original table token survives.
    (resolve/verify drv mapping final-sql)
    (log/debug "Running card query under scratch override" {:db-id db-id :drv drv})
    (let [result (qp/process-query {:database db-id
                                    :type     :native
                                    :native   {:query final-sql}})]
      (when (not= :completed (:status result))
        (throw (ex-info
                (str "Card query failed during test run: QP returned " (pr-str (:status result)))
                {:error-type ::execution-failed
                 :qp-status  (:status result)
                 :card-id    (:id card)})))
      result)))

;;; ---------------------------------------------------------------------------
;;; Public entry points
;;; ---------------------------------------------------------------------------

(defn subgraph-input-tables
  "Leaf input table-infos for the `(target-id, source-ids)` sub-graph selection,
  fail closed. The chained analogue of `inputs/required-input-tables`: the set of
  boundary tables the caller must supply fixtures for.

  Each table-info is `{:id :schema :name :columns [...]}`. Throws the same typed
  errors as `resolve-subgraph` (`::sources-not-ancestors`) and
  `inputs/resolve-table-dep` (`::transform-dep-not-supported`, `::table-not-found`)."
  [target-id source-ids all-transforms]
  (-> (subgraph/resolve-subgraph target-id source-ids all-transforms)
      :leaf-deps
      leaf-table-infos))

(defn card-subgraph-input-tables
  "Leaf input table-infos for the `(card, source-ids)` sub-graph selection,
  fail closed.

  Mirrors [[subgraph-input-tables]] for a card target. Returns the same
  `{:id :schema :name :columns [...]}` shape; the caller supplies one fixture CSV
  per returned table-info."
  [card source-ids all-transforms]
  (-> (subgraph/card->necessary-fixtures card source-ids all-transforms)
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
  - `expected-csv-file`    — `java.io.File`, the expected output of the target.
  - `opts`                 — `{:ignore-columns #{...} :timeout-ms <ms>}`.

  Returns a run-record map (JSON-serializable):
  ```
  {:status         :passed | :failed
   :diff           <diff-report>
   :parser-backend <keyword>
   :order          [<transform-id> ...]   ; topological run order
   :output-table   <string>}              ; the target's scratch output table
  ```

  On error, throws a typed `ex-info` (`:error-type` in ex-data). Cleanup (drop all
  scratch tables) runs in `finally` on every path."
  [target-id source-ids fixtures-by-table-id expected-csv-file opts]
  (let [timeout-ms     (get opts :timeout-ms core/default-test-run-timeout-ms)
        ignore-cols    (get opts :ignore-columns #{})
        all-transforms (t2/select :model/Transform)
        id->transform  (u/index-by :id all-transforms)
        target         (or (id->transform target-id)
                           (throw (ex-info (str "Target transform " target-id " not found.")
                                           {:error-type ::target-not-found :target-id target-id})))
        {:keys [slice order leaf-deps]} (subgraph/resolve-subgraph target-id source-ids all-transforms)
        db-id          (node-db-id target)
        _              (when-not db-id
                         (throw (ex-info "Cannot determine database id from target transform source query."
                                         {:error-type ::missing-database-id :target-id target-id})))
        _              (assert-single-database! slice id->transform db-id)
        schema         (or (-> target :target :schema) "public")
        db             (t2/select-one :model/Database :id db-id)
        mapping*       (atom {})
        outputs*       (atom {})]
    (driver.conn/with-transform-connection
      (try
        (let [{:keys [mapping outputs drv parser-backend]}
              (run-slice-inner! {:slice                slice
                                 :order                order
                                 :leaf-deps            leaf-deps
                                 :db-id                db-id
                                 :db-from-id           db
                                 :fixtures-by-table-id fixtures-by-table-id
                                 :id->transform        id->transform
                                 :timeout-ms           timeout-ms
                                 :schema               schema})]
          (reset! mapping* mapping)
          (reset! outputs* outputs)
          ;; Read back the target node's scratch output.
          (let [target-out  (get outputs target-id)
                qp-result   (execute/read-back-output db-id drv target-out)
                actual-cols (get-in qp-result [:data :cols])
                actual-rows (get-in qp-result [:data :rows])
                expected    (fixtures/parse-fixture expected-csv-file (execute/actual->schema actual-cols))
                report      (diff/diff actual-cols actual-rows expected {:ignore-columns ignore-cols})]
            {:status         (:status report)
             :diff           report
             :parser-backend parser-backend
             :order          order
             :output-table   (:table target-out)}))
        (finally
          (doseq [out-spec (vals @outputs*)]
            (scratch/cleanup! db-id db {} out-spec))
          (scratch/cleanup! db-id db @mapping* nil))))))

(defn run-card-chain-test!
  "Execute a synchronous chained test run where the target is a Card (saved
  question / model).

  Runs the transform slice from `source-ids` up to the transforms that produce the
  card's tables, then executes the card's query under the scratch metadata-provider
  override (MBQL) or via SQL string rewrite (native), and diffs the result against
  an expected CSV.

  Arguments:
  - `card`                 — a `:model/Card` row with a `:dataset_query` key.
  - `source-ids`           — set of selected boundary source transform ids.
  - `fixtures-by-table-id` — `{<table-id> <java.io.File>}` CSV files keyed by leaf
                             table id.
  - `expected-csv-file`    — `java.io.File`, the expected output of the card's query.
  - `opts`                 — `{:ignore-columns #{...} :timeout-ms <ms>}`.

  Returns a run-record map (JSON-serializable):
  ```
  {:status  :passed | :failed
   :diff    <diff-report>
   :order   [<transform-id> ...]   ; topological run order of the transform slice
   :card-id <integer>}             ; the card's id (for debugging)
  ```

  Security: the card is executed via raw `qp/process-query` (no card-caching
  middleware, no sandbox re-evaluation against scratch tables). The caller is
  responsible for `read-check :model/Card` before calling this fn. `resolve/verify`
  is the safety proof — it fails closed if any non-scratch table reference survives
  in the final SQL.

  MBQL card precondition: the card's source tables must be materialized and synced
  so `id->override` can map them by table id.

  Native card limitation: table-qualified column refs (`orders.amount`) whose table
  was rewritten may produce dangling qualifiers. `resolve/verify` catches them and
  throws `::cannot-test-run` with the offending token.

  On error, throws a typed `ex-info` (`:error-type` in ex-data). Cleanup runs in
  `finally` on every path."
  [card source-ids fixtures-by-table-id expected-csv-file opts]
  (let [timeout-ms    (get opts :timeout-ms core/default-test-run-timeout-ms)
        ignore-cols   (get opts :ignore-columns #{})
        card-id       (:id card)
        db-id         (card-db-id card)
        _             (when-not db-id
                        (throw (ex-info
                                (str "Cannot determine database id from card " card-id
                                     " dataset_query.")
                                {:error-type ::missing-database-id :card-id card-id})))
        all-transforms (t2/select :model/Transform)
        id->transform  (u/index-by :id all-transforms)
        {:keys [slice order leaf-deps]} (subgraph/card->necessary-fixtures card source-ids all-transforms)
        _             (assert-single-database! slice id->transform db-id)
        db            (t2/select-one :model/Database :id db-id)
        drv           (keyword (:engine db))
        ;; Use the first slice node's target schema as the scratch schema, falling back
        ;; to "public". Consistent with how run-chain-test! derives schema from the target.
        schema        (or (some-> (first order) id->transform :target :schema) "public")
        mapping*      (atom {})
        outputs*      (atom {})]
    (driver.conn/with-transform-connection
      (try
        (let [{:keys [mapping outputs]}
              (run-slice-inner! {:slice                slice
                                 :order                order
                                 :leaf-deps            leaf-deps
                                 :db-id                db-id
                                 :db-from-id           db
                                 :fixtures-by-table-id fixtures-by-table-id
                                 :id->transform        id->transform
                                 :timeout-ms           timeout-ms
                                 :schema               schema})]
          (reset! mapping* mapping)
          (reset! outputs* outputs)
          ;; Resolve the card's referenced tables for the override key set.
          (let [input-tables (card-table-infos card)
                qp-result    (run-card-query! card db-id drv mapping input-tables)
                actual-cols  (get-in qp-result [:data :cols])
                actual-rows  (get-in qp-result [:data :rows])
                expected     (fixtures/parse-fixture expected-csv-file (execute/actual->schema actual-cols))
                report       (diff/diff actual-cols actual-rows expected {:ignore-columns ignore-cols})]
            {:status  (:status report)
             :diff    report
             :order   order
             :card-id card-id}))
        (finally
          ;; Drop node output scratch tables (one per slice node).
          (doseq [out-spec (vals @outputs*)]
            (scratch/cleanup! db-id db {} out-spec))
          ;; Drop leaf input scratch tables.
          (scratch/cleanup! db-id db @mapping* nil))))))
