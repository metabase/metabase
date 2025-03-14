(ns metabase-enterprise.database-routing.e2e-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.sandbox.test-util :as sandbox.test-util]
   [metabase.db :as mdb]
   [metabase.driver.h2]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]))

(defmacro with-blueberries-dbs [bindings & body]
  (letfn [(wrap [names body]
            (prn names body)
            (if (empty? names)
              `(do ~@body)
              `(one-off-dbs/with-blueberries-db
                 (let [~(first names) (data/db)]
                   ~(wrap (rest names) body)))))]
    (wrap bindings body)))

(defn execute-statement! [db statement]
  (sql-jdbc.execute/do-with-connection-with-options
   :h2
   (mdb/spec :h2 (:details db))
   {:write? true}
   (fn [^java.sql.Connection conn]
     (jdbc/execute! {:connection conn} [statement]))))

(deftest mirror-databases-get-used
  (mt/with-premium-features #{:database-routing}
    (binding [metabase.driver.h2/*allow-testing-h2-connections* true]
      (sandbox.test-util/with-user-attributes!
        :rasta
        {"db_name" "foo"}
        (sandbox.test-util/with-user-attributes!
          :lucky
          {"db_name" "bar"}
          (with-blueberries-dbs [router-db mirror-db-1 mirror-db-2]
            (doseq [db [router-db mirror-db-1 mirror-db-2]]
              (execute-statement! db "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"))
            (mt/with-temp [:model/Database router-db {:engine  :h2
                                                      :details (assoc (:details router-db)
                                                                      :USER "GUEST")}
                           :model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                    :user_attribute "db_name"}
                           :model/Database mirror-db-1 {:name               "foo"
                                                        :router_database_id (u/the-id router-db)
                                                        :engine             :h2
                                                        :details            (assoc (:details mirror-db-1)
                                                                                   :USER "GUEST")}
                           :model/Database mirror-db-2 {:name               "bar"
                                                        :router_database_id (u/the-id router-db)
                                                        :engine             :h2
                                                        :details            (assoc (:details mirror-db-2)
                                                                                   :USER "GUEST")}
                           :model/Card card {:name          "Some Name"
                                             :dataset_query {:database (u/the-id router-db)
                                                             :type     :native
                                                             :native   {:query "select * from blueberries_consumed"}}}]
              (sync/sync-database! router-db)
              (doseq [db [router-db mirror-db-1 mirror-db-2]]
                (execute-statement! db "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"))
              (execute-statement! router-db "INSERT INTO blueberries_consumed (str) VALUES ('router')")
              (execute-statement! mirror-db-1 "INSERT INTO blueberries_consumed (str) VALUES ('mirror-1')")
              (execute-statement! mirror-db-2 "INSERT INTO blueberries_consumed (str) VALUES ('mirror-2')")
              (let [response (mt/user-http-request :rasta :post 202 (str "card/" (u/the-id card) "/query"))]
                (is (= [["mirror-1"]] (mt/rows response))))
              (let [response (mt/user-http-request :lucky :post 202 (str "card/" (u/the-id card) "/query"))]
                (is (= [["mirror-2"]] (mt/rows response)))))))))))
