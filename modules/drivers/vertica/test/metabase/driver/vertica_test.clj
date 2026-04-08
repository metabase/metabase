(ns ^:mb/driver-tests metabase.driver.vertica-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(deftest db-timezone-test
  (mt/test-driver :vertica
    (is (= "UTC"
           (driver/db-default-timezone :vertica (mt/db))))))

(deftest ^:parallel additional-connection-string-options-test
  (testing "Make sure you can add additional connection string options (#6651)"
    (is (= {:classname   "com.vertica.jdbc.Driver"
            :subprotocol "vertica"
            :subname     "//localhost:5433/birds-near-me?ConnectionLoadBalance=1"}
           (sql-jdbc.conn/connection-details->spec :vertica {:host               "localhost"
                                                             :port               5433
                                                             :db                 "birds-near-me"
                                                             :additional-options "ConnectionLoadBalance=1"})))))

(defn- compile-query [query]
  (-> (qp.compile/compile query)
      (update :query #(str/split-lines (driver/prettify-native-form :vertica %)))))

(deftest ^:parallel percentile-test
  (mt/test-driver :vertica
    (is (= {:query  ["SELECT"
                     "  APPROXIMATE_PERCENTILE("
                     "    \"public\".\"test_data_venues\".\"id\" USING PARAMETERS percentile = 1"
                     "  ) AS \"percentile\""
                     "FROM"
                     "  \"public\".\"test_data_venues\""]
            :params nil}
           (compile-query
            (mt/mbql-query venues
              {:aggregation [[:percentile $id 1]]}))))))

(deftest ^:parallel dots-in-column-names-test
  (mt/test-driver :vertica
    (testing "Columns with dots in the name should be properly quoted (#13932)"
      (mt/dataset dots-in-names
        (is (= {:lib/type :mbql.stage/native
                :query  ["SELECT"
                         "  *"
                         "FROM"
                         "  table"
                         "WHERE"
                         "  \"public\".\"dots_in_names_objects.stuff\".\"dotted.name\" = ?"]
                :params ["ouija_board"]}
               (compile-query
                {:database   (mt/id)
                 :type       :native
                 :native     {:query         "SELECT * FROM table WHERE {{x}}"
                              :template-tags {"x" {:name         "x"
                                                   :display-name "X"
                                                   :type         :dimension
                                                   :dimension    [:field (mt/id :objects.stuff :dotted.name) nil]
                                                   :widget-type  :text}}}
                 :parameters [{:type   :text
                               :target [:dimension [:template-tag "x"]]
                               :value  "ouija_board"}]})))))))

(deftest array-is-returned-correctly-test
  (mt/test-driver :vertica
    (is (= [[["a" "b" "c"]]]
           (->> (mt/native-query {:query (tx/native-array-query :vertica)})
                mt/process-query
                mt/rows)))))

(deftest table-privileges-test
  (mt/test-driver :vertica
    (testing "`current-user-table-privileges` returns correct structure and privileges"
      (let [conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
            privileges  (sql-jdbc.sync/current-user-table-privileges :vertica conn-spec)]
        (is (seq privileges) "Should return at least one table")
        (doseq [priv privileges]
          (is (= #{:role :schema :table :select :update :insert :delete}
                 (set (keys priv)))
              "Should have all required keys")
          (is (nil? (:role priv)))
          (is (string? (:schema priv)))
          (is (string? (:table priv)))
          (is (boolean? (:select priv)))
          (is (boolean? (:update priv)))
          (is (boolean? (:insert priv)))
          (is (boolean? (:delete priv))))
        (testing "Test tables should appear with at least SELECT privilege"
          (let [orders (filter (fn [priv] (str/includes? (u/lower-case-en (:table priv)) "orders")) privileges)]
            (is (seq orders) "ORDERS table should be found in privileges")
            (is (every? :select orders))))))))

(deftest table-privileges-role-grants-test
  (mt/test-driver :vertica
    (testing "Privileges granted via roles and schema-level grants are resolved correctly"
      (let [admin-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
            test-role  "mb_test_priv_role"
            test-user  "mb_test_priv_user"
            test-pw    "TestPass123!"
            cleanup!   (fn []
                         (doseq [sql [(str "DROP USER IF EXISTS " test-user)
                                      (str "DROP ROLE IF EXISTS " test-role)]]
                           (try (jdbc/execute! admin-spec [sql])
                                (catch Exception _))))]
        (try
          ;; Setup: create role, user, grant schema-level SELECT via role
          (cleanup!)
          (jdbc/execute! admin-spec [(str "CREATE ROLE " test-role)])
          (jdbc/execute! admin-spec [(str "GRANT SELECT ON ALL TABLES IN SCHEMA public TO " test-role)])
          (jdbc/execute! admin-spec [(str "CREATE USER " test-user " IDENTIFIED BY '" test-pw "'")])
          (jdbc/execute! admin-spec [(str "GRANT " test-role " TO " test-user)])
          ;; Connect as test user and check privileges
          (let [user-spec (sql-jdbc.conn/connection-details->spec
                           :vertica
                           (assoc (tx/dbdef->connection-details :vertica nil nil)
                                  :user test-user
                                  :password test-pw))
                ;; Debug: what does the test user see?
                _          (log/fatalf "DEBUG: user-info %s" (pr-str (jdbc/query user-spec ["SELECT user_name, is_super_user FROM v_catalog.users WHERE user_name = CURRENT_USER"])))
                _          (log/fatalf "DEBUG: role grants %s" (pr-str (jdbc/query user-spec ["SELECT grantee, object_name, object_type FROM v_catalog.grants WHERE object_type = 'ROLE'"])))
                _          (log/fatalf "DEBUG: table grants for role %s" (pr-str (jdbc/query user-spec [(str "SELECT grantee, object_schema, object_name, object_type, privileges_description FROM v_catalog.grants WHERE grantee = '" test-role "' AND object_type IN ('TABLE', 'VIEW') LIMIT 5")])))
                _          (log/fatalf "DEBUG: schema grants %s" (pr-str (jdbc/query user-spec [(str "SELECT grantee, object_name, object_type, privileges_description FROM v_catalog.grants WHERE grantee = '" test-role "' AND object_type = 'SCHEMA'")])))
                _          (log/fatalf "DEBUG: all grants for test entities %s" (pr-str (jdbc/query user-spec [(str "SELECT grantee, object_schema, object_name, object_type, privileges_description FROM v_catalog.grants WHERE grantee IN ('" test-user "', '" test-role "', 'PUBLIC') LIMIT 20")])))
                privileges (sql-jdbc.sync/current-user-table-privileges :vertica user-spec)
                _          (log/fatalf "DEBUG: privileges result %s" (pr-str (take 5 privileges)))
                orders     (filter (fn [priv] (str/includes? (u/lower-case-en (:table priv)) "orders")) privileges)]
            (is (seq privileges) "Non-superuser with role grant should see tables")
            (is (seq orders) "ORDERS table should be visible via role grant")
            (is (every? :select orders) "Should have SELECT via schema-level role grant")
            (is (not-any? :insert orders) "Should NOT have INSERT (only SELECT was granted)"))
          (finally
            (cleanup!)))))))
