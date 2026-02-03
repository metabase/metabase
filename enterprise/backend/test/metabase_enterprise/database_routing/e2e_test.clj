(ns ^:mb/driver-tests metabase-enterprise.database-routing.e2e-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [clojurewerkz.quartzite.conversion :as qc]
   [metabase-enterprise.test :as met]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.sync.task.sync-databases :as task.sync-databases]
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

(defn- wire-routing [{:keys [parent children]}]
  (t2/update! :model/Database :id [:in (map :id children)]
              {:router_database_id (:id parent)})
  (doseq [child children]
    (t2/update! :model/Database :id (:id child)
                {:details (assoc (:details child) :destination-database true)})))

(defmulti router-dataset-name
  "Name for router dataset"
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod router-dataset-name :default [_driver] "db-router-data")

(doseq [driver [:redshift :databricks :presto-jdbc]]
  (defmethod router-dataset-name driver [_driver] "db-routing-data"))

(defmulti routed-dataset-name
  "Name for routed dataset"
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod routed-dataset-name :default [_driver] "db-routed-data")

(doseq [driver [:redshift :databricks :presto-jdbc]]
  (defmethod routed-dataset-name driver [_driver] "db-routing-data"))

(defmulti router-dataset-details
  "Modified details for the router dataset"
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod router-dataset-details :default [_driver] {})

(defmethod router-dataset-details :clickhouse [_driver]
  {:dbname "db_router_data"
   :enable-multiple-db false})

(defmethod router-dataset-details :bigquery-cloud-sdk [_driver]
  {:dataset-filters-patterns "metabase_routing_dataset"})

(defmethod router-dataset-details :databricks [driver]
  {:multi-level-schema false
   :schema-filters-patterns (router-dataset-name driver)})

(defmulti routed-dataset-details
  "Modified details for the routed dataset"
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod routed-dataset-details :default [_driver] {})

(defmethod routed-dataset-details :clickhouse [_driver]
  {:dbname "db_routed_data"
   :enable-multiple-db false})

(defmethod routed-dataset-details :bigquery-cloud-sdk [driver]
  {:service-account-json (tx/db-test-env-var-or-throw driver :service-account-json-routing)
   :dataset-filters-patterns "metabase_routing_dataset"})

(defmethod routed-dataset-details :redshift [driver]
  {:db (tx/db-test-env-var-or-throw driver :db-routing)})

(defmethod routed-dataset-details :databricks [driver]
  {:catalog (tx/db-test-env-var-or-throw driver :catalog-routing)
   :multi-level-schema false
   :schema-filters-patterns (routed-dataset-name driver)})

(deftest db-routing-e2e-test
  (mt/test-drivers (mt/normal-driver-select {:+features [:database-routing]})
    (mt/with-premium-features #{:database-routing}
      (binding [tx/*use-routing-details* true]
        (mt/dataset (mt/dataset-definition (routed-dataset-name driver/*driver*)
                                           [["t"
                                             [{:field-name "f", :base-type :type/Text}]
                                             [["routed-foo"]
                                              ["routed-bar"]]]])
          (let [routed (mt/db)]
            (binding [tx/*use-routing-details* false]
              (mt/dataset (mt/dataset-definition (router-dataset-name driver/*driver*)
                                                 [["t"
                                                   [{:field-name "f", :base-type :type/Text}]
                                                   [["original-foo"]
                                                    ["original-bar"]]]])
                (let [router (mt/db)]
                  (t2/update! :model/Database (u/the-id routed)
                              {:details (merge (:details routed)
                                               (routed-dataset-details driver/*driver*))})
                  (t2/update! :model/Database (u/the-id router)
                              {:details (merge (:details router)
                                               (router-dataset-details driver/*driver*))})
                  (let [router (t2/select-one :model/Database :id (u/the-id router))
                        routed (t2/select-one :model/Database :id (u/the-id routed))]
                    (sync/sync-database! router {:scan :schema})
                    (sync/sync-database! routed {:scan :schema})
                    (wire-routing {:parent router :children [routed]})
                    (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router)
                                                            :user_attribute "db_name"}]
                      (met/with-user-attributes! :rasta {"db_name" (:name routed)}
                        (mt/with-current-user (mt/user->id :crowberto)
                          (is (= [[1 "original-foo"] [2 "original-bar"]]
                                 (->> (mt/query t)
                                      (mt/process-query)
                                      (mt/formatted-rows [int str])))))
                        (mt/with-current-user (mt/user->id :rasta)
                          (is (= [[1 "routed-foo"] [2 "routed-bar"]]
                                 (->> (mt/query t)
                                      (mt/process-query)
                                      (mt/formatted-rows [int str]))))))
                      (testing "sync task can see database"
                        (let [job-data       (reify qc/JobDataMapConversion
                                               ;; i'm doing this at the "job-data" level so it's as close to what runs in
                                               ;; the task itself without actually hitting scheduler stuff.
                                               (from-job-data [_] {"db-id" (u/the-id router)})
                                               (to-job-data [_]))
                              results        (#'task.sync-databases/sync-and-analyze-database! job-data)
                              step-with-name (fn [step-name]
                                               (->> results :metadata-results :steps
                                                    (some (fn [step] (when (= step-name (first step)) (second step))))))]
                          (is (set/subset? #{"sync-fields" "sync-tables"}
                                           (->> results :metadata-results :steps (map first) set)))
                          ;; this is usually 1 total tables, but some cloud dbs put multiple databases inside of a
                          ;; single catalog
                          (is (=? {:updated-tables 0 :total-tables pos-int?}
                                  (step-with-name "sync-tables"))))))))))))))))

(deftest athena-region-bucket-routing-test
  (mt/test-driver :athena
    (mt/with-premium-features #{:database-routing}
      (binding [tx/*use-routing-details* true]
        (mt/dataset (mt/dataset-definition "db-routing-data"
                                           [["t_0"
                                             [{:field-name "f", :base-type :type/Text}]
                                             [["us-east-2-foo"]
                                              ["us-east-2-bar"]]]])
          (let [routed (mt/db)]
            (binding [tx/*use-routing-details* false]
              (mt/dataset (mt/dataset-definition "db-routing-data"
                                                 [["t_0"
                                                   [{:field-name "f", :base-type :type/Text}]
                                                   [["us-east-1-foo"]
                                                    ["us-east-1-bar"]]]])
                (let [router (mt/db)]
                  (t2/update! :model/Database (u/the-id routed)
                              {:details (assoc (:details routed)
                                               :dbname nil
                                               :s3_staging_dir (tx/db-test-env-var-or-throw :athena :s3-staging-dir-routing)
                                               :region (tx/db-test-env-var-or-throw :athena :region-routing))})
                  (t2/update! :model/Database (u/the-id router)
                              {:details (assoc (:details router)
                                               :dbname nil)})
                  (let [router (t2/select-one :model/Database :id (u/the-id router))
                        routed (t2/select-one :model/Database :id (u/the-id routed))]
                    (sync/sync-database! router {:scan :schema})
                    (sync/sync-database! routed {:scan :schema})
                    (wire-routing {:parent router :children [routed]})
                    (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router)
                                                            :user_attribute "db_name"}]
                      (met/with-user-attributes! :rasta {"db_name" (:name routed)}
                        (mt/with-current-user (mt/user->id :crowberto)
                          (is (= [[1 "us-east-1-foo"] [2 "us-east-1-bar"]]
                                 (->> (mt/query t_0)
                                      (mt/process-query)
                                      (mt/formatted-rows [int str])))))
                        (mt/with-current-user (mt/user->id :rasta)
                          (is (= [[1 "us-east-2-foo"] [2 "us-east-2-bar"]]
                                 (->> (mt/query t_0)
                                      (mt/process-query)
                                      (mt/formatted-rows [int str])))))))))))))))))
