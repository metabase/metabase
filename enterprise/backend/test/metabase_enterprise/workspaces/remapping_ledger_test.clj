(ns metabase-enterprise.workspaces.remapping-ledger-test
  "Unit tests for the pure SQL-builder helpers in [[metabase-enterprise.workspaces.remapping-ledger]].

   These are exact-string comparisons, mirroring the style of `grant-workspace-read-access-sqls-test`
   in `test/metabase/driver/postgres_test.clj`. Driver-level jdbc/execute! is not exercised here —
   that belongs in the poll-level integration tests where we have a real Postgres connection."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.remapping-ledger :as ledger]))

(deftest ^:parallel create-ledger-table-sql-test
  (testing "CREATE TABLE IF NOT EXISTS quotes schema and ledger table names, declares PK on (from_schema, from_table_name)"
    (is (= (str "CREATE TABLE IF NOT EXISTS \"mb__isolation_abc\".\"_mb_remappings\" ("
                "from_schema TEXT NOT NULL, "
                "from_table_name TEXT NOT NULL, "
                "to_table_name TEXT NOT NULL, "
                "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                "PRIMARY KEY (from_schema, from_table_name))")
           (#'ledger/create-ledger-table-sql "mb__isolation_abc"))))
  (testing "schema identifier with spaces is double-quoted intact"
    (is (= (str "CREATE TABLE IF NOT EXISTS \"My Schema\".\"_mb_remappings\" ("
                "from_schema TEXT NOT NULL, "
                "from_table_name TEXT NOT NULL, "
                "to_table_name TEXT NOT NULL, "
                "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                "PRIMARY KEY (from_schema, from_table_name))")
           (#'ledger/create-ledger-table-sql "My Schema")))))

(deftest ^:parallel record-remap-sql-test
  (testing "INSERT uses parameter placeholders for the three user-supplied values"
    (is (= ["INSERT INTO \"ws_schema\".\"_mb_remappings\" (from_schema, from_table_name, to_table_name) VALUES (?, ?, ?) ON CONFLICT (from_schema, from_table_name) DO NOTHING"
            "public"
            "orders"
            "orders_copy_1a2b"]
           (#'ledger/record-remap-sql "ws_schema" "public" "orders" "orders_copy_1a2b"))))
  (testing "ON CONFLICT clause is present so transform re-runs are idempotent"
    (let [[sql & _] (#'ledger/record-remap-sql "ws" "s" "t" "tc")]
      (is (.contains ^String sql "ON CONFLICT (from_schema, from_table_name) DO NOTHING")))))

(deftest ^:parallel read-ledger-sql-test
  (testing "SELECT pulls the three columns needed by the poll"
    (is (= ["SELECT from_schema, from_table_name, to_table_name FROM \"mb__isolation_abc\".\"_mb_remappings\""]
           (#'ledger/read-ledger-sql "mb__isolation_abc")))))
