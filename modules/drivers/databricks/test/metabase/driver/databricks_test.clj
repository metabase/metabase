(ns ^:mb/driver-tests metabase.driver.databricks-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.databricks :as databricks]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [toucan2.core :as t2]))

;; Because the datasets that are tested are preloaded, it is fine just to modify the database details to sync other schemas.
(deftest ^:parallel sync-test
  (mt/test-driver
    :databricks
    (testing "`driver/describe-database` implementation returns expected results for inclusion of test-data schema."
      (is (= {:tables
              #{{:name "venues", :schema "test-data", :description nil}
                {:name "checkins", :schema "test-data", :description nil}
                {:name "users", :schema "test-data", :description nil}
                {:name "people", :schema "test-data", :description nil}
                {:name "categories", :schema "test-data", :description nil}
                {:name "reviews", :schema "test-data", :description nil}
                {:name "orders", :schema "test-data", :description nil}
                {:name "products", :schema "test-data", :description nil}}}
             (driver/describe-database :databricks (mt/db)))))
    (testing "`driver/describe-database` returns expected results for `all` schema filters."
      (let [actual-tables (driver/describe-database :databricks (-> (mt/db)
                                                                    (update :details dissoc :schema-filters-patterns)
                                                                    (update :details assoc  :schema-filters-type "all")))]
        (testing "tables from multiple schemas were found"
          (is (contains? (:tables actual-tables) {:name "venues", :schema "test-data", :description nil}))
          (is (contains? (:tables actual-tables) {:name "checkins", :schema "test-data", :description nil}))
          (is (contains? (:tables actual-tables) {:name "airport", :schema "airports", :description nil}))
          (is (contains? (:tables actual-tables) {:name "bird", :schema "bird-flocks", :description nil})))
        (testing "information_schema is excluded"
          (is (empty? (filter #(= "information_schema" (:schema %)) (:tables actual-tables)))))))
    (testing "`driver/describe-database` returns expected results for `exclusion` schema filters."
      (let [actual-tables (driver/describe-database :databricks (update (mt/db) :details assoc
                                                                        :schema-filters-patterns "test-data"
                                                                        :schema-filters-type "exclusion"))]
        (testing "tables from multiple schemas were found"
          (is (not (contains? (:tables actual-tables) {:name "venues", :schema "test-data", :description nil})))
          (is (not (contains? (:tables actual-tables) {:name "checkins", :schema "test-data", :description nil})))
          (is (contains? (:tables actual-tables) {:name "airport", :schema "airports", :description nil}))
          (is (contains? (:tables actual-tables) {:name "bird", :schema "bird-flocks", :description nil})))))))

(deftest ^:parallel describe-fields-test
  (mt/test-driver
    :databricks
    (let [fields (vec (driver/describe-fields :databricks (mt/db) {:schema-names ["test-data"]
                                                                   :table-names ["orders"]}))]
      (testing "Underlying query returns only fields from selected catalog"
        (is (= 9 (count fields))))
      (testing "Expected fields are returned"
        (is (= #{{:table-schema "test-data"
                  :table-name "orders"
                  :pk? true
                  :name "id"
                  :database-type "int"
                  :database-position 0
                  :base-type :type/Integer
                  :json-unfolding false}
                 {:table-schema "test-data"
                  :table-name "orders"
                  :pk? false
                  :name "user_id"
                  :database-type "int"
                  :database-position 1
                  :base-type :type/Integer
                  :json-unfolding false}
                 {:table-schema "test-data"
                  :table-name "orders"
                  :pk? false
                  :name "product_id"
                  :database-type "int"
                  :database-position 2
                  :base-type :type/Integer
                  :json-unfolding false}
                 {:table-schema "test-data"
                  :table-name "orders"
                  :pk? false
                  :name "subtotal"
                  :database-type "double"
                  :database-position 3
                  :base-type :type/Float
                  :json-unfolding false}
                 {:table-schema "test-data"
                  :table-name "orders"
                  :pk? false
                  :name "tax"
                  :database-type "double"
                  :database-position 4
                  :base-type :type/Float
                  :json-unfolding false}
                 {:table-schema "test-data"
                  :table-name "orders"
                  :pk? false
                  :name "total"
                  :database-type "double"
                  :database-position 5
                  :base-type :type/Float
                  :json-unfolding false}
                 {:table-schema "test-data"
                  :table-name "orders"
                  :pk? false
                  :name "discount"
                  :database-type "double"
                  :database-position 6
                  :base-type :type/Float
                  :json-unfolding false}
                 {:table-schema "test-data"
                  :table-name "orders"
                  :pk? false
                  :name "created_at"
                  :database-type "timestamp"
                  :database-position 7
                  :base-type :type/DateTimeWithLocalTZ
                  :json-unfolding false}
                 {:table-schema "test-data"
                  :table-name "orders"
                  :pk? false
                  :name "quantity"
                  :database-type "int"
                  :database-position 8
                  :base-type :type/Integer
                  :json-unfolding false}}
               (set fields)))))))

(deftest ^:parallel describe-fks-test
  (mt/test-driver
    :databricks
    (let [fks (vec (driver/describe-fks :databricks (mt/db) {:schema-names ["test-data"]
                                                             :table-names ["orders"]}))]
      (testing "Only fks from current catalog are registered"
        (is (= 2 (count fks))))
      (testing "Expected fks are returned"
        (is (= #{{:fk-table-schema "test-data"
                  :fk-table-name "orders"
                  :fk-column-name "product_id"
                  :pk-table-schema "test-data"
                  :pk-table-name "products"
                  :pk-column-name "id"}
                 {:fk-table-schema "test-data"
                  :fk-table-name "orders"
                  :fk-column-name "user_id"
                  :pk-table-schema "test-data"
                  :pk-table-name "people"
                  :pk-column-name "id"}}
               (set fks)))))))

(mt/defdataset dataset-with-ntz
  [["table_with_ntz" [{:field-name "timestamp"
                       :base-type {:native "timestamp_ntz"}}]
    [[(t/local-date-time 2024 10 20 10 20 30)]]]])

(deftest timestamp-ntz-ignored-test
  (mt/test-driver
    :databricks
    (mt/dataset
      dataset-with-ntz
      (testing "timestamp column was ignored during sync"
        (let [columns (t2/select :model/Field :table_id (t2/select-one-fn :id :model/Table :db_id (mt/id)))]
          (is (= 1 (count columns)))
          (is (= "id" (:name (first columns)))))))))

(deftest ^:parallel db-default-timezone-test
  (mt/test-driver
    :databricks
    (testing "`test-data` timezone is `Etc/UTC`"
      (is (= "Etc/UTC" (:timezone (mt/db)))))))

(deftest ^:synchronized date-time->results-local-date-time-test
  (mt/test-driver
    :databricks
    (mt/with-metadata-provider (mt/id)
      (mt/with-results-timezone-id "America/Los_Angeles"
        (let [expected (t/local-date-time 2024 8 29 10 20 30)]
          (testing "LocalDateTime is not modified"
            (is (= expected
                   (#'databricks/date-time->results-local-date-time (t/local-date-time 2024 8 29 10 20 30)))))
          (testing "OffsetDateTime is shifted by results timezone"
            (is (= expected
                   (#'databricks/date-time->results-local-date-time (t/offset-date-time 2024 8 29 17 20 30)))))
          (testing "ZonedDateTime is shifted by results timezone"
            (is (= expected
                   (#'databricks/date-time->results-local-date-time (t/zoned-date-time 2024 8 29 17 20 30))))))))))

(deftest ^:synchronized timezone-in-set-and-read-functions-test
  (mt/test-driver
    :databricks
    ;;
    ;; `created_at` value that is filtered for is 2017-04-18T16:53:37.046Z. That corresponds to filters used in query
    ;; considering the report timezone.
    ;;
    ;; This test ensures that `set-parameter` and `read-column-thunk` datetime implementations work correctly, including
    ;; helpers as `date-time->results-local-date-time`.
    ;;
    ;; This functionality is also exercised in general timezone tests, but it is good to be explicit about it here,
    ;; as the driver has specific implementation of those methods, dealing with the fact (1) that even values that should
    ;; have some timezone info are returned using java.sql.Types/TIMESTAMP (ie. no timezone) and (2) only LocalDateTime
    ;; can be used as parameter (ie. no _Offset_ or _Zoned_).
    ;;
    (mt/with-metadata-provider (mt/id)
      (mt/with-report-timezone-id! "America/Los_Angeles"
        (testing "local-date-time"
          (let [rows (-> (mt/run-mbql-query
                           people
                           {:filter [:and
                                     [:>= $created_at (t/local-date-time 2017 4 18 9 0 0)]
                                     [:< $created_at (t/local-date-time 2017 4 18 10 0 0)]]})
                         mt/rows)]
            (testing "Baseline: only one row is returned"
              (is (= 1 (count rows))))
            (testing "`created_at` column has expected value"
              (is (= "2017-04-18T09:53:37.046-07:00"
                     (last (first rows)))))))
        (testing "offset-date-time"
          (let [rows (-> (mt/run-mbql-query
                           people
                           {:filter [:and
                                     [:>= $created_at (t/offset-date-time 2017 4 18 9 0 0 0 (t/zone-offset "-07:00"))]
                                     [:< $created_at (t/offset-date-time 2017 4 18 10 0 0 0 (t/zone-offset "-07:00"))]]})
                         mt/rows)]
            (testing "Baseline: only one row is returned"
              (is (= 1 (count rows))))
            (testing "`created_at` column has expected value"
              (is (= "2017-04-18T09:53:37.046-07:00"
                     (last (first rows)))))))
        (testing "zoned-date-time"
          (let [rows (-> (mt/run-mbql-query
                           people
                           {:filter [:and
                                     [:>= $created_at (t/zoned-date-time 2017 4 18 9 0 0 0 (t/zone-id "America/Los_Angeles"))]
                                     [:< $created_at (t/zoned-date-time 2017 4 18 10 0 0 0 (t/zone-id "America/Los_Angeles"))]]})
                         mt/rows)]
            (testing "Baseline: only one row is returned"
              (is (= 1 (count rows))))
            (testing "`created_at` column has expected value"
              (is (= "2017-04-18T09:53:37.046-07:00"
                     (last (first rows)))))))))))

(deftest additional-options-test
  (mt/test-driver
    :databricks
    (testing "Connections with UserAgentEntry"
      (sql-jdbc.conn/with-connection-spec-for-testing-connection
       [spec [:databricks (:details (mt/db))]]
        (is (= [{:a 1}] (jdbc/query spec ["select 1 as a"]))))
      (with-redefs [config/mb-version-info {:tag "invalid agent"}]
        (sql-jdbc.conn/with-connection-spec-for-testing-connection
         [spec [:databricks (:details (mt/db))]]
          (is (thrown-with-msg?
               Exception
               #"Incorrect format for User-Agent entry"
               (jdbc/query spec ["select 1 as a"]))))))
    (testing "Additional options are added to :subname key of generated spec"
      (is (re-find #";IgnoreTransactions=0$"
                   (->> {:http-path "p/a/t/h",
                         :schema-filters-type "inclusion",
                         :schema-filters-patterns "xix",
                         :access-token "xixix",
                         :host "localhost",
                         :engine "databricks",
                         :catalog "ccc"
                         :additional-options ";IgnoreTransactions=0"}
                        (sql-jdbc.conn/connection-details->spec :databricks)
                        :subname))))
    (testing "Leading semicolon is added when missing"
      (is (re-find #";IgnoreTransactions=0;bla=1$"
                   (->> {:http-path "p/a/t/h",
                         :schema-filters-type "inclusion",
                         :schema-filters-patterns "xix",
                         :access-token "xixix",
                         :host "localhost",
                         :engine "databricks",
                         :catalog "ccc"
                         :additional-options "IgnoreTransactions=0;bla=1"}
                        (sql-jdbc.conn/connection-details->spec :databricks)
                        :subname))))))

(deftest can-connect-test
  (mt/test-driver
    :databricks
    (testing "Can connect returns true for catalog that is present on the instance"
      (is (true? (driver/can-connect? :databricks (:details (mt/db))))))
    (testing "Can connect returns false for catalog that is NOT present on the instance (#49444)"
      (is (false? (driver/can-connect? :databricks (assoc (:details (mt/db)) :catalog "xixixix")))))))

(deftest can-connect-using-m2m-test
  (mt/test-driver
    :databricks
    (testing "Can connect using m2m (#51276)"
      (is (true? (driver/can-connect?
                  :databricks
                  (-> (:details (mt/db))
                      (dissoc :token)
                      (assoc :use-m2m      true
                             :client-id    (tx/db-test-env-var-or-throw :databricks :client-id)
                             :oauth-secret (tx/db-test-env-var-or-throw :databricks :oauth-secret)))))))))
