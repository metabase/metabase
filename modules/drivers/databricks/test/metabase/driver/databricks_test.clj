(ns ^:mb/driver-tests metabase.driver.databricks-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.databricks :as databricks]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [toucan2.core :as t2]))

(defn- maybe-qualify-schema
  [schema]
  (let [multi-level? (tx/db-test-env-var :databricks :multi-level-schema false)
        catalog (get-in (mt/db) [:details :catalog])]
    (cond->> schema multi-level? (str catalog "."))))

;; Because the datasets that are tested are preloaded, it is fine just to modify the database details to sync other schemas.
(deftest ^:parallel sync-test
  (mt/test-driver
    :databricks
    (testing "`driver/describe-database` implementation returns expected results for inclusion of test-data schema."
      (is (= {:tables
              #{{:name "venues", :schema (maybe-qualify-schema "test-data"), :description nil}
                {:name "checkins", :schema (maybe-qualify-schema "test-data"), :description nil}
                {:name "users", :schema (maybe-qualify-schema "test-data"), :description nil}
                {:name "people", :schema (maybe-qualify-schema "test-data"), :description nil}
                {:name "categories", :schema (maybe-qualify-schema "test-data"), :description nil}
                {:name "reviews", :schema (maybe-qualify-schema "test-data"), :description nil}
                {:name "orders", :schema (maybe-qualify-schema "test-data"), :description nil}
                {:name "products", :schema (maybe-qualify-schema "test-data"), :description nil}}}
             (driver/describe-database :databricks (mt/db)))))
    (testing "`driver/describe-database` returns expected results for `all` schema filters."
      (let [actual-tables (driver/describe-database :databricks (-> (mt/db)
                                                                    (update :details dissoc :schema-filters-patterns)
                                                                    (update :details assoc :schema-filters-type "all")))]
        (testing "tables from multiple schemas were found"
          (are [name schema] (contains? (:tables actual-tables)
                                        {:name name, :schema schema, :description nil})
            "venues" (maybe-qualify-schema "test-data")
            "checkins" (maybe-qualify-schema "test-data")
            "airport" (maybe-qualify-schema "airports")
            "bird" (maybe-qualify-schema "bird-flocks")))
        (testing "information_schema is excluded"
          (is (empty? (filter #(str/includes? "information_schema" (:schema %)) (:tables actual-tables)))))))
    (testing "`driver/describe-database` returns expected results for `exclusion` schema filters."
      (let [actual-tables (driver/describe-database :databricks (update (mt/db) :details assoc
                                                                        :schema-filters-patterns (maybe-qualify-schema "test-data")
                                                                        :schema-filters-type "exclusion"))]
        (testing "tables from multiple schemas were found"
          (is (not (contains? (set (map :schema (:tables actual-tables))) (maybe-qualify-schema "test-data"))))
          (is (contains? (:tables actual-tables) {:name "airport", :schema (maybe-qualify-schema "airports"), :description nil}))
          (is (contains? (:tables actual-tables) {:name "bird", :schema (maybe-qualify-schema "bird-flocks"), :description nil})))))))

(deftest ^:parallel describe-fields-test
  (mt/test-driver
    :databricks
    (let [fields (vec (driver/describe-fields :databricks (mt/db) {:schema-names [(maybe-qualify-schema "test-data")]
                                                                   :table-names ["orders"]}))]
      (testing "Underlying query returns only fields from selected catalog"
        (is (= 9 (count fields))))
      (testing "Expected fields are returned"
        (is (= (into #{}
                     (map #(update % :table-schema maybe-qualify-schema))
                     #{{:table-schema "test-data"
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
                        :json-unfolding false}})
               (set fields)))))))

(deftest ^:parallel describe-fks-test
  (mt/test-driver
    :databricks
    (let [fks (vec (driver/describe-fks :databricks (mt/db) {:schema-names [(maybe-qualify-schema "test-data")]
                                                             :table-names ["orders"]}))]
      (testing "Only fks from current catalog are registered"
        (is (= 2 (count fks))))
      (testing "Expected fks are returned"
        (is (= #{{:fk-table-schema (maybe-qualify-schema "test-data")
                  :fk-table-name "orders"
                  :fk-column-name "product_id"
                  :pk-table-schema (maybe-qualify-schema "test-data")
                  :pk-table-name "products"
                  :pk-column-name "id"}
                 {:fk-table-schema (maybe-qualify-schema "test-data")
                  :fk-table-name "orders"
                  :fk-column-name "user_id"
                  :pk-table-schema (maybe-qualify-schema "test-data")
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
      (testing "timestamp_ntz column is synced with correct types"
        (let [columns (t2/select :model/Field :table_id (t2/select-one-fn :id :model/Table :db_id (mt/id)))
              col-type-info (into {}
                                  (map (fn [col]
                                         [(:name col)
                                          (select-keys col [:base_type :effective_type :database_type])]))
                                  columns)]
          (is (= {"id" {:base_type :type/Integer
                        :effective_type :type/Integer
                        :database_type "int"}
                  "timestamp" {:base_type :type/DateTime
                               :effective_type :type/DateTime
                               :database_type "timestamp_ntz"}}
                 col-type-info)))))))

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

(deftest ^:synchronized additional-options-test
  (mt/test-driver
    :databricks
    (testing "Connections with UserAgentEntry"
      (sql-jdbc.conn/with-connection-spec-for-testing-connection
       [spec [:databricks (:details (mt/db))]]
        (is (= (str "Metabase/" (:tag config/mb-version-info)) (:UserAgentEntry spec)))
        (is (= [{:a 1}] (jdbc/query spec ["select 1 as a"])))))
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

(deftest multi-level-schema-test
  (mt/test-driver
    :databricks
    ;; skip if running in multi-level since we are manipulating it in this test
    (when-not (tx/db-test-env-var :databricks :multi-level-schema false)
      (let [details (get (mt/db) :details)
            ;; metabase_ci_multicatalog.test_schema.test (id, name)
            multicatalog (tx/db-test-env-var :databricks :multicatalog-catalog "metabase_ci_multicatalog")
            multicatalog-schema (tx/db-test-env-var :databricks :multicatalog-schema "test_schema")
            multi-pattern (format "%s.%s,%s.%s"
                                  (:catalog details)
                                  (:schema-filters-patterns details)
                                  multicatalog
                                  multicatalog-schema)]
        (mt/with-temp [:model/Database {db-id :id :as db} {:engine :databricks :details details}]
          (mt/with-db
            db
            (testing "With multi-level-schema default (off)"
              (sync/sync-database! (mt/db))
              (is (= #{"test-data"} (t2/select-fn-set :schema :model/Table :db_id (mt/id) :active true)))
              (is (= 52 (count (t2/select
                                :model/Field
                                :table_id [:in (t2/select-fn-set :id :model/Table :db_id (mt/id) :active true)]
                                :active true))))
              (is (= 1 (count (mt/rows (mt/run-mbql-query venues {:limit 1})))))))
          (testing "With multi-level-schema on"
            (t2/update! :model/Database db-id {:details (assoc details
                                                               :multi-level-schema true
                                                               :schema-filters-patterns multi-pattern)})
            (mt/with-db
              (t2/select-one :model/Database db-id)
              (sync/sync-database! (mt/db))
              (is (= #{(format "%s.%s" (:catalog details) "test-data")
                       (format "%s.%s" multicatalog multicatalog-schema)}
                     (t2/select-fn-set :schema :model/Table :db_id (mt/id) :active true)))
              ;; Adds four fields for metabase_ci_multicatalog.test_schema.test id,name,ci_venue_id,drivers_venue_id
              (is (= 56 (count (t2/select
                                :model/Field
                                :table_id [:in (t2/select-fn-set :id :model/Table :db_id (mt/id) :active true)]
                                :active true))))
              (is (= 1 (count (mt/rows (mt/run-mbql-query venues {:limit 1})))))))
          (testing "With multi-level-schema off"
            (t2/update! :model/Database db-id {:details (assoc details :multi-level-schema false)})
            (mt/with-db
              (t2/select-one :model/Database db-id)
              (sync/sync-database! (mt/db))
              (is (= #{"test-data"} (t2/select-fn-set :schema :model/Table :db_id (mt/id) :active true)))
              (is (= 52 (count (t2/select
                                :model/Field
                                :table_id [:in (t2/select-fn-set :id :model/Table :db_id (mt/id) :active true)]
                                :active true))))
              (is (= 1 (count (mt/rows (mt/run-mbql-query venues {:limit 1}))))))))))))

(deftest multi-level-changes-inactive-table-schemas-too
  (mt/test-driver
    :databricks
    ;; skip if running in multi-level since we are manipulating it in this test
    (when-not (tx/db-test-env-var :databricks :multi-level-schema false)
      (let [details (get (mt/db) :details)
            ;; metabase_ci_multicatalog.test_schema.test (id, name)
            multicatalog (tx/db-test-env-var :databricks :multicatalog-catalog "metabase_ci_multicatalog")
            multicatalog-schema (tx/db-test-env-var :databricks :multicatalog-schema "test_schema")
            multi-pattern (format "%s.%s,%s.%s"
                                  (:catalog details)
                                  (:schema-filters-patterns details)
                                  multicatalog
                                  multicatalog-schema)]
        (mt/with-temp [:model/Database {db-id :id :as db} {:engine :databricks :details details}]
          ;; First sync with multi-level-schema off
          (mt/with-db
            db
            (testing "With multi-level-schema default (off)"
              (sync/sync-database! (mt/db))
              ;; originally we have unqualified schemas, only in one catalog
              (is (= #{"test-data"}
                     (t2/select-fn-set :schema :model/Table :db_id (mt/id))))))
          (testing "With multi-level-schema on, schemas are qualified"
            (t2/update! :model/Database db-id {:details (assoc details
                                                               :multi-level-schema true
                                                               :schema-filters-patterns multi-pattern)})
            ;; Deactivate its tables for testing
            (t2/update! :model/Table {:db_id db-id} {:active false})
            (mt/with-db
              (t2/select-one :model/Database db-id)
              (sync/sync-database! (mt/db))
              (is (= #{(format "%s.%s" (:catalog details) "test-data")
                       (format "%s.%s" multicatalog multicatalog-schema)}
                     ;; active` *and* inactive tables both have their schemas changed.
                     (t2/select-fn-set :schema :model/Table :db_id (mt/id)))))))))))

(deftest multi-level-schema-wanted-catalogs-test
  (mt/test-driver
    :databricks
    ;; skip if running in multi-level since we are manipulating it in this test
    (when-not (tx/db-test-env-var :databricks :multi-level-schema false)
      (let [details (get (mt/db) :details)
            ;; metabase_ci_multicatalog.test_schema.test (id, name)
            multicatalog (tx/db-test-env-var :databricks :multicatalog-catalog "metabase_ci_multicatalog")
            multicatalog-schema (tx/db-test-env-var :databricks :multicatalog-schema "test_schema")
            schema-filters (set [(format "%s.%s" (:catalog details) "test-data")
                                 (format "%s.%s" multicatalog multicatalog-schema)
                                 "system.query"])]
        (mt/with-temp [:model/Database {db-id :id :as _db} {:engine :databricks
                                                            :details (-> details
                                                                         (assoc :multi-level-schema true
                                                                                :schema-filters-type "inclusion"
                                                                                :schema-filters-patterns (str/join ", " schema-filters)))}]
          (mt/with-db
            (t2/select-one :model/Database db-id)
            (sync/sync-database! (mt/db) {:scan :schema})
            (let [table-schemas (t2/select-fn-set :schema :model/Table :db_id (mt/id) :active true)]
              (is (= schema-filters table-schemas))
              (is (nil? (some #(str/starts-with? % "__databricks") table-schemas))))))))))

(deftest multi-catalog-joins
  (mt/test-driver
    :databricks
    ;; skip if running in multi-level since we are manipulating it in this test
    (when-not (tx/db-test-env-var :databricks :multi-level-schema false)
      (let [details (get (mt/db) :details)
            catalog+schema (format "%s.%s"
                                   (:catalog details)
                                   (:schema-filters-patterns details))
            multi-catalog+schema (format "%s.%s"
                                         (tx/db-test-env-var :databricks :multicatalog-catalog "metabase_ci_multicatalog")
                                         (tx/db-test-env-var :databricks :multicatalog-schema "test_schema"))
            ;; metabase_ci_multicatalog.test_schema.test (id, name,ci_venue_id,drivers_venue_id)
            multi-pattern (format "%s,%s" catalog+schema multi-catalog+schema)
            details (assoc details
                           :multi-level-schema true
                           :schema-filters-patterns multi-pattern)]
        (mt/with-temp [:model/Database {db-id :id :as db} {:engine :databricks :details details}]
          (mt/with-db db
            (sync/sync-database! (mt/db) {:scan :schema})
            (let [mp (lib-be/application-database-metadata-provider db-id)
                  [t1-id t2-id] (t2/select-fn-vec
                                 :id
                                 :model/Table
                                 :db_id db-id
                                 [:composite :schema :name]
                                 [:in [[:composite catalog+schema "venues"]
                                       [:composite multi-catalog+schema "test"]]]
                                 {:order-by [:schema]})
                  t1-id-field (m/find-first (comp #(= % "id") :name) (lib.metadata/fields mp t1-id))
                  t2-id-field (m/find-first (comp #(= % "id") :name) (lib.metadata/fields mp t2-id))
                  fk-query (-> (lib/query mp (lib.metadata/table mp t1-id))
                               (lib/join (lib.metadata/table mp t2-id))
                               (lib/filter (lib/= t2-id-field 1))
                               (lib/limit 1))
                  manual-query (-> (lib/query mp (lib.metadata/table mp t1-id))
                                   (lib/join (lib/join-clause (lib.metadata/table mp t2-id)
                                                              [(lib/= t1-id-field (lib/+ t2-id-field 1))]))
                                   (lib/filter (lib/= t2-id-field 1))
                                   (lib/limit 1))]
              (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 1 "toucan" 1 1]]
                     (mt/rows (qp/process-query fk-query))))
              (is (= [[2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1 "toucan" 1 1]]
                     (mt/rows (qp/process-query manual-query)))))))))))

(deftest ^:parallel array-test
  (mt/test-driver :databricks
    (let [query (mt/native-query {:query "select array(1,2,3)"})]
      (is (= [["[1,2,3]"]]
             (mt/rows (qp/process-query query)))))))

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
                      (assoc :use-m2m true
                             :client-id (tx/db-test-env-var-or-throw :databricks :client-id)
                             :oauth-secret (tx/db-test-env-var-or-throw :databricks :oauth-secret)))))))))
