(ns metabase.transforms.test-run.chain
  "Synchronous orchestrator for *chained* (sub-graph) transform test runs.

  Entry point: [[run-chain-test!]].

  Generalizes the single-transform orchestrator ([[metabase.transforms.test-run.core/run-test!]])
  to a connected slice of the transform DAG. The user picks boundary *source*
  transforms plus a single *target*; every node between them runs, fed by fixtures
  at the slice's leaves, and the target's output is diffed against an expected CSV.

  ## Flow

  ```
  [1] resolve-subgraph → slice + topo order + leaf-deps           (subgraph ns)
  [2] resolve leaf-deps → leaf table-infos (fail closed); match fixtures
  [3] parse each leaf fixture against its table's column schema
  [4] seed scratch tables for the leaves → mapping {leaf-real → leaf-scratch}
  [5] for each transform node in topo order:
        • build a per-node scratch output target (suffix out_<id>)
        • resolve-test-transform under the ACCUMULATED mapping (native rewrite
          or MBQL override) + 3-guard verify
        • DDL guard, then driver/run-transform! → writes the node's scratch output
        • register {node-real-output → node-scratch-output} into the mapping
  [6] read back the TARGET node's scratch output
  [7] parse expected CSV against actual output column types; diff/diff
  finally: cleanup ALL scratch tables (leaves + one output per node)
  ```

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
  - **MBQL nodes reading upstream outputs** are not supported (the MBQL override
    keys by synced table id, which an unmaterialized upstream output lacks); such a
    node fails closed in `resolve`'s verify guards. Native chains are the clean v1
    path.

  Error taxonomy mirrors `core`/`inputs`/`resolve`: typed `ex-info` propagated to
  the API layer, which maps `:error-type` to an HTTP status."
  (:require
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.transforms.test-run.core :as core]
   [metabase.transforms.test-run.diff :as diff]
   [metabase.transforms.test-run.execute :as execute]
   [metabase.transforms.test-run.fixtures :as fixtures]
   [metabase.transforms.test-run.inputs :as inputs]
   [metabase.transforms.test-run.resolve :as resolve]
   [metabase.transforms.test-run.scratch :as scratch]
   [metabase.transforms.test-run.subgraph :as subgraph]
   [metabase.util :as u]
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
  (let [out-spec  (scratch/scratch-output-target schema nonce
                                                 (str "out_" (:id transform)))
        artifact  (resolve/resolve-test-transform transform mapping out-spec
                                                  {:db db :input-tables input-tables})
        all-names (conj (mapv :table (vals mapping)) (:table out-spec))]
    (execute/assert-all-test-tables! all-names)
    (binding [driver.settings/*query-timeout-ms* timeout-ms]
      (driver/run-transform! drv
                             (execute/build-transform-details (:compiled artifact) out-spec db-id db drv)
                             {:overwrite? true}))
    artifact))

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

  On error, propagates a typed `ex-info` (see ns docstring). Cleanup (drop all
  scratch tables) runs in `finally` on every path."
  [target-id source-ids fixtures-by-table-id expected-csv-file opts]
  (let [timeout-ms     (get opts :timeout-ms core/default-test-run-timeout-ms)
        ignore-cols    (get opts :ignore-columns #{})
        all-transforms (t2/select :model/Transform)
        id->transform  (u/index-by :id all-transforms)
        target         (or (id->transform target-id)
                           (throw (ex-info (str "Target transform " target-id " not found.")
                                           {:error-type ::target-not-found :target-id target-id})))
        ;; Step 1: resolve the sub-graph (slice + topo order + leaf deps).
        {:keys [slice order leaf-deps]} (subgraph/resolve-subgraph target-id source-ids all-transforms)
        db-id          (node-db-id target)
        _              (when-not db-id
                         (throw (ex-info "Cannot determine database id from target transform source query."
                                         {:error-type ::missing-database-id :target-id target-id})))
        _              (assert-single-database! slice id->transform db-id)
        db             (t2/select-one :model/Database :id db-id)
        drv            (keyword (:engine db))
        schema         (or (-> target :target :schema) "public")
        ;; Step 2: resolve leaves → table-infos (fail closed); match fixtures.
        leaves         (leaf-table-infos leaf-deps)
        _              (inputs/match-fixtures leaves (set (keys fixtures-by-table-id)))
        ;; Step 3: parse each leaf fixture against its table's column schema.
        seed-inputs    (mapv (fn [{:keys [id columns] :as table-info}]
                               {:table-info table-info
                                :fixture    (fixtures/parse-fixture
                                             (get fixtures-by-table-id id) columns)})
                             leaves)
        nonce          (scratch/new-nonce)
        mapping*       (atom {})
        outputs*       (atom {})
        backend*       (atom nil)]
    (driver.conn/with-transform-connection
      ;; Step 4: seed scratch leaf tables once.
      (try
        (reset! mapping* (scratch/seed! db-id db schema seed-inputs nonce))
        ;; Step 5: run each node in topological order, accumulating the mapping.
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
            (reset! backend* (:parser-backend artifact))
            ;; Register this node's real output → its scratch output for downstream nodes.
            (swap! mapping* assoc (node-real-output-spec node) out-spec)))
        ;; Step 6: read back the TARGET node's scratch output.
        (let [target-out  (get @outputs* target-id)
              qp-result   (execute/read-back-output db-id drv target-out)
              actual-cols (get-in qp-result [:data :cols])
              actual-rows (get-in qp-result [:data :rows])
              ;; Step 7: parse expected CSV against actual output column types; diff.
              expected    (fixtures/parse-fixture expected-csv-file (execute/actual->schema actual-cols))
              report      (diff/diff actual-cols actual-rows expected {:ignore-columns ignore-cols})]
          {:status         (:status report)
           :diff           report
           :parser-backend @backend*
           :order          order
           :output-table   (:table target-out)})
        (finally
          ;; Cleanup runs on ALL paths. Must be inside with-transform-connection so
          ;; DROP TABLE runs under write-data credentials (scratch.clj contract: callers
          ;; wrap the full run — seed! through cleanup! — in the canonical connection context).
          ;; Drop every node's output + all leaf scratch tables.
          (doseq [out-spec (vals @outputs*)]
            (scratch/cleanup! db-id db {} out-spec))
          (scratch/cleanup! db-id db @mapping* nil))))))
