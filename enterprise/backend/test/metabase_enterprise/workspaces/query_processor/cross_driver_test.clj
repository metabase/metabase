(ns ^:mb/driver-tests metabase-enterprise.workspaces.query-processor.cross-driver-test
  "End-to-end read-path coverage for workspace table remapping against real
   warehouses. Each test sets up a workspaced database, writes data via a
   transform (which is redirected into the workspace schema and records a
   `TableRemapping`), then reads back via the canonical name through the QP
   and asserts the rewritten query executes successfully on the warehouse.

   Tests increase in query-shape complexity: single-table → join → three-way
   join → nested MBQL.

   The intended target layer: the H2-only string-SQL tests in `middleware_test.clj`
   prove the rewriter emits the right strings, and the SQLGlot corpus runner proves
   the grammar layer across 7 dialects. This namespace is meant to fill the third
   layer — does the warehouse actually accept and execute the rewritten SQL?

   Driver-specific risks the layer is meant to catch that H2 cannot:
   - Snowflake case-folding (unquoted identifiers go uppercase)
   - BigQuery backtick quoting
   - Redshift case-insensitive identifiers in some configs
   - Quoting interactions between SQLGlot output and HoneySQL/JDBC

   ## Status: tests commented out

   The harness as written sets `output_schema = canonical-schema` to avoid
   per-driver `CREATE SCHEMA` setup. With both schemas equal, the rewriter is asked
   to replace `X` with `X` — a no-op — so none of the driver-specific risks above
   actually fire. Cleanup `DROP TABLE` would also target the canonical (test data)
   schema. The `deftest`s below are wrapped in `(comment ...)` until the harness is
   reworked to provision a real second schema per driver."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-util :as transforms.tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- canonical-schema
  "Schema of the orders table on the current driver. Each driver's test data lives
   in a different schema (PUBLIC, public, <dataset>, etc.); we discover it rather
   than hardcode."
  []
  (t2/select-one-fn :schema :model/Table :id (mt/id :orders)))

(defn- mbql-source-from-orders
  "An MBQL source that selects from the orders test table — used as the body of
   test transforms. Just provides rows; the output schema/name come from the
   transform's :target."
  []
  {:database (mt/id)
   :type     "query"
   :query    {:source-table (mt/id :orders)
              :limit        3}})

(defn- mbql-transform
  "Build a transform map with a query source and the given target."
  [target-name]
  {:source {:type :query :query (mbql-source-from-orders)}
   :name   (str "ws_xdriver_" target-name)
   :target {:schema (canonical-schema)
            :name   target-name
            :type   :table}})

(defn- count-rows-via-qp
  "Count rows via an MBQL query through the QP, looking up the table by canonical
   name. Phase 1 + Phase 2 should rewrite this to read from the workspace copy
   when a TableRemapping is in effect."
  [_canonical-schema canonical-table-name]
  (when-let [tbl (t2/select-one :model/Table
                                :db_id (mt/id)
                                :name  canonical-table-name)]
    (-> (mt/process-query {:database (mt/id)
                           :type     :query
                           :query    {:source-table (:id tbl)
                                      :aggregation  [[:count]]}})
        mt/rows
        ffirst)))

(defn- run-with-workspace
  "Set up a `:provisioned` WorkspaceDatabase for the current driver's DB, run
   `body-fn`, tear down workspace + remap rows on the way out. Reuses the canonical
   schema for `output_schema` so we don't depend on schema creation on every driver."
  [body-fn]
  (mt/with-premium-features #{:workspaces}
    (let [ws-id     (t2/insert-returning-pk! :model/Workspace
                                             {:name (str "ws-xdriver-" (random-uuid))})
          ws-schema (canonical-schema)]
      (try
        (t2/insert! :model/WorkspaceDatabase
                    {:workspace_id     ws-id
                     :database_id      (mt/id)
                     :database_details {}
                     :output_schema    ws-schema
                     :input_schemas    []
                     :status           :provisioned})
        (try
          (body-fn ws-schema)
          (finally
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))
        (finally
          (t2/delete! :model/WorkspaceDatabase :workspace_id ws-id)
          (t2/delete! :model/Workspace :id ws-id))))))

(defn- run-and-wait!
  "Execute the transform map `xform-data` (creating a temporary :model/Transform),
   then wait for the warehouse table named `target-name` to appear in app-DB
   metadata. Throws on timeout."
  [xform-data target-name]
  (mt/with-temp [:model/Transform t-row xform-data]
    (transforms.execute/execute! t-row {:run-method :manual})
    (transforms.tu/wait-for-table target-name 10000)))

;;; ----------------------------------- Tests -----------------------------------
;;;
;;; All tests below are commented out pending a fix for the same-schema bug:
;;; the harness uses `output_schema = canonical-schema` to avoid `CREATE SCHEMA`
;;; per driver, but that means the rewriter is asked to replace `X` with `X` —
;;; a no-op. The Snowflake case-folding, BigQuery quoting, and Redshift
;;; identifier rules these tests claim to catch cannot fire when from-schema
;;; and to-schema are identical. Worse: the cleanup `DROP TABLE` runs against
;;; the canonical schema (i.e., the test data warehouse's test schema).
;;;
;;; Fix shape: provision a real second schema per driver (or use a shared
;;; `metabase_workspaces_test` schema pre-created by the data loader hook),
;;; then re-enable. Until then the harness shape stays here as a starting
;;; point but the tests don't run.

(comment

  (deftest single-remapped-table-test
    (testing "a transform writing to a canonical target on a workspaced DB writes to the workspace schema, and reads via the canonical name resolve to the workspace copy"
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (transforms.tu/with-transform-cleanup!
          [{target-name :name} {:type   :table
                                :schema (canonical-schema)
                                :name   "single_remapped"}]
          (run-with-workspace
           (fn [_ws-schema]
             (run-and-wait! (mbql-transform target-name) target-name)
             (testing "TableRemapping row was recorded for canonical -> workspace"
               (let [recorded (ws.table-remapping/all-mappings-for-db (mt/id))]
                 (is (contains? recorded [(canonical-schema) target-name]))))
             (testing "reading via canonical name resolves to the workspace copy"
               (is (some? (count-rows-via-qp (canonical-schema) target-name))))))))))

  (deftest non-remapped-table-passthrough-test
    (testing "a non-remapped table read via the canonical name passes through unchanged on a workspaced DB"
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (run-with-workspace
         (fn [_ws-schema]
         ;; No transform run, no TableRemapping row. Read against the existing
         ;; orders table by canonical schema/name; the QP should return rows
         ;; without rewriting (because no remap exists for orders).
           (is (some? (count-rows-via-qp (canonical-schema) "orders"))
               "canonical orders read passes through when no remap exists"))))))

  (deftest join-one-side-remapped-test
    (testing "an MBQL join where one side is remapped executes against the warehouse"
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (transforms.tu/with-transform-cleanup!
          [{remapped-name :name} {:type   :table
                                  :schema (canonical-schema)
                                  :name   "join_one_remapped"}]
          (run-with-workspace
           (fn [_ws-schema]
             (run-and-wait! (mbql-transform remapped-name) remapped-name)
             (let [orders-id    (mt/id :orders)
                   remapped-tbl (t2/select-one :model/Table :db_id (mt/id) :name remapped-name)
                   remapped-id-field (:id (t2/select-one :model/Field
                                                         :table_id (:id remapped-tbl)
                                                         :name "id"))]
               (testing "join from orders -> remapped table executes"
                 (is (some? (-> (mt/process-query
                                 {:database (mt/id)
                                  :type     :query
                                  :query    {:source-table orders-id
                                             :joins        [{:source-table (:id remapped-tbl)
                                                             :alias        "r"
                                                             :condition    [:= [:field (mt/id :orders :id) nil]
                                                                            [:field remapped-id-field {:join-alias "r"}]]}]
                                             :aggregation  [[:count]]}})
                                mt/rows
                                ffirst))
                     "rewritten side resolves on the warehouse")))))))))

  (deftest join-both-sides-remapped-test
    (testing "an MBQL join where both sides are remapped executes against the warehouse"
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (transforms.tu/with-transform-cleanup!
          [{left-name :name}  {:type :table :schema (canonical-schema) :name "join_both_left"}
           {right-name :name} {:type :table :schema (canonical-schema) :name "join_both_right"}]
          (run-with-workspace
           (fn [_ws-schema]
             (run-and-wait! (mbql-transform left-name) left-name)
             (run-and-wait! (mbql-transform right-name) right-name)
             (let [left-tbl  (t2/select-one :model/Table :db_id (mt/id) :name left-name)
                   right-tbl (t2/select-one :model/Table :db_id (mt/id) :name right-name)
                   left-id   (:id (t2/select-one :model/Field :table_id (:id left-tbl) :name "id"))
                   right-id  (:id (t2/select-one :model/Field :table_id (:id right-tbl) :name "id"))]
               (testing "both sides got rewritten and the warehouse accepted the resulting SQL"
                 (is (some? (-> (mt/process-query
                                 {:database (mt/id)
                                  :type     :query
                                  :query    {:source-table (:id left-tbl)
                                             :joins        [{:source-table (:id right-tbl)
                                                             :alias        "r"
                                                             :condition    [:= [:field left-id nil]
                                                                            [:field right-id {:join-alias "r"}]]}]
                                             :aggregation  [[:count]]}})
                                mt/rows
                                ffirst)))))))))))

  (deftest three-way-join-mixed-remapping-test
    (testing "a three-way MBQL join with mixed remapping executes against the warehouse"
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (transforms.tu/with-transform-cleanup!
          [{a-name :name} {:type :table :schema (canonical-schema) :name "three_way_a"}
           {b-name :name} {:type :table :schema (canonical-schema) :name "three_way_b"}]
          (run-with-workspace
           (fn [_ws-schema]
             (run-and-wait! (mbql-transform a-name) a-name)
             (run-and-wait! (mbql-transform b-name) b-name)
             (let [a-tbl (t2/select-one :model/Table :db_id (mt/id) :name a-name)
                   b-tbl (t2/select-one :model/Table :db_id (mt/id) :name b-name)
                   a-id  (:id (t2/select-one :model/Field :table_id (:id a-tbl) :name "id"))
                   b-id  (:id (t2/select-one :model/Field :table_id (:id b-tbl) :name "id"))]
             ;; orders (canonical, no remap) -> a-name (remapped) -> b-name (remapped)
               (testing "three-way join with two remapped + one canonical executes"
                 (is (some? (-> (mt/process-query
                                 {:database (mt/id)
                                  :type     :query
                                  :query    {:source-table (mt/id :orders)
                                             :joins        [{:source-table (:id a-tbl)
                                                             :alias        "a"
                                                             :condition    [:= [:field (mt/id :orders :id) nil]
                                                                            [:field a-id {:join-alias "a"}]]}
                                                            {:source-table (:id b-tbl)
                                                             :alias        "b"
                                                             :condition    [:= [:field a-id {:join-alias "a"}]
                                                                            [:field b-id {:join-alias "b"}]]}]
                                             :aggregation  [[:count]]}})
                                mt/rows
                                ffirst)))))))))))

  (deftest nested-mbql-remapped-source-test
    (testing "a nested MBQL query whose inner source references a remapped table executes against the warehouse"
    ;; In MBQL a nested source-query compiles to either a CTE or a subquery
    ;; depending on the driver — both forms exercise the same remap resolution
    ;; path inside a nested context.
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (transforms.tu/with-transform-cleanup!
          [{remapped-name :name} {:type   :table
                                  :schema (canonical-schema)
                                  :name   "nested_inner"}]
          (run-with-workspace
           (fn [_ws-schema]
             (run-and-wait! (mbql-transform remapped-name) remapped-name)
             (let [remapped-tbl (t2/select-one :model/Table :db_id (mt/id) :name remapped-name)]
               (testing "the rewriter resolved the remap inside a nested source-query"
                 (is (some? (-> (mt/process-query
                                 {:database (mt/id)
                                  :type     :query
                                  :query    {:source-query {:source-table (:id remapped-tbl)
                                                            :limit        10}
                                             :aggregation  [[:count]]}})
                                mt/rows
                                ffirst)))))))))))) ; end (comment ...) — see header above
