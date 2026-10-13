(ns metabase.sql-parsing.sqlglot-java-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-parsing.parser :as parser]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.sql-parsing.sqlglot-java :as sqlglot-java]
   [metabase.sql-tools.interface :as sql-tools]
   [metabase.sql-tools.settings :as settings]
   [metabase.sql-tools.sqlglot-java.core]
   [metabase.test :as mt]))

(deftest native-protocol-contract-test
  (let [native (sqlglot-java/parser)]
    (testing "all ten SqlParser operations use the Java AST shim"
      (is (= [[nil nil "orders"]] (protocol/referenced-tables native "postgres" "SELECT id FROM orders")))
      (is (= [[nil nil "orders" "id"]] (protocol/referenced-fields native "postgres" "SELECT id FROM orders")))
      (is (= [["id" true [[nil "public" "orders" "id"]]]]
             (protocol/returned-columns-lineage native "postgres" "SELECT id FROM orders" "public" {})))
      (is (= {:status "ok"} (protocol/validate-query native "postgres" "SELECT id FROM orders" nil {})))
      (is (= {:is_simple true} (protocol/simple-query native "postgres" "SELECT id FROM orders")))
      (is (string? (protocol/add-into-clause native "tsql" "SELECT id FROM orders" "result_table")))
      (let [fields (protocol/field-references native "postgres" "SELECT total * 1.08 AS gross FROM orders")]
        (is (= "custom_field" (get-in fields [:returned_fields 0 :type])))
        (is (= "gross" (get-in fields [:returned_fields 0 :alias])))
        (is (= "total" (get-in fields [:returned_fields 0 :used_fields 0 :column]))))
      (is (= "SELECT id FROM archived_orders"
             (protocol/replace-names native "postgres" "SELECT id FROM orders"
                                     {:tables [[{:table "orders"} "archived_orders"]]})))
      (is (true? (:allowed_stmt_type? (protocol/single-stmt-of-type native "postgres" "SELECT id FROM orders" "read"))))
      (is (= "success" (:status (protocol/transpile-sql native "SELECT id FROM orders" "postgres" "mysql")))))
    (testing "parse errors keep the transport-neutral exception contract"
      (let [error (try (protocol/referenced-tables native "postgres" "SELECT * FROM WHERE (")
                       (catch Exception e e))]
        (is (true? (:sql-parsing/error (ex-data error))))
        (is (= "ParseError" (:sql-parsing/python-error-type (ex-data error))))))))

(deftest backend-dispatch-test
  (testing "every existing sql-tools multimethod has both SQLGlot implementations"
    (doseq [multimethod [sql-tools/returned-columns-impl sql-tools/referenced-tables-impl
                         sql-tools/referenced-fields-impl sql-tools/field-references-impl
                         sql-tools/validate-query-impl sql-tools/replace-names-impl
                         sql-tools/referenced-tables-raw-impl sql-tools/simple-query?-impl
                         sql-tools/add-into-clause-impl sql-tools/transpile-sql-impl]]
      (is (some? (get-method multimethod :sqlglot)))
      (is (some? (get-method multimethod :sqlglot-java)))))
  (testing "explicit multimethod dispatch overrides the global setting in both directions"
    (let [seen (atom []) native (sqlglot-java/parser)]
      (binding [settings/*parser-backend-override* :sqlglot-java]
        (mt/with-dynamic-fn-redefs [parser/parser (fn [] (swap! seen conj parser/*backend*) native)]
          (sql-tools/simple-query?-impl :sqlglot "SELECT 1")
          (sql-tools/simple-query?-impl :sqlglot-java "SELECT 1")))
      (is (= [:graalvm :sqlglot-java] @seen))))
  (testing "the same setting selects Java for direct sql-parsing calls (including statement checks)"
    (binding [settings/*parser-backend-override* :sqlglot-java]
      (is (satisfies? protocol/SqlParser (parser/parser))))))

(deftest native-map-inputs-and-persistent-results-test
  (let [native (sqlglot-java/parser)]
    (testing "schema maps cross the JVM boundary directly, including keyword keys"
      (is (= {:status "ok"}
             (protocol/validate-query native "postgres" "SELECT id FROM orders" nil
                                      {:orders {:id "INT"}})))
      (is (= [["id" true [[nil "public" "orders" "id"]]]]
             (protocol/returned-columns-lineage native "postgres" "SELECT * FROM orders"
                                                "public" {:public {:orders {:id "INT"}}}))))
    (testing "replacement maps and nested sequences preserve values"
      (is (= "SELECT id FROM archived_orders"
             (protocol/replace-names native "postgres" "SELECT id FROM orders"
                                     {:tables [[{:table "orders"} "archived_orders"]]}))))
    (testing "results are persistent Clojure values, with null tuple positions retained"
      (let [tables (protocol/referenced-tables native "postgres" "SELECT * FROM orders")
            fields (protocol/field-references native "postgres" "SELECT id AS key FROM orders")]
        (is (vector? tables))
        (is (vector? (first tables)))
        (is (= [nil nil "orders"] (first tables)))
        (is (map? fields))
        (is (vector? (:returned_fields fields)))
        (is (map? (first (:returned_fields fields))))))))

(deftest native-keyword-input-values-test
  (let [native (sqlglot-java/parser)]
    (is (= "SELECT id FROM archived_orders"
           (protocol/replace-names native "postgres" "SELECT id FROM orders"
                                   {:tables [[{:table :orders} :archived_orders]]})))
    (is (= {:status "ok"}
           (protocol/validate-query native "postgres" "SELECT id FROM \"ns/orders\"" nil
                                    {:ns/orders {:id :INT}})))))
