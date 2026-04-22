(ns metabase-enterprise.workspaces.table-remapping-test
  "Tests for the public writer API in `metabase-enterprise.workspaces.table-remapping`.
   Exercises the round-trip between `add-schema+table-mapping!`, `remap-table`,
   `remove-schema+table-mapping!`, `all-mappings-for-db`, `clear-mappings-for-db!`,
   and the dual-write `record-remapping!`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping-ledger :as ledger]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:workspaces} (f))))

(defn- clean-db-fixture
  "Run `f` with mappings cleared before and after so tests don't leak state."
  [db-id f]
  (ws.table-remapping/clear-mappings-for-db! db-id)
  (try (f)
       (finally (ws.table-remapping/clear-mappings-for-db! db-id))))

(defn- with-workspace-config
  "Install a fake workspace config for the duration of `f`, restoring the prior value afterward."
  [config f]
  (let [prev (ws/get-config)]
    (ws/set-config! config)
    (try (f)
         (finally (ws/set-config! prev)))))

(deftest remap-table-returns-nil-when-no-mapping-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (is (nil? (ws.table-remapping/remap-table (mt/id) "nope_schema" "nope_table"))))))

(deftest add-then-remap-table-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (is (= ["ws_schema" "orders_copy"]
            (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))

(deftest all-mappings-for-db-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "PRODUCTS"] ["ws_schema" "products_copy"])
     (is (= {["PUBLIC" "ORDERS"]   ["ws_schema" "orders_copy"]
             ["PUBLIC" "PRODUCTS"] ["ws_schema" "products_copy"]}
            (ws.table-remapping/all-mappings-for-db (mt/id)))))))

(deftest remove-schema+table-mapping!-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (ws.table-remapping/remove-schema+table-mapping! (mt/id) ["PUBLIC" "ORDERS"])
     (is (nil? (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))

(deftest clear-mappings-for-db!-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "PRODUCTS"] ["ws_schema" "products_copy"])
     (ws.table-remapping/clear-mappings-for-db! (mt/id))
     (is (= {} (ws.table-remapping/all-mappings-for-db (mt/id)))))))

(deftest add-schema+table-mapping!-is-idempotent-test
  (testing "duplicate inserts swallow the SQLSTATE 23505 unique-constraint violation"
    (clean-db-fixture
     (mt/id)
     (fn []
       (ws.table-remapping/add-schema+table-mapping!
        (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
       (is (nil? (ws.table-remapping/add-schema+table-mapping!
                  (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"]))
           "second identical insert no-ops instead of throwing")
       (is (= {["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"]}
              (ws.table-remapping/all-mappings-for-db (mt/id)))
           "only one row persists")))))

;; ------------------------------------------------- record-remapping! -------------------------------------------------

(defn- with-stubbed-warehouse
  "Stub `sql-jdbc.conn/db->pooled-connection-spec` plus `jdbc/with-db-transaction` so
   ledger writes don't need a real warehouse, and record the (schema, from-schema,
   from-table, to-table) calls made against `ledger/ensure-ledger-table!` and
   `ledger/record-remap!` into the atoms supplied."
  [{:keys [ensure-calls record-calls ledger-throws?]} f]
  (with-redefs [sql-jdbc.conn/db->pooled-connection-spec (fn [db-id] {:stubbed-conn-for-db db-id})
                jdbc/db-transaction*                     (fn [_conn-spec body-fn & _opts] (body-fn {:tx true}))
                ledger/ensure-ledger-table!              (fn [_conn schema]
                                                           (swap! ensure-calls conj schema))
                ledger/record-remap!                     (fn [_conn schema from-schema from-table to-table]
                                                           (when ledger-throws?
                                                             (throw (ex-info "simulated ledger failure" {})))
                                                           (swap! record-calls conj
                                                                  {:schema schema
                                                                   :from-schema from-schema
                                                                   :from-table-name from-table
                                                                   :to-table-name to-table}))]
    (f)))

(deftest record-remapping!-writes-ledger-and-app-db-test
  (testing "record-remapping! writes both the warehouse ledger and the app-db cache"
    (clean-db-fixture
     (mt/id)
     (fn []
       (with-workspace-config
         {:name "test-ws"
          :databases {(mt/id) {:output_schema "ws_fresh"}}}
         (fn []
           (let [ensure-calls (atom [])
                 record-calls (atom [])]
             (with-stubbed-warehouse
               {:ensure-calls ensure-calls :record-calls record-calls}
               (fn []
                 (ws.table-remapping/record-remapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")))
             (testing "ledger ensured and written exactly once in the workspace schema"
               (is (= ["ws_fresh"] @ensure-calls))
               (is (= [{:schema "ws_fresh"
                        :from-schema "PUBLIC"
                        :from-table-name "ORDERS"
                        :to-table-name "orders_copy"}]
                      @record-calls)))
             (testing "app-db cache populated with the resolved workspace schema"
               (is (= ["ws_fresh" "orders_copy"]
                      (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS")))))))))))

(deftest record-remapping!-is-idempotent-test
  (testing "calling record-remapping! twice writes the ledger twice (ledger de-dupes via ON CONFLICT) "
    (testing "and skips the app-db insert the second time"
      (clean-db-fixture
       (mt/id)
       (fn []
         (with-workspace-config
           {:name "test-ws"
            :databases {(mt/id) {:output_schema "ws_idem"}}}
           (fn []
             (let [ensure-calls (atom [])
                   record-calls (atom [])]
               (with-stubbed-warehouse
                 {:ensure-calls ensure-calls :record-calls record-calls}
                 (fn []
                   (ws.table-remapping/record-remapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
                   (ws.table-remapping/record-remapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")))
               (testing "ledger invoked twice (the ON CONFLICT inside the SQL handles de-dup)"
                 (is (= 2 (count @record-calls))))
               (testing "app-db has a single row for the mapping (no duplicate-key explosion)"
                 (is (= {["PUBLIC" "ORDERS"] ["ws_idem" "orders_copy"]}
                        (ws.table-remapping/all-mappings-for-db (mt/id)))))))))))))

(deftest record-remapping!-skips-app-db-when-ledger-fails-test
  (testing "if the warehouse step throws, the app-db is NOT written"
    (clean-db-fixture
     (mt/id)
     (fn []
       (with-workspace-config
         {:name "test-ws"
          :databases {(mt/id) {:output_schema "ws_fail"}}}
         (fn []
           (let [ensure-calls (atom [])
                 record-calls (atom [])]
             (with-stubbed-warehouse
               {:ensure-calls ensure-calls :record-calls record-calls :ledger-throws? true}
               (fn []
                 (is (thrown? clojure.lang.ExceptionInfo
                              (ws.table-remapping/record-remapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")))))
             (testing "ledger write was attempted"
               (is (= ["ws_fail"] @ensure-calls)))
             (testing "app-db cache was NOT populated"
               (is (nil? (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))
             (testing "record-calls is empty because record-remap! is what threw"
               (is (= [] @record-calls))))))))))

(deftest record-remapping!-requires-workspaced-db-test
  (testing "throws with a clear error when db is not workspaced (db-workspace-schema returns nil)"
    (with-workspace-config
      {:name "test-ws" :databases {}}
      (fn []
        (let [ensure-calls (atom [])
              record-calls (atom [])]
          (with-stubbed-warehouse
            {:ensure-calls ensure-calls :record-calls record-calls}
            (fn []
              (let [ex (try
                         (ws.table-remapping/record-remapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
                         nil
                         (catch clojure.lang.ExceptionInfo e e))]
                (is (some? ex) "record-remapping! must throw when the db is not workspaced")
                (is (re-find #"not workspaced" (ex-message ex)))
                (is (= (mt/id) (:db-id (ex-data ex)))))))
          (testing "no warehouse or app-db work happened"
            (is (= [] @ensure-calls))
            (is (= [] @record-calls))))))))
