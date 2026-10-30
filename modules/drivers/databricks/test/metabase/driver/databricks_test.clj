(ns ^:mb/driver-tests metabase.driver.databricks-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.driver.databricks-test]}
                                                            metabase.test.data/run-mbql-query {:namespaces [metabase.driver.databricks-test]}}}}}}
  (:require
   [clj-http.client :as http]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.databricks :as databricks]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.test :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *multi-level?* false)

;; certain tests need to be run twice; once with the multi-level schema and once without.
(defmacro with-and-without-multi-level [& body]
  ;; run it once without multi-level and once with multi-level
  `(do ~@body
       (binding [*multi-level?* true]
         (testing "with multi-level schema"
           ~@body))))

(defn- maybe-qualify-schema [schema]
  (if *multi-level?*
    (str (get-in (mt/db) [:details :catalog]) "." schema)
    schema))

(defn db []
  (if *multi-level?*
    (-> (mt/db)
        (update-in [:details :schema-filters-patterns]
                   #(str "metabase_ci." %))
        (assoc-in [:details :multi-level-schema] true))
    (mt/db)))

;; Because the datasets that are tested are preloaded, it is fine just to modify the database details to sync other schemas.
(deftest ^:parallel sync-test
  (with-and-without-multi-level
    (mt/test-driver :databricks
      (testing "`driver/describe-database` implementation returns expected results for inclusion of test-data schema."
        (is (= #{{:name "venues", :schema (maybe-qualify-schema "test-data"), :description nil}
                 {:name "checkins", :schema (maybe-qualify-schema "test-data"), :description nil}
                 {:name "users", :schema (maybe-qualify-schema "test-data"), :description nil}
                 {:name "people", :schema (maybe-qualify-schema "test-data"), :description nil}
                 {:name "categories", :schema (maybe-qualify-schema "test-data"), :description nil}
                 {:name "reviews", :schema (maybe-qualify-schema "test-data"), :description nil}
                 {:name "orders", :schema (maybe-qualify-schema "test-data"), :description nil}
                 {:name "products", :schema (maybe-qualify-schema "test-data"), :description nil}}
               (into #{} (:tables (driver/describe-database :databricks (driver.u/ensure-lib-database (db))))))))
      (testing "`driver/describe-database` returns expected results for `all` schema filters."
        (let [actual-tables (update (driver/describe-database :databricks (driver.u/ensure-lib-database (-> (db)
                                                                                                            (update :details dissoc :schema-filters-patterns)
                                                                                                            (update :details assoc :schema-filters-type "all"))))
                                    ;; `:tables` is a reducible (streamed); realize it for the set ops below
                                    :tables #(into #{} %))]
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
        (let [actual-tables (update (driver/describe-database :databricks (driver.u/ensure-lib-database (update (db) :details assoc
                                                                                                                :schema-filters-patterns (maybe-qualify-schema "test-data")
                                                                                                                :schema-filters-type "exclusion")))
                                    ;; `:tables` is a reducible (streamed); realize it for the set ops below
                                    :tables #(into #{} %))]
          (testing "tables from multiple schemas were found"
            (is (not (contains? (set (map :schema (:tables actual-tables))) (maybe-qualify-schema "test-data"))))
            (is (contains? (:tables actual-tables) {:name "airport", :schema (maybe-qualify-schema "airports"), :description nil}))
            (is (contains? (:tables actual-tables) {:name "bird", :schema (maybe-qualify-schema "bird-flocks"), :description nil}))))))))

(deftest ^:parallel describe-fields-test
  (with-and-without-multi-level
    (mt/test-driver :databricks
      (let [fields (vec (driver/describe-fields :databricks (driver.u/ensure-lib-database (db)) {:schema-names [(maybe-qualify-schema "test-data")]
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
                 (set fields))))))))

(deftest ^:parallel describe-fks-test
  (with-and-without-multi-level
    (mt/test-driver :databricks
      (let [fks (driver/describe-fks :databricks
                                     (driver.u/ensure-lib-database (assoc (lib.metadata/database (mt/metadata-provider))
                                                                          :details (:details (db))))
                                     {:schema-names [(maybe-qualify-schema "test-data")]
                                      :table-names ["orders"]})]
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
                 (set fks))))))))

(deftest ^:parallel multi-level-schema-filter-sql-test
  (testing "multi-catalog sync filters on catalog and schema with equalities, not a row-constructor IN (GHY-4263)"
    (testing "Databricks' planner is ~200x slower on `(catalog, schema) IN ((?, ?))` than on AND-ed equalities"
      (doseq [[label sql+params] {"describe-fields"
                                  (sql-jdbc.sync/describe-fields-sql
                                   :databricks
                                   :schema-names ["mycatalog.myschema"]
                                   :details {:catalog "mycatalog" :multi-level-schema true})

                                  "describe-fks"
                                  (sql-jdbc.sync/describe-fks-sql
                                   :databricks
                                   :schema-names ["mycatalog.myschema"]
                                   :details {:catalog "mycatalog" :multi-level-schema true})}]
        (testing label
          (let [[sql & params] sql+params]
            (is (not (str/includes? sql "IN ((?, ?)")))
            (is (str/includes? sql "`table_catalog` = ?"))
            (is (str/includes? sql "`table_schema` = ?"))
            (is (= ["mycatalog" "myschema"] (vec (take-last 2 params)))))))))
  (testing "several catalog.schema pairs are OR-ed pairwise"
    (let [[sql & params] (sql-jdbc.sync/describe-fields-sql
                          :databricks
                          :schema-names ["c1.s1" "c2.s2"]
                          :details {:catalog "c1" :multi-level-schema true})]
      (is (not (str/includes? sql "IN ((?, ?)")))
      (is (= ["c1" "s1" "c2" "s2"] params))))
  (testing "single-catalog connections keep the plain schema IN"
    (let [[sql & params] (sql-jdbc.sync/describe-fields-sql
                          :databricks
                          :schema-names ["s1" "s2"]
                          :details {:catalog "c1" :multi-level-schema false})]
      (is (str/includes? sql "`table_schema` IN (?, ?)"))
      (is (= ["c1" "s1" "s2"] params)))))

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
                        :subname))))
    (testing "Thrift client can be selected"
      (let [details {:host "localhost",
                     :engine "databricks",
                     :catalog "ccc"
                     :additional-options "UseThriftClient=1"}
            details2 (dissoc details :additional-options)]
        (is (= 1 (:UseThriftClient (sql-jdbc.conn/connection-details->spec :databricks
                                                                           details))))
        (is (= 0 (:UseThriftClient (sql-jdbc.conn/connection-details->spec :databricks
                                                                           details2))))))))

(deftest multi-level-schema-test
  (mt/test-driver :databricks
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
        (mt/with-db db
          (testing "With multi-level-schema default (off)"
            (sync/sync-database! (mt/id))
            (is (= #{"test-data"} (t2/select-fn-set :schema :model/Table :db_id (mt/id) :active true)))
            (is (= 52 (count (t2/select
                              :model/Field
                              :table_id [:in (t2/select-fn-set :id :model/Table :db_id (mt/id) :active true)]
                              :active true))))
            (is (= 1 (count (mt/rows (mt/run-mbql-query venues {:limit 1})))))))
        (testing "With multi-level-schema on"
          (t2/update! :model/Database :id db-id {:details (assoc details
                                                                 :multi-level-schema true
                                                                 :schema-filters-patterns multi-pattern)})
          (mt/with-db
            (t2/select-one :model/Database :id db-id)
            (sync/sync-database! (mt/id))
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
          (t2/update! :model/Database :id db-id {:details (assoc details :multi-level-schema false)})
          (mt/with-db
            (t2/select-one :model/Database :id db-id)
            (sync/sync-database! (mt/id))
            (is (= #{"test-data"} (t2/select-fn-set :schema :model/Table :db_id (mt/id) :active true)))
            (is (= 52 (count (t2/select
                              :model/Field
                              :table_id [:in (t2/select-fn-set :id :model/Table :db_id (mt/id) :active true)]
                              :active true))))
            (is (= 1 (count (mt/rows (mt/run-mbql-query venues {:limit 1})))))))))))

(deftest multi-level-changes-inactive-table-schemas-too
  (mt/test-driver :databricks
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
        (mt/with-db db
          (testing "With multi-level-schema default (off)"
            (sync/sync-database! (mt/id))
            ;; originally we have unqualified schemas, only in one catalog
            (is (= #{"test-data"}
                   (t2/select-fn-set :schema :model/Table :db_id (mt/id))))))
        (testing "With multi-level-schema on, schemas are qualified"
          (t2/update! :model/Database :id db-id {:details (assoc details
                                                                 :multi-level-schema true
                                                                 :schema-filters-patterns multi-pattern)})
          ;; Deactivate its tables for testing
          (t2/update! :model/Table {:db_id db-id} {:active false})
          (mt/with-db
            (t2/select-one :model/Database :id db-id)
            (sync/sync-database! (mt/id))
            (is (= #{(format "%s.%s" (:catalog details) "test-data")
                     (format "%s.%s" multicatalog multicatalog-schema)}
                   ;; active` *and* inactive tables both have their schemas changed.
                   (t2/select-fn-set :schema :model/Table :db_id (mt/id))))))))))

(deftest multi-level-schema-wanted-catalogs-test
  (mt/test-driver :databricks
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
          (t2/select-one :model/Database :id db-id)
          (sync/sync-database! (mt/id) {:scan :schema})
          (let [table-schemas (t2/select-fn-set :schema :model/Table :db_id (mt/id) :active true)]
            (is (= schema-filters table-schemas))
            (is (nil? (some #(str/starts-with? % "__databricks") table-schemas)))))))))

(deftest multi-catalog-joins
  (mt/test-driver :databricks
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
          (sync/sync-database! (mt/id) {:scan :schema})
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
                   (mt/rows (qp/process-query manual-query))))))))))

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
      (is (false? (driver/can-connect? :databricks (assoc (:details (mt/db)) :catalog "xixixix")))))
    (testing "Disallows unsafe connection parameters"
      (let [details (assoc (:details (mt/db)) :additional-options "VolumeOperationAllowedLocalPaths=/etc/hosts")]
        (is (thrown-with-msg? Exception #"Potentially dangerous keys"
                              (driver/can-connect? :databricks details)))
        (is (thrown-with-msg? Exception #"Potentially dangerous keys"
                              (driver/can-connect? :databricks (update details
                                                                       :additional-options
                                                                       u/lower-case-en))))
        (is (thrown-with-msg? Exception #"Potentially dangerous keys"
                              (driver/validate-db-details! :databricks details)))))))

(deftest ^:parallel staging-allowed-local-paths-is-rejected-test
  (testing "the legacy spelling of `VolumeOperationAllowedLocalPaths` enables the same local file reads and writes"
    (doseq [opts ["StagingAllowedLocalPaths=/"
                  "stagingallowedlocalpaths=/tmp"
                  "UseNativeQuery=1;StagingAllowedLocalPaths=/etc"]]
      (testing opts
        (is (thrown-with-msg? Exception #"Potentially dangerous keys"
                              (driver/validate-db-details! :databricks {:additional-options opts})))))))

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

(def ^:private wif-base-details
  {:host "x.cloud.databricks.com"
   :http-path "/sql/1.0/warehouses/abc"
   :catalog "main"
   :auth-mode "wif"})

(deftest ^:parallel connection-details->spec-wif-inline-token-test
  (testing "WIF with an inline pasted JWT sets Auth_AccessToken via pass-through (AuthMech=11, Auth_Flow=0)"
    (let [spec (sql-jdbc.conn/connection-details->spec
                :databricks
                (assoc wif-base-details :wif-token "eyJhbGciOi.the-jwt.sig"))]
      (is (= 11 (:AuthMech spec)))
      (is (= 0 (:Auth_Flow spec)))
      (is (= "eyJhbGciOi.the-jwt.sig" (:Auth_AccessToken spec)))
      (testing "no PAT or M2M credentials leak into the spec"
        (is (not (contains? spec :uid)))
        (is (not (contains? spec :pwd)))
        (is (not (contains? spec :OAuth2ClientId)))
        (is (not (contains? spec :OAuth2Secret)))))))

(deftest connection-details->spec-wif-file-path-wins-test
  (testing "file path wins over inline token; trailing newline is stripped"
    (mt/with-temp-file [tok-path "wif-token"]
      (spit tok-path "from-file\n")
      (mt/with-temp-env-var-value! [mb-readable-paths (.getParent (java.io.File. ^String tok-path))]
        (let [spec (sql-jdbc.conn/connection-details->spec
                    :databricks
                    (assoc wif-base-details
                           :wif-token           "from-inline"
                           :wif-token-file-path tok-path))]
          (is (= "from-file" (:Auth_AccessToken spec))))))))

(deftest connection-details->spec-wif-readable-paths-test
  (testing "the token file is read only from a directory `readable-paths` allows"
    (mt/with-temp-file [tok-path "wif-token"]
      (spit tok-path "from-file")
      (let [spec (fn [] (sql-jdbc.conn/connection-details->spec
                         :databricks
                         (assoc wif-base-details :wif-token-file-path tok-path)))]
        (mt/with-temp-env-var-value! [mb-readable-paths "NONE"]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Reading from path is disallowed" (spec))))
        (mt/with-temp-env-var-value! [mb-readable-paths (.getParent (java.io.File. ^String tok-path))]
          (is (= "from-file" (:Auth_AccessToken (spec)))))))))

(defn- fake-jwt
  "A parseable (but not verifiable) JWT with `claims` as the payload."
  [claims]
  (let [encoder (java.util.Base64/getUrlEncoder)
        encode  (fn [m] (String. (.encode encoder (.getBytes (json/encode m) "UTF-8")) "UTF-8"))]
    (str (encode {:alg "none"}) "." (encode claims) ".sig")))

(deftest ^:parallel connection-details->spec-wif-exp-sets-password-expiry-test
  (testing "when the WIF token carries `exp`, the spec gets :password-expiry-timestamp for pool auto-invalidation"
    (let [spec (sql-jdbc.conn/connection-details->spec
                :databricks
                (assoc wif-base-details :wif-token (fake-jwt {:exp 1700000000 :sub "s"})))]
      (is (= 1700000000000 (:password-expiry-timestamp spec)))))
  (testing "no `exp` claim → no :password-expiry-timestamp on the spec"
    (let [spec (sql-jdbc.conn/connection-details->spec
                :databricks
                (assoc wif-base-details :wif-token (fake-jwt {:sub "s"})))]
      (is (not (contains? spec :password-expiry-timestamp))))))

(deftest ^:parallel normalize-db-details-test
  (testing "legacy :use-m2m true (no :auth-mode) → :auth-mode \"m2m\" injected"
    (is (= {:details {:use-m2m true :client-id "cid" :oauth-secret "osec" :auth-mode "m2m"}}
           (driver/normalize-db-details
            :databricks
            {:details {:use-m2m true :client-id "cid" :oauth-secret "osec"}}))))
  (testing "legacy :use-m2m false (no :auth-mode) → :auth-mode \"pat\" injected"
    (is (= {:details {:use-m2m false :token "dapi" :auth-mode "pat"}}
           (driver/normalize-db-details
            :databricks
            {:details {:use-m2m false :token "dapi"}}))))
  (testing "explicit :auth-mode is preserved"
    (is (= {:details {:use-m2m true :auth-mode "wif" :wif-token "jwt"}}
           (driver/normalize-db-details
            :databricks
            {:details {:use-m2m true :auth-mode "wif" :wif-token "jwt"}}))))
  (testing ":write_data_details is normalized the same way as :details"
    (is (= {:details {:use-m2m true :auth-mode "m2m"}
            :write_data_details {:use-m2m false :auth-mode "pat"}}
           (driver/normalize-db-details
            :databricks
            {:details {:use-m2m true}
             :write_data_details {:use-m2m false}}))))
  (testing "database without :details is returned unchanged"
    (is (= {:engine :databricks}
           (driver/normalize-db-details :databricks {:engine :databricks})))))

(deftest ^:parallel db-details-to-test-and-migrate-test
  (testing "returns a single candidate with :auth-mode injected from :use-m2m"
    (is (= [{:use-m2m true :client-id "cid" :oauth-secret "osec" :auth-mode "m2m"}]
           (driver/db-details-to-test-and-migrate
            :databricks
            {:use-m2m true :client-id "cid" :oauth-secret "osec"})))
    (is (= [{:use-m2m false :token "dapi" :auth-mode "pat"}]
           (driver/db-details-to-test-and-migrate
            :databricks
            {:use-m2m false :token "dapi"}))))
  (testing "returns nil when :auth-mode is already present (nothing to migrate)"
    (is (nil? (driver/db-details-to-test-and-migrate
               :databricks
               {:auth-mode "wif" :wif-token "jwt"})))))

(deftest ^:parallel connection-details->spec-backward-compat-use-m2m-test
  (testing "legacy :use-m2m true produces an M2M OAuth spec"
    (let [spec (sql-jdbc.conn/connection-details->spec
                :databricks
                {:host "x.cloud.databricks.com"
                 :http-path "/sql/1.0/warehouses/abc"
                 :catalog "main"
                 :use-m2m true
                 :client-id "cid"
                 :oauth-secret "osec"})]
      (is (= 11 (:AuthMech spec)))
      (is (= 1 (:Auth_Flow spec)))
      (is (= "cid" (:OAuth2ClientId spec)))
      (is (= "osec" (:OAuth2Secret spec)))))
  (testing "legacy :use-m2m false produces a PAT spec"
    (let [spec (sql-jdbc.conn/connection-details->spec
                :databricks
                {:host "x.cloud.databricks.com"
                 :http-path "/sql/1.0/warehouses/abc"
                 :catalog "main"
                 :use-m2m false
                 :token "dapiXXXX"})]
      (is (= 3 (:AuthMech spec)))
      (is (= "token" (:uid spec)))
      (is (= "dapiXXXX" (:pwd spec)))))
  (testing "explicit :auth-mode wins over :use-m2m"
    (let [spec (sql-jdbc.conn/connection-details->spec
                :databricks
                (assoc wif-base-details
                       :use-m2m    true
                       :client-id  "cid"
                       :wif-token  "eyJhbGciOi.jwt.sig"))]
      (is (= 11 (:AuthMech spec)))
      (is (= 0 (:Auth_Flow spec)) "WIF pass-through flow, not M2M")
      (is (= "eyJhbGciOi.jwt.sig" (:Auth_AccessToken spec))))))

(defn- mint-github-actions-oidc-token
  "Returns a JWT for `audience` from the GitHub Actions OIDC endpoint, or nil when not running
  under a GH Actions job with `id-token: write`."
  [audience]
  (let [req-token (System/getenv "ACTIONS_ID_TOKEN_REQUEST_TOKEN")
        req-url   (System/getenv "ACTIONS_ID_TOKEN_REQUEST_URL")]
    (when (and (not (str/blank? req-token)) (not (str/blank? req-url)))
      (let [{:keys [status body]} (http/get (str req-url "&audience=" audience) ; naive, but expected to work
                                            {:headers          {"Authorization" (str "Bearer " req-token)}
                                             :throw-exceptions false})]
        (when (= 200 status)
          (:value (json/decode+kw body)))))))

(defn- wif-user-or-skip
  "Returns the WIF service principal's Application ID (what `current_user()` returns for an SP
  session), or nil to signal skip. Fails loudly when `MB_DATABRICKS_TEST_WIF_USER` is unset; set
  to 'skip' to opt out explicitly (REPL, forks without a configured federation policy)."
  []
  (let [u (tx/db-test-env-var :databricks :wif-user)]
    (cond
      (= "skip" u)   nil
      (str/blank? u) (do (is false
                             (str "MB_DATABRICKS_TEST_WIF_USER isn't set. Set it to the Databricks "
                                  "WIF service principal's Application ID (UUID), or to 'skip' to "
                                  "opt out."))
                         nil)
      :else          u)))

(defn- wif-live-details-with-token
  "WIF details for the live tests, `token-source` merged in (`:wif-token` or `:wif-token-file-path`)."
  [token-source]
  (merge {:host          (tx/db-test-env-var-or-throw :databricks :host)
          :http-path     (tx/db-test-env-var-or-throw :databricks :http-path)
          :catalog       (tx/db-test-env-var-or-throw :databricks :catalog)
          :auth-mode     "wif"
          :wif-client-id (tx/db-test-env-var-or-throw :databricks :wif-user)}
         token-source))

(deftest ^:synchronized databricks-wif-live-test
  ;; End-to-end against a real Databricks workspace with a federation policy trusting GH Actions.
  ;; In CI (be-tests-databricks-ee with environment: ci) we mint a fresh OIDC token here — GH tokens
  ;; last ~15 min and the full suite can exceed that, so a token minted at job start would be stale.
  ;; Locally, MB_DATABRICKS_TEST_WIF_TOKEN_FILE can point to a JWT on disk as a fallback.
  (mt/test-driver
    :databricks
    (when-let [wif-user (wif-user-or-skip)]
      (let [audience (tx/db-test-env-var-or-throw :databricks :wif-audience)]
        (when-let [token (or (mint-github-actions-oidc-token audience)
                             (some-> (tx/db-test-env-var :databricks :wif-token-file)
                                     slurp
                                     str/trim))]
          (testing "token claims match the federation policy"
            (is (= {:iss        "https://token.actions.githubusercontent.com"
                    :aud        audience
                    :repository "metabase/metabase"}
                   (select-keys (driver.u/jwt-claims token) [:iss :aud :repository]))))
          (let [details (wif-live-details-with-token {:wif-token token})]
            (testing "can-connect? via WIF"
              (is (true? (driver/can-connect? :databricks details))))
            (testing "session identifies as the WIF service principal"
              (let [spec (sql-jdbc.conn/connection-details->spec :databricks details)
                    rows (jdbc/query spec ["SELECT current_user() AS user"])]
                (is (= [{:user wif-user}] rows))))))))))

(deftest ^:parallel mulit-line-comment-test
  (mt/test-driver :databricks
    (testing "queries with multi line block comments work (#68667)"
      (is (= [[1]]
             (->> "/*\n*/\nselect 1;"
                  (lib/native-query (mt/metadata-provider))
                  (qp/process-query)
                  (mt/rows)))))))

(deftest url-valued-connection-parameters-honor-network-policy-test
  ;; the client fetches tokens and discovery documents from these, or routes through them, so a value naming an
  ;; internal host has to be refused like the workspace host itself would be
  (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "external-only"]
    (let [details {:host "adb-1.azuredatabricks.net" :http-path "/sql/1.0/warehouses/x" :catalog "c" :token "t"}]
      (doseq [opts ["OAuthDiscoveryURL=http://localhost/.well-known/openid-configuration"
                    "OIDCDiscoveryEndpoint=http://localhost/.well-known/openid-configuration"
                    "OAuth2AuthorizationEndPoint=http://localhost/authorize"
                    "OAuth2TokenEndpoint=http://localhost/token"
                    "OAuth2ConnAuthAuthorizeEndpoint=http://localhost/authorize"
                    "OAuth2ConnAuthTokenEndpoint=http://localhost/token"
                    "UseCFProxy=1;CFProxyHost=localhost;CFProxyPort=3128"
                    "UseProxy=1;ProxyHost=localhost;ProxyPort=3128"]]
        (is (=? {:status-code 400}
                (try (driver.u/validate-connection-hosts! :databricks (assoc details :additional-options opts))
                     nil
                     (catch clojure.lang.ExceptionInfo e (ex-data e))))
            (str "should be refused: " opts))))))

(deftest ^:parallel url-building-details-reject-separators-test
  (doseq [details [{:host      "abc.cloud.databricks.com:443/;b"
                    :http-path "/sql/1.0/warehouses/x"
                    :catalog   "main"
                    :token     "t"}
                   {:host      "abc.cloud.databricks.com"
                    :http-path "/sql/1.0/warehouses/x"
                    :catalog   "main;b"
                    :token     "t"}]]
    (testing (pr-str details)
      (is (=? {:status-code 400}
              (try (driver.u/validate-connection-parameters! :databricks details)
                   nil
                   (catch clojure.lang.ExceptionInfo e
                     (ex-data e))))))))
