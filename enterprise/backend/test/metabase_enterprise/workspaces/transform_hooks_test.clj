(ns metabase-enterprise.workspaces.transform-hooks-test
  "Tests for `resolve-transform-remapping!`, the EE hook called by the OSS
   transform caller to resolve-or-create a TableRemapping row for a
   transform's declared target in workspace mode."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping-ledger :as ledger]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase-enterprise.workspaces.transform-hooks :as transform-hooks]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

(defn- with-workspace-config [db-id output-schema f]
  (let [config-atom @#'ws/workspaces-config
        prev        @config-atom]
    (ws/set-config! {:name "ws-test"
                     :databases {db-id {:output_schema output-schema}}})
    (ws.table-remapping/clear-mappings-for-db! db-id)
    (try
      (mt/with-premium-features #{:workspaces}
        ;; Stub the warehouse side of `record-remapping!` — the orchestrator now writes
        ;; both the ledger and the app-db, but these tests are about the resolve
        ;; semantics. We don't want to run real CREATE TABLE / INSERT against the test
        ;; H2 (whose `ws_xyz` schema doesn't exist).
        (with-redefs [sql-jdbc.conn/db->pooled-connection-spec (fn [_] {:stubbed true})
                      jdbc/db-transaction*                     (fn [_cs body-fn & _] (body-fn {:tx true}))
                      ledger/ensure-ledger-table!              (fn [_conn _schema] nil)
                      ledger/record-remap!                     (fn [_conn _schema _fs _ft _tt] nil)]
          (f)))
      (finally
        (ws.table-remapping/clear-mappings-for-db! db-id)
        (reset! config-atom prev)))))

(deftest resolve-transform-remapping-returns-nil-without-workspace-test
  (testing "when no workspace is configured for this db, returns nil"
    (let [config-atom @#'ws/workspaces-config
          prev        @config-atom]
      (ws/set-config! nil)
      (try
        (mt/with-premium-features #{:workspaces}
          (is (nil? (transform-hooks/resolve-transform-remapping!
                     (mt/id) "PUBLIC" "ORDERS"))))
        (finally (reset! config-atom prev))))))

(deftest resolve-transform-remapping-inserts-row-test
  (testing "first call for a (db, from-schema, from-table) inserts a TableRemapping row"
    (with-workspace-config
      (mt/id) "ws_xyz"
      (fn []
        (is (nil? (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))
            "precondition: no row yet")
        (let [result (transform-hooks/resolve-transform-remapping!
                      (mt/id) "PUBLIC" "ORDERS")]
          (is (= {:schema "ws_xyz" :name "PUBLIC__ORDERS"} result))
          (is (= ["ws_xyz" "PUBLIC__ORDERS"]
                 (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))
              "row is now in the table_remapping table"))))))

(deftest resolve-transform-remapping-is-idempotent-test
  (testing "repeated calls land the same row and do not duplicate"
    (with-workspace-config
      (mt/id) "ws_xyz"
      (fn []
        (let [r1 (transform-hooks/resolve-transform-remapping!
                  (mt/id) "PUBLIC" "ORDERS")
              r2 (transform-hooks/resolve-transform-remapping!
                  (mt/id) "PUBLIC" "ORDERS")
              r3 (transform-hooks/resolve-transform-remapping!
                  (mt/id) "PUBLIC" "ORDERS")]
          (is (= r1 r2 r3 {:schema "ws_xyz" :name "PUBLIC__ORDERS"}))
          (is (= {["PUBLIC" "ORDERS"] ["ws_xyz" "PUBLIC__ORDERS"]}
                 (ws.table-remapping/all-mappings-for-db (mt/id)))
              "exactly one row, unchanged across repeated resolves"))))))

(deftest resolve-transform-remapping-preserves-existing-row-test
  (testing "if a row already exists with different target, it's returned unchanged (no overwrite)"
    (with-workspace-config
      (mt/id) "ws_xyz"
      (fn []
        ;; Seed a row that does NOT match what remapped-table-name would produce.
        (ws.table-remapping/add-schema+table-mapping!
         (mt/id) ["PUBLIC" "ORDERS"] ["preexisting_schema" "preexisting_table"])
        (let [result (transform-hooks/resolve-transform-remapping!
                      (mt/id) "PUBLIC" "ORDERS")]
          (is (= {:schema "preexisting_schema" :name "preexisting_table"} result))
          (is (= {["PUBLIC" "ORDERS"] ["preexisting_schema" "preexisting_table"]}
                 (ws.table-remapping/all-mappings-for-db (mt/id)))
              "existing row untouched"))))))

(deftest resolve-transform-remapping-distinct-sources-test
  (testing "different (from-schema, from-table) pairs get distinct rows"
    (with-workspace-config
      (mt/id) "ws_xyz"
      (fn []
        (transform-hooks/resolve-transform-remapping! (mt/id) "a" "orders")
        (transform-hooks/resolve-transform-remapping! (mt/id) "b" "orders")
        (transform-hooks/resolve-transform-remapping! (mt/id) "a" "products")
        (is (= {["a" "orders"]   ["ws_xyz" "a__orders"]
                ["b" "orders"]   ["ws_xyz" "b__orders"]
                ["a" "products"] ["ws_xyz" "a__products"]}
               (ws.table-remapping/all-mappings-for-db (mt/id))))))))
