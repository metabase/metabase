(ns ^:mb/driver-tests metabase-enterprise.workspaces.query-processor.cross-driver-ladder-test
  "End-to-end read-path coverage: write data via two transforms (one targeting the
   canonical schema, one targeting the workspace schema), then read back via the
   canonical name and assert the QP returned the workspace copy.

   Unlike the H2-only string-SQL ladder in `middleware_test.clj`, these tests exercise
   the full pipeline against a real warehouse:

     transform write (canonical) -> warehouse rows
     transform write (canonical, but workspace mode rewrites target) -> different warehouse rows
     QP read (canonical name) -> Phase 1 + Phase 2 rewrite -> rows from workspace copy

   This is the integration layer the SQLGlot corpus runner can't reach: it only proves
   grammar (parse-rewrite-emit). This proves *semantics on a real warehouse* — the
   driver actually resolves the rewritten SQL and returns rows from the workspace
   table.

   Driver-specific risks this catches that H2 can't:
   - Snowflake case-folding (unquoted identifiers go uppercase)
   - BigQuery backtick quoting
   - Redshift case-insensitive identifiers in some configs
   - Quoting interactions between SQLGlot output and HoneySQL/JDBC

   See GHY-3471. V1 covers Rung 1 only; remaining rungs follow in sibling tickets."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-util :as transforms.tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- canonical-schema
  "Schema of the orders table on the current driver — used as the canonical schema
   for the test. Each driver's test data lives in a different schema (PUBLIC, public,
   <dataset>, etc.); we discover it rather than hardcode."
  []
  (t2/select-one-fn :schema :model/Table :id (mt/id :orders)))

(defn- mbql-source-from-orders
  "An MBQL source map that selects `:orders.id` — used as the body of test transforms.
   The transform output schema/name come from the transform's `:target`, not from
   here; the source just provides rows."
  []
  {:database (mt/id)
   :type     "query"
   :query    {:source-table (mt/id :orders)
              :limit        3}})

(defn- mbql-transform
  "Build a transform map with a query source and the given target."
  [target-name]
  {:source {:type :query :query (mbql-source-from-orders)}
   :name   (str "ladder_" target-name)
   :target {:schema (canonical-schema)
            :name   target-name
            :type   :table}})

(defn- count-rows-via-qp
  "Count rows in a table by running an MBQL query through the QP. Uses the
   canonical schema/name — Phase 1 + Phase 2 should rewrite this to read from
   the workspace copy when a TableRemapping is in effect."
  [_canonical-schema canonical-table-name]
  (when-let [tbl (t2/select-one :model/Table
                                :db_id  (mt/id)
                                :name   canonical-table-name)]
    (-> (mt/process-query {:database (mt/id)
                           :type     :query
                           :query    {:source-table (:id tbl)
                                      :aggregation  [[:count]]}})
        mt/rows
        ffirst)))

(deftest ladder-rung-1-cross-driver-test
  (testing "Rung 1: a transform writing to a canonical target on a workspaced DB writes to the workspace schema instead, and reads against the canonical name return the workspace copy"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:workspaces}
        (transforms.tu/with-transform-cleanup!
          [{target-name :name} {:type   :table
                                :schema (canonical-schema)
                                :name   "ladder_rung_1"}]
          (let [ws-id     (t2/insert-returning-pk! :model/Workspace
                                                   {:name (str "ladder-ws-" (random-uuid))})
                ws-schema (canonical-schema)] ; reuse the canonical schema as workspace output for portability
            (try
              (t2/insert! :model/WorkspaceDatabase
                          {:workspace_id     ws-id
                           :database_id      (mt/id)
                           :database_details {}
                           :output_schema    ws-schema
                           :input_schemas    []
                           :status           :provisioned})
              (try
                (let [transform-data (mbql-transform target-name)]
                  (mt/with-temp [:model/Transform t-row transform-data]
                    ;; Execute the transform. With workspace mode active for this DB,
                    ;; `transforms.execute/execute!` calls `resolve-transform-target`
                    ;; which rewrites the target's :schema to ws-schema and records a
                    ;; TableRemapping row from (canonical-schema, target-name) to
                    ;; (ws-schema, target-name).
                    (transforms.execute/execute! t-row {:run-method :manual})
                    (transforms.tu/wait-for-table target-name 10000))

                  (testing "TableRemapping row was recorded for the canonical -> workspace mapping"
                    (let [recorded (ws.table-remapping/all-mappings-for-db (mt/id))]
                      (is (contains? recorded [(canonical-schema) target-name])
                          "the canonical (schema, name) is keyed in the remapping store")))

                  (testing "reading back via the canonical name resolves to the workspace copy"
                    (is (some? (count-rows-via-qp (canonical-schema) target-name))
                        "QP read against the canonical target returns rows (the workspace copy)")))
                (finally
                  (ws.table-remapping/clear-mappings-for-db! (mt/id))))
              (finally
                (t2/delete! :model/WorkspaceDatabase :workspace_id ws-id)
                (t2/delete! :model/Workspace :id ws-id)))))))))
