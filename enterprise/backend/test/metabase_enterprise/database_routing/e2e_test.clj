(ns metabase-enterprise.database-routing.e2e-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.sandbox.test-util :as sandbox.test-util]
   [metabase.db :as mdb]
   [metabase.driver.h2]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defmacro with-temp-dbs
  "Creates databases like `mt/with-temp`, but creating an actual underlying H2 database with a single table,
  `my_database_name`, with a single column, `str`."
  [bindings & body]
  (letfn [(wrap [names body]
            (if (empty? names)
              `(do ~@body)
              `(one-off-dbs/with-blank-db
                 (let [~(first names) (data/db)]
                   (doseq [statement# ["CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                                       "SET DB_CLOSE_DELAY -1;"
                                       "CREATE TABLE \"my_database_name\" (str TEXT NOT NULL);"
                                       "GRANT ALL ON \"my_database_name\" TO GUEST;"]]
                     (jdbc/execute! one-off-dbs/*conn* [statement#]))
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
        :crowberto
        {"db_name" "__METABASE_ROUTER__"}
        (sandbox.test-util/with-user-attributes!
          :rasta
          {"db_name" "foo"}
          (sandbox.test-util/with-user-attributes!
            :lucky
            {"db_name" "bar"}
            (with-temp-dbs [router-db mirror-db-1 mirror-db-2]
              ;; configure the Mirror Databases
              (t2/update! :model/Database (u/the-id mirror-db-1) {:name "foo" :router_database_id (u/the-id router-db)})
              (t2/update! :model/Database (u/the-id mirror-db-2) {:name "bar" :router_database_id (u/the-id router-db)})
              ;; sync the Router database
              (sync/sync-database! router-db)
              ;; Configure the router database and set up a card that uses it.
              (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                      :user_attribute "db_name"}
                             :model/Card card {:name          "Some Name"
                                               :dataset_query {:database (u/the-id router-db)
                                                               :type     :query
                                                               :query    {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}}}]
                (execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router')")
                (execute-statement! mirror-db-1 "INSERT INTO \"my_database_name\" (str) VALUES ('mirror-1')")
                (execute-statement! mirror-db-2 "INSERT INTO \"my_database_name\" (str) VALUES ('mirror-2')")
                (let [response (mt/user-http-request :rasta :post 202 (str "card/" (u/the-id card) "/query"))]
                  (is (= [["mirror-1"]] (mt/rows response))))
                (let [response (mt/user-http-request :lucky :post 202 (str "card/" (u/the-id card) "/query"))]
                  (is (= [["mirror-2"]] (mt/rows response))))
                (let [response (mt/user-http-request :crowberto :post 202 (str "card/" (u/the-id card) "/query"))]
                  (is (= [["router"]] (mt/rows response))))))))))))

(deftest an-error-is-thrown-if-user-attribute-is-missing-or-no-match
  (mt/with-premium-features #{:database-routing}
    (binding [metabase.driver.h2/*allow-testing-h2-connections* true]
      (sandbox.test-util/with-user-attributes!
        :crowberto
        {"db_name" "nonexistent_database_name"}
        (with-temp-dbs [router-db mirror-db]
          (t2/update! :model/Database (u/the-id mirror-db) {:name "my database name" :router_database_id (u/the-id router-db)})
          (sync/sync-database! router-db)
          (mt/with-temp [:model/DatabaseRouter _ {:database_id (u/the-id router-db)
                                                  :user_attribute "db_name"}]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Anonymous access to a Router Database is prohibited."
                                  (qp/process-query {:database (u/the-id router-db)
                                                     :type :query
                                                     :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}})))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No Mirror Database found for user attribute"
                                  (mt/with-test-user :crowberto
                                    (qp/process-query {:database (u/the-id router-db)
                                                       :type :query
                                                       :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}}))))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"User attribute missing"
                                  (mt/with-test-user :rasta
                                    (qp/process-query {:database (u/the-id router-db)
                                                       :type :query
                                                       :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}}))))))))))

(deftest caching-works
  (mt/with-premium-features #{:database-routing}
    (binding [metabase.driver.h2/*allow-testing-h2-connections* true]
      (sandbox.test-util/with-user-attributes!
        :crowberto
        {"db_name" "__METABASE_ROUTER__"}
        (sandbox.test-util/with-user-attributes!
          :rasta
          {"db_name" "mirror database"}
          (with-temp-dbs [router-db mirror-db]
            (t2/update! :model/Database (u/the-id mirror-db) {:name "mirror database" :router_database_id (u/the-id router-db)})
            (sync/sync-database! router-db)
            (execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router')")
            (execute-statement! mirror-db "INSERT INTO \"my_database_name\" (str) VALUES ('mirror')")
            (mt/with-temp [:model/DatabaseRouter _ {:database_id (u/the-id router-db)
                                                    :user_attribute "db_name"}]

              (mt/with-test-user :crowberto
                (is (= [["router"]]
                       (-> (qp/process-query {:database (u/the-id router-db)
                                              :type :query
                                              :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}
                                              :cache-strategy {:type             :ttl
                                                               :multiplier       60
                                                               :avg-execution-ms 1000
                                                               :min-duration-ms  1}})
                           :data
                           :rows))))
              (mt/with-test-user :crowberto
                (is (=? {:cache/details {:cached true}
                         :data {:rows [["router"]]}}
                        (qp/process-query {:database (u/the-id router-db)
                                           :type :query
                                           :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}
                                           :cache-strategy {:type             :ttl
                                                            :multiplier       60
                                                            :avg-execution-ms 1000
                                                            :min-duration-ms  1}}))))
              (mt/with-test-user :rasta
                (is (=? {:data {:rows [["mirror"]]}}
                        (qp/process-query {:database (u/the-id router-db)
                                           :type :query
                                           :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}
                                           :cache-strategy {:type             :ttl
                                                            :multiplier       60
                                                            :avg-execution-ms 1000
                                                            :min-duration-ms  1}})))
                (is (=? {:cache/details {:cached true}
                         :data {:rows [["mirror"]]}}
                        (qp/process-query {:database (u/the-id router-db)
                                           :type :query
                                           :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}
                                           :cache-strategy {:type             :ttl
                                                            :multiplier       60
                                                            :avg-execution-ms 1000
                                                            :min-duration-ms  1}})))))))))))
