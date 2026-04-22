(ns metabase-enterprise.workspaces.remapping-poll-test
  "Tests for the remapping-poll reconciler.

   The SQL layer (reading the `_mb_remappings` ledger over JDBC) is a pure-string unit
   tested in `remapping-ledger-test`. Here we stub the ledger read and drive
   `poll-once!` end-to-end against the real app-db, asserting that:

   * inactive workspaces are no-ops,
   * a populated ledger upserts into `table_remapping`,
   * rerunning the poll is idempotent,
   * ledger rows absent from a subsequent tick do NOT delete app-db rows (append-only),
   * a ledger read error for one DB doesn't tank the other DB's sync."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping-ledger :as ledger]
   [metabase-enterprise.workspaces.remapping-poll :as remapping-poll]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:workspaces} (f))))

(defn- with-workspace-config
  "Install a fake workspace config for the duration of `f`, restoring the prior value afterward.
   Uses [[ws/get-config]] to snapshot the value because `set-config!` takes a value, not an atom."
  [config f]
  (let [prev (ws/get-config)]
    (ws/set-config! config)
    (try (f)
         (finally (ws/set-config! prev)))))

(defn- with-clean-mappings
  "Run `f` with app-db mappings for `db-ids` cleared before and after."
  [db-ids f]
  (doseq [db-id db-ids] (ws.table-remapping/clear-mappings-for-db! db-id))
  (try (f)
       (finally
         (doseq [db-id db-ids] (ws.table-remapping/clear-mappings-for-db! db-id)))))

(defn- with-stubbed-ledger
  "Wrap `f` so `ledger/read-ledger!` returns whatever is in `ledgers-by-schema` for the
   schema it's asked about (mimicking a real warehouse). `sql-jdbc.conn/db->pooled-connection-spec`
   is also stubbed so the poller can run without a real warehouse connection."
  [ledgers-by-schema f]
  (with-redefs [sql-jdbc.conn/db->pooled-connection-spec (fn [db-id] {:stubbed-conn-for-db db-id})
                ledger/read-ledger!                       (fn [_conn schema]
                                                            (get ledgers-by-schema schema))]
    (f)))

(deftest poll-once!-no-op-when-inactive-test
  (testing "poll-once! returns nil and makes no changes when workspaces are inactive"
    (with-workspace-config
      nil
      #(is (nil? (remapping-poll/poll-once!))))))

(deftest poll-once!-syncs-ledger-rows-to-app-db-test
  (testing "ledger rows land in app-db as TableRemapping rows with the workspace schema as :to_schema"
    (with-clean-mappings
      [(mt/id)]
      (fn []
        (with-workspace-config
          {:name "test-ws"
           :databases {(mt/id) {:input_schemas ["PUBLIC"] :output_schema "ws_fresh"}}}
          (fn []
            (with-stubbed-ledger
              {"ws_fresh" [{:from_schema "PUBLIC" :from_table_name "ORDERS"   :to_table_name "orders_copy"}
                           {:from_schema "PUBLIC" :from_table_name "PRODUCTS" :to_table_name "products_copy"}]}
              (fn []
                (let [[{:keys [db-id synced]}] (remapping-poll/poll-once!)]
                  (is (= (mt/id) db-id))
                  (is (= 2 synced))
                  (is (= {["PUBLIC" "ORDERS"]   ["ws_fresh" "orders_copy"]
                          ["PUBLIC" "PRODUCTS"] ["ws_fresh" "products_copy"]}
                         (ws.table-remapping/all-mappings-for-db (mt/id)))))))))))))

(deftest poll-once!-is-idempotent-test
  (testing "calling poll-once! twice with the same ledger inserts nothing new the second time"
    (with-clean-mappings
      [(mt/id)]
      (fn []
        (with-workspace-config
          {:name "test-ws"
           :databases {(mt/id) {:output_schema "ws_idem"}}}
          (fn []
            (with-stubbed-ledger
              {"ws_idem" [{:from_schema "PUBLIC" :from_table_name "ORDERS" :to_table_name "orders_copy"}]}
              (fn []
                (let [[r1] (remapping-poll/poll-once!)
                      [r2] (remapping-poll/poll-once!)]
                  (is (= 1 (:synced r1)))
                  (is (= 0 (:synced r2)) "second tick is a no-op")
                  (is (= {["PUBLIC" "ORDERS"] ["ws_idem" "orders_copy"]}
                         (ws.table-remapping/all-mappings-for-db (mt/id)))))))))))))

(deftest poll-once!-is-append-only-test
  (testing "a ledger row disappearing does NOT delete the app-db row (remappings are forever)"
    (with-clean-mappings
      [(mt/id)]
      (fn []
        (with-workspace-config
          {:name "test-ws"
           :databases {(mt/id) {:output_schema "ws_append"}}}
          (fn []
          ;; First tick: two rows.
            (with-stubbed-ledger
              {"ws_append" [{:from_schema "PUBLIC" :from_table_name "ORDERS"   :to_table_name "orders_copy"}
                            {:from_schema "PUBLIC" :from_table_name "PRODUCTS" :to_table_name "products_copy"}]}
              remapping-poll/poll-once!)
          ;; Second tick: ledger now reports only one row (as if the other vanished).
          ;; Append-only semantics means the app-db keeps both.
            (with-stubbed-ledger
              {"ws_append" [{:from_schema "PUBLIC" :from_table_name "ORDERS" :to_table_name "orders_copy"}]}
              remapping-poll/poll-once!)
            (is (= {["PUBLIC" "ORDERS"]   ["ws_append" "orders_copy"]
                    ["PUBLIC" "PRODUCTS"] ["ws_append" "products_copy"]}
                   (ws.table-remapping/all-mappings-for-db (mt/id))))))))))

(deftest poll-once!-logs-and-continues-on-per-db-error-test
  (testing "when one DB's ledger read throws, the poll continues with the remaining DBs"
    (with-clean-mappings
      [(mt/id)]
      (fn []
        (with-workspace-config
          {:name "test-ws"
         ;; Two databases: the non-existent one (99999) will fail; (mt/id) should still sync.
           :databases {99999   {:output_schema "ws_broken"}
                       (mt/id) {:output_schema "ws_healthy"}}}
          (fn []
            (with-redefs [sql-jdbc.conn/db->pooled-connection-spec (fn [db-id] {:stubbed db-id})
                          ledger/read-ledger! (fn [_conn schema]
                                                (case schema
                                                  "ws_broken"  (throw (ex-info "connection refused" {}))
                                                  "ws_healthy" [{:from_schema "PUBLIC" :from_table_name "ORDERS" :to_table_name "orders_copy"}]))]
              (let [results  (remapping-poll/poll-once!)
                    by-db-id (into {} (map (juxt :db-id identity)) results)]
                (is (true? (:error? (get by-db-id 99999))) "failing DB reports error")
                (is (= 1 (:synced (get by-db-id (mt/id)))) "healthy DB still synced")
                (is (= {["PUBLIC" "ORDERS"] ["ws_healthy" "orders_copy"]}
                       (ws.table-remapping/all-mappings-for-db (mt/id))))))))))))
