(ns ^:mb/driver-tests metabase-enterprise.database-routing.e2e-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.test :as met]
   [metabase.app-db.core :as mdb]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defmacro with-temp-dbs!
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

(deftest destination-databases-get-used
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes!
        :crowberto
        {"db_name" "__METABASE_ROUTER__"}
        (met/with-user-attributes!
          :rasta
          {"db_name" "destination-db-1"}
          (met/with-user-attributes!
            :lucky
            {"db_name" "destination-db-2"}
            (with-temp-dbs! [router-db destination-db-1 destination-db-2]
              ;; configure the destination Databases
              (t2/update! :model/Database (u/the-id destination-db-1) {:name "destination-db-1" :router_database_id (u/the-id router-db)})
              (t2/update! :model/Database (u/the-id destination-db-2) {:name "destination-db-2" :router_database_id (u/the-id router-db)})
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
                (execute-statement! destination-db-1 "INSERT INTO \"my_database_name\" (str) VALUES ('destination-1')")
                (execute-statement! destination-db-2 "INSERT INTO \"my_database_name\" (str) VALUES ('destination-2')")
                (let [response (mt/user-http-request :rasta :post 202 (str "card/" (u/the-id card) "/query"))]
                  (is (= [["destination-1"]] (mt/rows response))))
                (let [response (mt/user-http-request :lucky :post 202 (str "card/" (u/the-id card) "/query"))]
                  (is (= [["destination-2"]] (mt/rows response))))
                (let [response (mt/user-http-request :crowberto :post 202 (str "card/" (u/the-id card) "/query"))]
                  (is (= [["router"]] (mt/rows response))))))))))))

(deftest an-error-is-thrown-if-user-attribute-is-missing-or-no-match
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes!
        :crowberto
        {"db_name" "nonexistent_database_name"}
        (with-temp-dbs! [router-db destination-db]
          (t2/update! :model/Database (u/the-id destination-db) {:name "my database name" :router_database_id (u/the-id router-db)})
          (sync/sync-database! router-db)
          (mt/with-temp [:model/DatabaseRouter _ {:database_id (u/the-id router-db)
                                                  :user_attribute "db_name"}]
            (testing "Anonymous access is prohibited"
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Anonymous users cannot access a database with routing enabled."
                                    (qp/process-query {:database (u/the-id router-db)
                                                       :type :query
                                                       :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}}))))
            (testing "No destination database matches"
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Database Routing error: No Destination Database with slug `nonexistent_database_name` found."
                                    (mt/with-test-user :crowberto
                                      (qp/process-query {:database (u/the-id router-db)
                                                         :type :query
                                                         :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}})))))
            (testing "User attribute is missing"
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Required user attribute is missing. Cannot route to a Destination Database."
                                    (mt/with-test-user :rasta
                                      (qp/process-query {:database (u/the-id router-db)
                                                         :type :query
                                                         :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}})))))))))))

(deftest caching-works
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes!
        :crowberto
        {"db_name" "__METABASE_ROUTER__"}
        (met/with-user-attributes!
          :rasta
          {"db_name" "destination database"}
          (with-temp-dbs! [router-db destination-db]
            (t2/update! :model/Database (u/the-id destination-db) {:name "destination database" :router_database_id (u/the-id router-db)})
            (sync/sync-database! router-db)
            (execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router')")
            (execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('destination')")
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
                (is (=? {:data {:rows [["destination"]]}}
                        (qp/process-query {:database (u/the-id router-db)
                                           :type :query
                                           :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}
                                           :cache-strategy {:type             :ttl
                                                            :multiplier       60
                                                            :avg-execution-ms 1000
                                                            :min-duration-ms  1}})))
                (is (=? {:cache/details {:cached true}
                         :data {:rows [["destination"]]}}
                        (qp/process-query {:database (u/the-id router-db)
                                           :type :query
                                           :query {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}
                                           :cache-strategy {:type             :ttl
                                                            :multiplier       60
                                                            :avg-execution-ms 1000
                                                            :min-duration-ms  1}})))))))))))

(deftest get-field-values-endpoint-works
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes!
        :crowberto
        {"db_name" "__METABASE_ROUTER__"}
        (met/with-user-attributes!
          :rasta
          {"db_name" "destination-db-1"}
          (met/with-user-attributes!
            :lucky
            {"db_name" "destination-db-2"}
            (with-temp-dbs! [router-db destination-db-1 destination-db-2]
              ;; configure the destination Databases
              (t2/update! :model/Database (u/the-id destination-db-1) {:name "destination-db-1" :router_database_id (u/the-id router-db)})
              (t2/update! :model/Database (u/the-id destination-db-2) {:name "destination-db-2" :router_database_id (u/the-id router-db)})
              ;; sync the Router database
              (sync/sync-database! router-db)
              ;; Configure the router database and set up a card that uses it.
              (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                      :user_attribute "db_name"}]
                (let [table-id (t2/select-one-pk :model/Table :db_id (u/the-id router-db))
                      field-id (t2/select-one-pk :model/Field :table_id table-id)]
                  (execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router')")
                  (execute-statement! destination-db-1 "INSERT INTO \"my_database_name\" (str) VALUES ('destination-1')")
                  (execute-statement! destination-db-2 "INSERT INTO \"my_database_name\" (str) VALUES ('destination-2')")
                  (let [response (mt/user-http-request :rasta :get 200 (str "field/" field-id "/values"))]
                    (is (= {:values [["destination-1"]], :field_id field-id, :has_more_values false}
                           response)))
                  (let [response (mt/user-http-request :crowberto :get 200 (str "field/" field-id "/values"))]
                    (is (= {:values [["router"]] :field_id field-id :has_more_values false}
                           response)))
                  (let [response (mt/user-http-request :lucky :get 200 (str "field/" field-id "/values"))]
                    (is (= {:values [["destination-2"]] :field_id field-id :has_more_values false}
                           response))))))))))))

;; used to be named table but that is reserved on bigquery
(tx/defdataset router-data
  [["t"
    [{:field-name "f", :base-type :type/Text}]
    [["original-foo"]
     ["original-bar"]]]])

(tx/defdataset routed-data
  [["t"
    [{:field-name "f", :base-type :type/Text}]
    [["routed-foo"]
     ["routed-bar"]]]])

(deftest db-routing-e2e-test
  ;; todo: this is to quickly get tests against all drivers right now. We probably want to extract the `wire-routing`
  ;; funciton below, make a few more nice helpers, and remove some of the above tests which are duplicative of the
  ;; below.
  (mt/test-drivers (mt/normal-drivers-with-feature :database-routing)
    (letfn [(wire-routing [{:keys [parent children]}]
              (t2/update! :model/Database :id [:in (map :id children)]
                          {:router_database_id (:id parent)})
              (doseq [child children]
                (t2/update! :model/Database :id (:id child)
                            {:details (assoc (:details child) :destination-database true)})))]
      (mt/with-premium-features #{:database-routing}
        (mt/dataset routed-data
          (let [routed (mt/db)]
            (mt/dataset router-data
              (let [router (mt/db)]
                (wire-routing {:parent router :children [routed]})
                (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router)
                                                        :user_attribute "db_name"}]
                  (met/with-user-attributes! :rasta {"db_name" (:name routed)}
                    (let [crowberto (mt/with-current-user (mt/user->id :crowberto)
                                      (mt/rows (mt/process-query (mt/query t))))
                          rasta (mt/with-current-user (mt/user->id :rasta)
                                  (mt/rows (mt/process-query (mt/query t))))]
                      (is (not= crowberto rasta) "rows were identical meaning it did not route"))))))))))))
