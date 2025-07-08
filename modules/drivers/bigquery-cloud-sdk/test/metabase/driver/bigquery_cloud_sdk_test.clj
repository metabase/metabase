(ns ^:mb/driver-tests metabase.driver.bigquery-cloud-sdk-test
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.store :as qp.store]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.bigquery-cloud-sdk :as bigquery.tx]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.random :as u.random]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2])
  (:import
   (com.google.cloud.bigquery TableResult)))

(set! *warn-on-reflection* true)

(defn ^:private get-test-data-name
  []
  (bigquery.tx/test-dataset-id
   (tx/get-dataset-definition (or data.impl/*dbdef-used-to-create-db*
                                  (tx/default-dataset :bigquery-cloud-sdk)))))

(defn- fmt-table-name
  [table-name]
  (format "%s.%s" (get-test-data-name) table-name))

(defn- drop-table-if-exists!
  [table-name]
  (bigquery.tx/execute! (format "DROP TABLE IF EXISTS `%s`;" (fmt-table-name table-name))))

(defn- drop-mv-if-exists!
  [table-name]
  (bigquery.tx/execute! (format "DROP MATERIALIZED VIEW IF EXISTS `%s`;" (fmt-table-name table-name))))

(deftest sanity-check-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (mt/dataset
      test-data
      (is (seq (mt/rows
                (mt/run-mbql-query orders)))))))

(deftest can-connect?-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [db-details (:details (mt/db))
          fake-proj-id "definitely-not-a-real-project-id-way-no-how"
          fake-dataset-id "definitely-not-a-real-dataset-id-way-no-how"]
      (testing "can-connect? returns true in the happy path"
        (is (true? (driver/can-connect? :bigquery-cloud-sdk db-details))))
      (testing "can-connect? returns false for bogus credentials"
        (is (false? (driver/can-connect? :bigquery-cloud-sdk (assoc db-details :project-id fake-proj-id)))))
      (testing "can-connect? returns true for a valid dataset-id even with no tables"
        (with-redefs [bigquery/describe-database-tables (fn [& _]
                                                          [])]
          (is (true? (driver/can-connect? :bigquery-cloud-sdk db-details)))))
      (testing "can-connect? returns an appropriate exception message if no datasets are found"
        (is (thrown-with-msg? Exception
                              #"Looks like we cannot find any matching datasets."
                              (driver/can-connect? :bigquery-cloud-sdk
                                                   (assoc db-details :dataset-filters-patterns fake-dataset-id))))))))

(deftest table-rows-sample-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "without worrying about pagination"
      (is (= [[1 "Red Medicine"]
              [2 "Stout Burgers & Beers"]
              [3 "The Apple Pan"]
              [4 "Wurstküche"]
              [5 "Brite Spot Family Restaurant"]]
             (->> (table-rows-sample/table-rows-sample (t2/select-one :model/Table :id (mt/id :venues))
                                                       [(t2/select-one :model/Field :id (mt/id :venues :id))
                                                        (t2/select-one :model/Field :id (mt/id :venues :name))]
                                                       (constantly conj))
                  (sort-by first)
                  (take 5)))))

   ;; the initial dataset isn't realized until it's used the first time. because of that,
   ;; we don't care how many pages it took to load this dataset above. it will be a large
   ;; number because we're just tracking the number of times `get-query-results` gets invoked.

    (testing "with pagination"
      (let [pages-retrieved (atom 0)
            page-callback   (fn [] (swap! pages-retrieved inc))]
        (with-bindings {#'bigquery/*page-size*     25
                        #'bigquery/*page-callback* page-callback}
          (let [results (->> (table-rows-sample/table-rows-sample (t2/select-one :model/Table :id (mt/id :venues))
                                                                  [(t2/select-one :model/Field :id (mt/id :venues :id))
                                                                   (t2/select-one :model/Field :id (mt/id :venues :name))]
                                                                  (constantly conj))
                             (sort-by first)
                             (take 5))]
            (is (= [[1 "Red Medicine"]
                    [2 "Stout Burgers & Beers"]
                    [3 "The Apple Pan"]
                    [4 "Wurstküche"]
                    [5 "Brite Spot Family Restaurant"]]
                   (take 5 results)))
            (testing "results are not duplicated when pagination occurs (#45953)"
              (is (= (count results) (count (distinct results)))))
           ;; the `(sort-by)` above will cause the entire resultset to be realized, so
           ;; we want to make sure that it really did retrieve 25 rows per request
           ;; this only works if the timeout has been temporarily set to 0 (see above)

           ;; TODO Temporarily disabling due to flakiness (#33140)
            #_(is (= 4 @pages-retrieved))))))))

;; These look like the macros from metabase.query-processor-test.expressions-test
;; but conform to bigquery naming rules
(defn- calculate-bird-scarcity* [formula filter-clause]
  (mt/formatted-rows
   [2.0]
   (mt/dataset daily-bird-counts
     (mt/run-mbql-query bird-count
       {:expressions {"bird_scarcity" formula}
        :fields      [[:expression "bird_scarcity"]]
        :filter      filter-clause
        :order-by    [[:asc $date]]
        :limit       10}))))

(defmacro ^:private calculate-bird-scarcity [formula & [filter-clause]]
  `(mt/dataset ~'daily-bird-counts
     (mt/$ids ~'bird-count
       (calculate-bird-scarcity* ~formula ~filter-clause))))

(deftest nulls-and-zeroes-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing (str "hey... expressions should work if they are just a Field! (Also, this lets us take a peek at the "
                  "raw values being used to calculate the formulas below, so we can tell at a glance if they're right "
                  "without referring to the EDN def)")
      (is (= [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
             #_:clj-kondo/ignore
             (calculate-bird-scarcity $count))))

    (testing (str "do expressions automatically handle division by zero? Should return `nil` in the results for places "
                  "where that was attempted")
      (is (= [[nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [9.09] [7.14]]
             (calculate-bird-scarcity [:/ 100.0 $count]
                                      [:!= $count nil]))))

    (testing (str "do expressions handle division by `nil`? Should return `nil` in the results for places where that "
                  "was attempted")
      (is (= [[nil] [10.0] [12.5] [20.0] [20.0] [nil] [9.09] [7.14] [12.5] [7.14]]
             (calculate-bird-scarcity [:/ 100.0 $count]
                                      [:or
                                       [:= $count nil]
                                       [:!= $count 0]]))))

    (testing "can we handle BOTH NULLS AND ZEROES AT THE SAME TIME????"
      (is (= [[nil] [nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [nil]]
             (calculate-bird-scarcity [:/ 100.0 $count]))))

    (testing "ok, what if we use multiple args to divide, and more than one is zero?"
      (is (= [[nil] [nil] [nil] [1.0] [1.56] [4.0] [4.0] [nil] [nil] [nil]]
             (calculate-bird-scarcity [:/ 100.0 $count $count]))))

    (testing "are nulls/zeroes still handled appropriately when nested inside other expressions?"
      (is (= [[nil] [nil] [nil] [20.0] [25.0] [40.0] [40.0] [nil] [nil] [nil]]
             (calculate-bird-scarcity [:* [:/ 100.0 $count] 2]))))

    (testing (str "if a zero is present in the NUMERATOR we should return ZERO and not NULL "
                  "(`0 / 10 = 0`; `10 / 0 = NULL`, at least as far as MBQL is concerned)")
      (is (= [[nil] [0.0] [0.0] [1.0] [0.8] [0.5] [0.5] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:/ $count 10]))))

    (testing "can addition handle nulls & zeroes?"
      (is (= [[nil] [10.0] [10.0] [20.0] [18.0] [15.0] [15.0] [nil] [10.0] [10.0]]
             (calculate-bird-scarcity [:+ $count 10]))))

    (testing "can subtraction handle nulls & zeroes?"
      (is (= [[nil] [10.0] [10.0] [0.0] [2.0] [5.0] [5.0] [nil] [10.0] [10.0]]
             (calculate-bird-scarcity [:- 10 $count]))))

    (testing "can multiplications handle nulls & zeros?"
      (is (= [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:* 1 $count]))))))

(deftest db-default-timezone-test
  (mt/test-driver :bigquery-cloud-sdk
    (is (= "UTC"
           (driver/db-default-timezone :bigquery-cloud-sdk (mt/db))))))

(def ^:private numeric-val "-1.2E20")
(def ^:private decimal-val "2.3E16")
(def ^:private bignumeric-val "-7.5E30")
(def ^:private bigdecimal-val "5.2E35")

(defn- bigquery-project-id []
  (-> (tx/db-test-env-var-or-throw :bigquery-cloud-sdk :service-account-json)
      bigquery.common/service-account-json->service-account-credential
      (.getProjectId)))

(deftest reducible-describe-fields-test
  (mt/test-driver :bigquery-cloud-sdk
    (mt/with-temp [:model/Database db
                   {:engine  :bigquery-cloud-sdk
                    :details (-> (:details (mt/db))
                                 (assoc :project-id "bigquery-public-data"
                                        :dataset-filters-type "inclusion"
                                        :dataset-filters-patterns "bls_qcew"))}]
      (mt/with-db db
        (let [orig-describe-dataset-fields-reducible @#'bigquery/describe-dataset-fields-reducible]
          (testing "describe-fields queries tables on demand"
            (let [invocation-count (atom 0)]
              (with-redefs [bigquery/num-table-partitions 4
                            bigquery/describe-dataset-fields-reducible
                            (fn [& args]
                              (swap! invocation-count inc)
                              (apply orig-describe-dataset-fields-reducible args))]
                (is (not= [] (into [] (take 10) (driver/describe-fields :bigquery-cloud-sdk (mt/db)))))
                (is (= 1 @invocation-count)))))
          (testing "describe-fields correctly partitions tables for a reducible result"
            (let [invocation-count (atom 0)]
              (with-redefs [bigquery/num-table-partitions 4
                            bigquery/describe-dataset-fields-reducible
                            (fn [& args]
                              (swap! invocation-count inc)
                              (apply orig-describe-dataset-fields-reducible args))]
                (is (<= 22000 (count (into [] (driver/describe-fields :bigquery-cloud-sdk (mt/db))))))
                (is (<= 20 @invocation-count))))))))))

(deftest sync-views-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (mt/with-temp-test-data [["categories"
                              [{:field-name "name" :base-type :type/Text}]
                              [["Asian"]
                               ["Burger"]]]
                             ["venues"
                              [{:field-name "name" :base-type :type/Text}
                               {:field-name "category_id" :base-type :type/Integer}]
                              [["Red Medicine" 1]
                               ["Stout Burgers & Beers" 2]
                               ["The Apple Pan" 2]]]]
      (let [view-name (format "view_%s" (mt/random-name))]
        (doseq [sql [(format (str "CREATE VIEW `%s.%s` AS "
                                  "SELECT v.id AS id, v.name AS venue_name, c.name AS category_name "
                                  "FROM `%s.%s.venues` v "
                                  "LEFT JOIN `%s.%s.categories` c "
                                  "ON v.category_id = c.id "
                                  "ORDER BY v.id ASC "
                                  "LIMIT 3")
                             (get-test-data-name)
                             view-name
                             (bigquery.tx/project-id)
                             (get-test-data-name)
                             (bigquery.tx/project-id)
                             (get-test-data-name))]]
          (bigquery.tx/execute! sql))
        (is (contains? (:tables (driver/describe-database :bigquery-cloud-sdk (mt/db)))
                       {:schema (get-test-data-name) :name view-name :database_require_filter false})
            "`describe-database` should see the view")
        (is (= [{:name "id", :database-type "INTEGER" :base-type :type/Integer :database-position 0 :database-partitioned false :table-name view-name :table-schema (get-test-data-name)}
                {:name "venue_name", :database-type "STRING" :base-type :type/Text :database-position 1 :database-partitioned false :table-name view-name :table-schema (get-test-data-name)}
                {:name "category_name", :database-type "STRING" :base-type :type/Text :database-position 2 :database-partitioned false :table-name view-name :table-schema (get-test-data-name)}]
               (into [] (driver/describe-fields :bigquery-cloud-sdk (mt/db) {:table-names [view-name], :schema-names [(get-test-data-name)]})))
            "`describe-fields` should see the fields in the view")
        (sync/sync-database! (mt/db) {:scan :schema})

        (testing "describe-database"
          (qp.store/with-metadata-provider (mt/id)
            (is (= #{{:schema (get-test-data-name)
                      :name view-name
                      :database_require_filter false}}
                   (into #{}
                         (filter (comp #{view-name} :name))
                         (:tables (driver/describe-database :bigquery-cloud-sdk (mt/db))))))))

        (testing "We should be able to run queries against the view (#3414)"
          (is (= [[1 "Red Medicine" "Asian"]
                  [2 "Stout Burgers & Beers" "Burger"]
                  [3 "The Apple Pan" "Burger"]]
                 (mt/rows
                  (mt/run-mbql-query nil
                    {:source-table (mt/id view-name)
                     :order-by     [[:asc (mt/id view-name :id)]]})))))))))

(deftest sync-materialized-view-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (mt/dataset
      (tx/transformed-dataset-definition
       (str "mat-views-" (u.random/random-name))
       (data.impl/resolve-dataset-definition *ns* 'attempted-murders))
      (mt/db)
      (mt/with-model-cleanup [:model/Table]
        (let [view-name "mv_test_materialized_view"]
          (try
            (doseq [sql [(format "CREATE MATERIALIZED VIEW %s AS (
                                  SELECT num_crows, COUNT(id) as cnt FROM %s GROUP BY num_crows);"
                                 (fmt-table-name view-name)
                                 (fmt-table-name "attempts"))]]
              (bigquery.tx/execute! sql))
            (sync/sync-database! (mt/db) {:scan :schema})
            (testing "describe-database"
              (qp.store/with-metadata-provider (mt/id)
                (is (= #{{:schema (get-test-data-name)
                          :name view-name
                          :database_require_filter false}}
                       (into #{}
                             (filter (comp #{view-name} :name))
                             (:tables (driver/describe-database :bigquery-cloud-sdk (mt/db))))))))

            (testing "We should be able to run queries against the view (#3414)"
              (is (= [[1 3] [2 1] [3 3]]
                     (mt/rows
                      (mt/run-mbql-query nil
                        {:source-table (mt/id view-name)
                         :order-by     [[:asc (mt/id view-name :num_crows)]]
                         :limit        3})))))
            (finally
              (drop-mv-if-exists! view-name))))))))

(mt/defdataset nested-records
  [["records"
    [{:field-name     "name"
      :base-type      :type/Text
      :effective-type :type/Text}
     {:field-name     "r"
      :base-type      :type/Dictionary
      :nested-fields  [{:field-name     "a"
                        :base-type      :type/Integer}
                       {:field-name     "b"
                        :base-type      :type/Text}
                       {:field-name     "rr"
                        :base-type      :type/Dictionary
                        :nested-fields  [{:field-name "aa"
                                          :base-type :type/Integer}]}]}]
    [["foo" {"a" 1 "b" "a" "rr" {"aa" 10}}]
     ["bar" {"a" 2 "b" "b"}]
     ["baz" {"a" 3 "b" "c"}]]]])

(deftest sync-nested-fields-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (mt/dataset
      nested-records
      (let [database (driver/describe-database :bigquery-cloud-sdk (mt/db))
            table (first (:tables database))]
        (is (=? {:name "records"} table))
        (is (=? [{:name "id"}
                 {:name "name"}
                 {:name "r"
                  :database-type "RECORD",
                  :base-type :type/Dictionary,
                  :database-position 2
                  :nested-fields [{:name "a",
                                   :database-type "INTEGER",
                                   :base-type :type/Integer,
                                   :database-position 2,
                                   :nfc-path ["r"]}
                                  {:name "b",
                                   :database-type "STRING",
                                   :base-type :type/Text,
                                   :database-position 2,
                                   :nfc-path ["r"]}
                                  {:name "rr",
                                   :database-type "RECORD",
                                   :base-type :type/Dictionary,
                                   :database-position 2,
                                   :nfc-path ["r"],
                                   :nested-fields
                                   [{:name "aa",
                                     :database-type "INTEGER",
                                     :base-type :type/Integer,
                                     :database-position 2,
                                     :nfc-path ["r" "rr"]}]}]}]
                (walk/postwalk
                 (fn [n]
                   (if (set? n)
                     (sort-by :name n)
                     n))
                 (into [] (driver/describe-fields :bigquery-cloud-sdk (mt/db) {:table-names [(:name table)]})))))))))

(deftest query-nested-fields-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (mt/dataset
      nested-records
      (is (= {:columns ["r.a" "r.b" "r.rr.aa" "r.rr"]
              :rows [[1 "a" 10 {:aa 10}] [2 "b" nil nil] [3 "c" nil nil]]}
             (mt/rows+column-names
              (mt/run-mbql-query records
                {:fields [(mt/id :records :r :a)
                          (mt/id :records :r :b)
                          (mt/id :records :r :rr :aa)
                          (mt/id :records :r :rr)]})))))))

(deftest sync-table-with-required-filter-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (mt/with-temp-test-data []
      (testing "tables that require a partition filters are synced correctly"
        (mt/with-model-cleanup [:model/Table]
          (let [table-name->is-filter-required? {"partition_by_range"              true
                                                 "partition_by_time"               true
                                                 "partition_by_ingestion_time"     true
                                                 "partition_by_range_not_required" false
                                                 "not_partitioned"                 false}]
            (try
              (doseq [sql [(format "CREATE TABLE %s (customer_id INT64)
                                    PARTITION BY RANGE_BUCKET(customer_id, GENERATE_ARRAY(0, 100, 10))
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name "partition_by_range"))
                           (format "CREATE TABLE %s (transaction_id INT64, transaction_time TIMESTAMP)
                                    PARTITION BY DATE(transaction_time)
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name "partition_by_time"))
                           (format "CREATE TABLE %s (transaction_id INT64)
                                    PARTITION BY _PARTITIONDATE
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name "partition_by_ingestion_time"))
                           (format "CREATE TABLE %s (customer_id INT64, transaction_date DATE)
                                    PARTITION BY RANGE_BUCKET(customer_id, GENERATE_ARRAY(0, 100, 10))
                                    OPTIONS (require_partition_filter = FALSE);"
                                   (fmt-table-name "partition_by_range_not_required"))
                           (format "CREATE TABLE %s (transaction_id INT64);"
                                   (fmt-table-name "not_partitioned"))]]
                (bigquery.tx/execute! sql))
              (sync/sync-database! (mt/db) {:scan :schema})

              (testing "describe-database"
                (qp.store/with-metadata-provider (mt/id)
                  (is (= #{{:schema (get-test-data-name)
                            :name "partition_by_ingestion_time",
                            :database_require_filter true}
                           {:schema (get-test-data-name), :name "partition_by_time", :database_require_filter true}
                           {:schema (get-test-data-name), :name "partition_by_range", :database_require_filter true}
                           {:schema (get-test-data-name),
                            :name "partition_by_range_not_required",
                            :database_require_filter false}}
                         (into #{}
                               (filter (comp #{"partition_by_range"
                                               "partition_by_time"
                                               "partition_by_ingestion_time"
                                               "partition_by_range_not_required"
                                               "partition_by_ingestion_time_not_required"} :name))
                               (:tables (driver/describe-database :bigquery-cloud-sdk (mt/db))))))))

              (testing "tables that require a filter are correctly identified"
                (is (= table-name->is-filter-required?
                       (t2/select-fn->fn :name :database_require_filter :model/Table
                                         :name [:in (keys table-name->is-filter-required?)]))))

              (testing "partitioned fields are correctly identified"
                (is (= {["not_partitioned"                 "transaction_id"]   false
                        ["partition_by_range_not_required" "customer_id"]      true
                        ["partition_by_range_not_required" "transaction_date"] false
                        ["partition_by_range"              "customer_id"]      true
                        ["partition_by_ingestion_time"     "transaction_id"]   false
                        ["partition_by_ingestion_time"     "_PARTITIONTIME"]   true
                        ["partition_by_ingestion_time"     "_PARTITIONDATE"]   true
                        ["partition_by_time"               "transaction_time"] true
                        ["partition_by_time"               "transaction_id"]   false}
                       (->> (t2/query {:select [[:table.name :table_name] [:field.name :field_name] :field.database_partitioned]
                                       :from   [[:metabase_field :field]]
                                       :join   [[:metabase_table :table] [:= :field.table_id :table.id]]
                                       :where  [:and [:= :table.db_id (mt/id)]
                                                [:in :table.name (keys table-name->is-filter-required?)]]})
                            (map (fn [{:keys [table_name field_name database_partitioned]}]
                                   [[table_name field_name] database_partitioned]))
                            (into {})))))

              (finally
                (doall (map drop-table-if-exists! (keys table-name->is-filter-required?)))
                nil))))))))

(deftest full-sync-partitioned-table-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (mt/with-temp-test-data []
      (testing "Partitioned tables that require a partition filter can be synced"
        (mt/with-model-cleanup [:model/Table]
          (let [table-names  ["partition_by_range" "partition_by_time" "partition_by_datetime"
                              "partition_by_ingestion_time" "partition_by_ingestion_time_not_required"]
                mv-names     ["mv_partition_by_datetime" "mv_partition_by_range"]]
            (try
              (doseq [sql [(format "CREATE TABLE %s (customer_id INT64)
                                    PARTITION BY RANGE_BUCKET(customer_id, GENERATE_ARRAY(0, 100, 10))
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name "partition_by_range"))
                           (format "INSERT INTO %s (customer_id)
                                    VALUES (1), (2), (3);"
                                   (fmt-table-name "partition_by_range"))
                           (format "CREATE MATERIALIZED VIEW %s AS
                                    SELECT customer_id + 41 as vip_customer FROM %s WHERE customer_id = 1;"
                                   (fmt-table-name "mv_partition_by_range")
                                   (fmt-table-name "partition_by_range"))
                           (format "CREATE TABLE %s (company STRING, founded DATETIME)
                                    PARTITION BY DATE(founded)
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name "partition_by_datetime"))
                           (format "INSERT INTO %s (company, founded)
                                    VALUES ('Metabase', DATETIME('2014-10-10 00:00:00')),
                                    ('Tesla', DATETIME('2003-07-01 00:00:00')),
                                    ('Apple', DATETIME('1976-04-01 00:00:00'));"
                                   (fmt-table-name "partition_by_datetime"))
                           (format "CREATE MATERIALIZED VIEW %s AS
                                    SELECT company AS ev_company FROM %s WHERE founded = DATETIME('2003-07-01 00:00:00');"
                                   (fmt-table-name "mv_partition_by_datetime")
                                   (fmt-table-name "partition_by_datetime"))
                           (format "CREATE TABLE %s (name STRING, birthday TIMESTAMP)
                                    PARTITION BY DATE(birthday)
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name "partition_by_time"))
                           (format "INSERT INTO %s (name, birthday)
                                    VALUES ('Ngoc', TIMESTAMP('1998-04-17 00:00:00+00:00')),
                                    ('Quang', TIMESTAMP('1999-04-17 00:00:00+00:00')),
                                    ('Khuat', TIMESTAMP('1997-04-17 00:00:00+00:00'));"
                                   (fmt-table-name "partition_by_time"))
                           (format "CREATE TABLE %s (is_awesome BOOL)
                                    PARTITION BY _PARTITIONDATE
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name "partition_by_ingestion_time"))
                           (format "INSERT INTO %s (is_awesome)
                                    VALUES (true), (false);"
                                   (fmt-table-name "partition_by_ingestion_time"))
                           (format "CREATE TABLE %s (is_opensource BOOL)
                                    PARTITION BY _PARTITIONDATE;"
                                   (fmt-table-name "partition_by_ingestion_time_not_required"))
                           (format "INSERT INTO %s (is_opensource)
                                    VALUES (true), (false);"
                                   (fmt-table-name "partition_by_ingestion_time_not_required"))]]
                (bigquery.tx/execute! sql))
              (sync/sync-database! (mt/db))
              (let [table-ids     (t2/select-pks-vec :model/Table :db_id (mt/id) :name [:in (concat mv-names table-names)])
                    all-field-ids (t2/select-pks-vec :model/Field :table_id [:in table-ids])]
                (testing "all fields are fingerprinted"
                  (is (every? some? (t2/select-fn-vec :fingerprint :model/Field :id [:in all-field-ids]))))
                (testing "Field values are correctly synced"
                  ;; Manually activate Field values since they are not created during sync (#53387)
                  (doseq [field (t2/select :model/Field :id [:in all-field-ids])]
                    (field-values/get-or-create-full-field-values! field))
                  (is (= {"customer_id"   #{1 2 3}
                          "vip_customer"  #{42}
                          "name"          #{"Khuat" "Quang" "Ngoc"}
                          "company"       #{"Metabase" "Tesla" "Apple"}
                          "ev_company"    #{"Tesla"}
                          "is_awesome"    #{true false}
                          "is_opensource" #{true false}}
                         (->> (t2/query {:select [[:field.name :field-name] [:fv.values :values]]
                                         :from   [[:metabase_field :field]]
                                         :join   [[:metabase_fieldvalues :fv] [:= :field.id :fv.field_id]]
                                         :where  [:and [:in :field.table_id table-ids]
                                                  [:in :field.name ["customer_id" "vip_customer" "name" "is_awesome" "is_opensource" "company" "ev_company"]]]})
                              (map #(update % :values (comp set json/decode)))
                              (map (juxt :field-name :values))
                              (into {}))))))

              (testing "for ingestion time partitioned tables, we should sync the pseudocolumn _PARTITIONTIME and _PARTITIONDATE"
                (let [ingestion-time-partitioned-table-id (t2/select-one-pk :model/Table :db_id (mt/id)
                                                                            :name "partition_by_ingestion_time_not_required")]
                  (is (=? [{:name           "_PARTITIONTIME"
                            :database_type "TIMESTAMP"
                            :base_type     :type/DateTimeWithLocalTZ
                            :database_position 1}
                           {:name           "_PARTITIONDATE"
                            :database_type "DATE"
                            :base_type     :type/Date
                            :database_position 2}]
                          (t2/select :model/Field :table_id ingestion-time-partitioned-table-id
                                     :database_partitioned true {:order-by [[:name :desc]]}))))
                (testing "and query this table should return the column pseudocolumn as well"
                  (is (malli=
                       [:tuple :boolean ms/TemporalString ms/TemporalString]
                       (first (mt/rows (mt/run-mbql-query partition_by_ingestion_time_not_required {:limit 1})))))))
              (finally
                (doall (map drop-table-if-exists! table-names))
                (doall (map drop-mv-if-exists! mv-names))
                nil))))))))

(deftest sync-update-require-partition-option-test
  (mt/test-driver :bigquery-cloud-sdk
    (mt/with-temp-test-data []
      (testing "changing the partition option should be updated during sync"
        (mt/with-model-cleanup [:model/Table]
          (let [table-name "partitioned_table"]
            (try
              (bigquery.tx/execute! (format "CREATE TABLE %s (customer_id INT64)
                                             PARTITION BY RANGE_BUCKET(customer_id, GENERATE_ARRAY(0, 100, 10));"
                                            (fmt-table-name table-name)))
              (testing "sanity check that it's not required at first"
                (sync/sync-database! (mt/db) {:scan :schema})
                (is (false? (t2/select-one-fn :database_require_filter :model/Table :name table-name))))
              (testing "sync should update require filter and set it to true"
                (bigquery.tx/execute! (format "ALTER TABLE IF EXISTS %s
                                               SET OPTIONS(require_partition_filter = true);"
                                              (fmt-table-name table-name)))
                (sync/sync-database! (mt/db) {:scan :schema})
                (is (true? (t2/select-one-fn :database_require_filter :model/Table :name table-name :db_id (mt/id)))))
              (finally
                (drop-table-if-exists! table-name)))))))))

(deftest search-field-from-table-requires-a-filter-test
  (testing "#40673"
    (mt/test-driver :bigquery-cloud-sdk
      (mt/with-temp-test-data []
        (mt/with-model-cleanup [:model/Table]
          (let [partitioned-table "fv_partitioned_table"]
            (try
              (doseq [sql [(format "CREATE TABLE %s (id INT64, category STRING)
                                    PARTITION BY _PARTITIONDATE
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name partitioned-table))
                           (format "INSERT INTO %s (id, category)
                                    VALUES (1, \"coffee\"), (2, \"tea\"), (3, \"matcha\");"
                                   (fmt-table-name partitioned-table))]]
                (bigquery.tx/execute! sql))
              (sync/sync-database! (mt/db) {:scan :schema})
              (let [category-field-id (mt/id :fv_partitioned_table :category)]
                (t2/update! :model/Field category-field-id {:has_field_values :search})
                (t2/delete! :model/FieldValues :field_id category-field-id)
                (= [["coffee"]]
                   (mt/user-http-request :crowberto :get 200 (format "/field/%d/search/%d" category-field-id category-field-id)
                                         :value "co")))
              (finally
                (drop-table-if-exists! partitioned-table)))))))))

(deftest chain-filter-with-fields-from-table-requires-a-filter-test
  (testing "#40673"
    (mt/test-driver
      :bigquery-cloud-sdk
      (mt/with-temp-test-data []
        (mt/with-model-cleanup [:model/Table]
          (let [category-table-name "cf_category"
                product-table-name  "cf_product"]
            (try
              (doseq [sql [(format "CREATE TABLE %s (id INT64, category STRING, PRIMARY KEY(id) NOT ENFORCED)
                                    PARTITION BY _PARTITIONDATE
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name category-table-name))
                           (format "INSERT INTO %s (id, category)
                                    VALUES (1, \"coffee\"), (2, \"tea\");"
                                   (fmt-table-name category-table-name))
                           (format "CREATE TABLE %s (id INT64, category_id INT64, name STRING)
                                    PARTITION BY _PARTITIONDATE
                                    OPTIONS (require_partition_filter = TRUE);"
                                   (fmt-table-name product-table-name))
                           (format "ALTER TABLE %1$s
                                    ADD CONSTRAINT fk_product_category_id FOREIGN KEY (category_id)
                                    REFERENCES %2$s(id) NOT ENFORCED;"
                                   (fmt-table-name product-table-name)
                                   (fmt-table-name category-table-name))
                           (format "INSERT INTO %s (id, category_id, name)
                                    VALUES (1, 1, \"Americano\"), (2, 1, \"Cold brew\"), (3, 2, \"Herbal\"), (4, 2, \"Oolong\");"
                                   (fmt-table-name product-table-name))]]
                (bigquery.tx/execute! sql))
              (sync/sync-database! (mt/db) {:scan :schema})
              ;; Fake fk relationship for bigquery because apparently fk on bigquery is not a thing.
              ;; We want this to test whether chain filter add a filter on partitioned fields from joned tables.
              (t2/update! :model/Field (mt/id :cf_product :category_id) {:fk_target_field_id (mt/id :cf_category :id)})
              (mt/with-temp
                [:model/Card          card-category {:database_id   (mt/id)
                                                     :table_id      (mt/id :cf_category)
                                                     :dataset_query (mt/mbql-query cf_category)}
                 :model/Card          card-product  {:database_id   (mt/id)
                                                     :table_id      (mt/id :cf_product)
                                                     :dataset_query (mt/mbql-query cf_product)}
                 :model/Dashboard     dashboard     {:parameters [{:name "Category"
                                                                   :slug "category"
                                                                   :id   "_CATEGORY_"
                                                                   :type :string/=}
                                                                  {:name "Product Name"
                                                                   :slug "Product name"
                                                                   :id   "_NAME_"
                                                                   :type :string/=}]}
                 :model/DashboardCard _dashcard     {:card_id            (:id card-category)
                                                     :dashboard_id       (:id dashboard)
                                                     :parameter_mappings [{:parameter_id "_CATEGORY_"
                                                                           :card_id      (:id card-category)
                                                                           :target       [:dimension (mt/$ids $cf_category.category)]}]}
                 :model/DashboardCard _dashcard     {:card_id            (:id card-product)
                                                     :dashboard_id       (:id dashboard)
                                                     :parameter_mappings [{:parameter_id "_NAME_"
                                                                           :card_id      (:id card-product)
                                                                           :target       [:dimension (mt/$ids $cf_product.name)]}]}]

                (testing "chained filter works"
                  (is (= {:has_more_values false
                          :values          [["Americano"] ["Cold brew"]]}
                         (mt/user-http-request :crowberto :get 200 (format "/dashboard/%d/params/%s/values?%s=%s"
                                                                           (:id dashboard) "_NAME_" "_CATEGORY_" "coffee")))))
                (testing "getting values works"
                  (is (= {:has_more_values false
                          :values          [["Americano"] ["Cold brew"] ["Herbal"] ["Oolong"]]}
                         (mt/user-http-request :crowberto :get 200 (format "/dashboard/%d/params/%s/values" (:id dashboard) "_NAME_")))))
                (testing "searching values works"
                  (is (= {:has_more_values false
                          :values          [["Oolong"]]}
                         (mt/user-http-request :crowberto :get 200 (format "/dashboard/%d/params/%s/search/oo" (:id dashboard) "_NAME_"))))))

              (finally
                (doseq [table-name [product-table-name category-table-name]]
                  (drop-table-if-exists! table-name))))))))))

(deftest query-integer-pk-or-fk-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "We should be able to query a Table that has a :type/Integer column marked as a PK or FK"
      (is (= [[1 "Plato Yeshua" "2014-04-01T08:30:00Z"]]
             (mt/rows (mt/user-http-request :rasta :post 202 "dataset" (mt/mbql-query users {:limit 1, :order-by [[:asc $id]]}))))))))

(deftest return-errors-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "If a Query fails, we should return the error right away (#14918)"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Error executing query"
           (qp/process-query
            {:database (mt/id)
             :type     :native
             :native   {:query "SELECT abc FROM 123;"}}))))))

(deftest project-id-override-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Querying a different project-id works"
      (mt/with-temp [:model/Database
                     {db-id :id :as temp-db}
                     {:engine  :bigquery-cloud-sdk
                      :details (-> (:details (mt/db))
                                   (assoc :project-id "bigquery-public-data"
                                          :dataset-filters-type "inclusion"
                                          :dataset-filters-patterns "chicago_taxi_trips"))}]
        (mt/with-db temp-db
          (testing " for sync"
            (sync/sync-database! temp-db {:scan :schema})
            (let [[tbl & more-tbl] (t2/select :model/Table :db_id db-id)]
              (is (some? tbl))
              (is (nil? more-tbl))
              (is (= "taxi_trips" (:name tbl)))
              ;; make sure all the fields for taxi_tips were synced
              (is (= 23 (t2/count :model/Field :table_id (u/the-id tbl))))))
          (testing " for querying"
            (is (= 23
                   (count (mt/first-row
                           (mt/run-mbql-query taxi_trips
                             {:filter [:= [:field (mt/id :taxi_trips :payment_type) nil]
                                       "Cash"]
                              :limit  1}))))))
          (testing " has project-id-from-credentials set correctly"
            (is (= (bigquery-project-id) (get-in temp-db [:details :project-id-from-credentials])))))))))

(deftest bigquery-specific-types-test
  (testing "Table with decimal types"
    (mt/test-driver
      :bigquery-cloud-sdk
      (mt/with-temp-test-data []
        (mt/db)
        (let [tbl-nm (format "table_%s" (mt/random-name))]
          (bigquery.tx/execute!
           "CREATE TABLE `%s.%s`
             (numeric_col NUMERIC,
             decimal_col DECIMAL,
             bignumeric_col BIGNUMERIC,
             bigdecimal_col BIGDECIMAL,
             string255_col STRING(255),
             bytes32_col BYTES(32),
             numeric29_col NUMERIC(29),
             decimal29_col DECIMAL(29),
             bignumeric32_col BIGNUMERIC(32),
             bigdecimal76_col BIGDECIMAL(76,38))
             AS SELECT NUMERIC '%s', DECIMAL '%s', BIGNUMERIC '%s', BIGDECIMAL '%s', 'hello',
             B'mybytes', NUMERIC '%s', DECIMAL '%s', BIGNUMERIC '%s', BIGDECIMAL '%s'"
           (get-test-data-name)
           tbl-nm
           numeric-val
           decimal-val
           bignumeric-val
           bigdecimal-val
           numeric-val
           decimal-val
           bignumeric-val
           bigdecimal-val)
          (is (contains? (:tables (driver/describe-database :bigquery-cloud-sdk (mt/db)))
                         {:schema (get-test-data-name) :name tbl-nm :database_require_filter false})
              "`describe-database` should see the table")
          (is (= [{:base-type :type/Decimal
                   :table-name tbl-nm
                   :table-schema (get-test-data-name)
                   :database-partitioned false
                   :database-position 0
                   :database-type "NUMERIC"
                   :name "numeric_col"}
                  {:base-type :type/Decimal
                   :table-name tbl-nm
                   :table-schema (get-test-data-name)
                   :database-partitioned false
                   :database-position 1
                   :database-type "NUMERIC"
                   :name "decimal_col"}
                  {:base-type :type/Decimal
                   :table-name tbl-nm
                   :table-schema (get-test-data-name)
                   :database-partitioned false
                   :database-position 2
                   :database-type "BIGNUMERIC"
                   :name "bignumeric_col"}
                  {:base-type :type/Decimal
                   :table-name tbl-nm
                   :table-schema (get-test-data-name)
                   :database-partitioned false
                   :database-position 3
                   :database-type "BIGNUMERIC"
                   :name "bigdecimal_col"}
                  {:name "string255_col",
                   :table-name tbl-nm
                   :table-schema (get-test-data-name)
                   :database-type "STRING",
                   :base-type :type/Text,
                   :database-partitioned false,
                   :database-position 4}
                  {:name "bytes32_col",
                   :table-name tbl-nm,
                   :table-schema (get-test-data-name),
                   :database-type "BYTES",
                   :base-type :type/*,
                   :database-partitioned false,
                   :database-position 5}
                  {:name "numeric29_col",
                   :table-name tbl-nm,
                   :table-schema (get-test-data-name),
                   :database-type "NUMERIC",
                   :base-type :type/Decimal,
                   :database-partitioned false,
                   :database-position 6}
                  {:name "decimal29_col",
                   :table-name tbl-nm,
                   :table-schema (get-test-data-name),
                   :database-type "NUMERIC",
                   :base-type :type/Decimal,
                   :database-partitioned false,
                   :database-position 7}
                  {:name "bignumeric32_col",
                   :table-name tbl-nm
                   :table-schema (get-test-data-name)
                   :database-type "BIGNUMERIC",
                   :base-type :type/Decimal,
                   :database-partitioned false,
                   :database-position 8}
                  {:name "bigdecimal76_col",
                   :table-name tbl-nm
                   :table-schema (get-test-data-name)
                   :database-type "BIGNUMERIC",
                   :base-type :type/Decimal,
                   :database-partitioned false,
                   :database-position 9}]
                 (into [] (driver/describe-fields :bigquery-cloud-sdk (mt/db) {:table-names [tbl-nm] :schema-names [(get-test-data-name)]})))
              "`describe-fields` should see the fields in the table")
          (sync/sync-database! (mt/db) {:scan :schema})
          (testing "We should be able to run queries against the table"
            (doseq [[col-nm param-v] [[:numeric_col (bigdec numeric-val)]
                                      [:decimal_col (bigdec decimal-val)]
                                      [:bignumeric_col (bigdec bignumeric-val)]
                                      [:bigdecimal_col (bigdec bigdecimal-val)]]]
              (testing (format "filtering against %s" col-nm))
              (is (= 1
                     (-> (mt/first-row
                          (mt/run-mbql-query nil
                            {:source-table (mt/id tbl-nm)
                             :aggregation  [[:count]]
                             :parameters   [{:name   col-nm
                                             :type   :number/=
                                             :target [:field (mt/id tbl-nm col-nm)]
                                             :value  [param-v]}]}))
                         first))))))))))

(deftest sync-table-with-array-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (testing "Tables with RECORD and ARRAY (REPEATED) columns can be synced successfully"
      (mt/with-temp-test-data []
        (let [tbl-nm (format "table_array_type_%s" (mt/random-name))]
          (doseq [sql [(format "CREATE TABLE `%s.%s` AS SELECT 1 AS int_col,
                                GENERATE_ARRAY(1,10) AS array_col,
                                STRUCT('Sam' AS name) AS primary,
                                [STRUCT('Rudisha' AS name)] AS participants"
                               (get-test-data-name)
                               tbl-nm)]]
            (bigquery.tx/execute! sql))
          (is (= [{:name "int_col" :database-type "INTEGER" :base-type :type/Integer :database-position 0 :database-partitioned false :table-name tbl-nm :table-schema (get-test-data-name)}
                  {:name "array_col" :database-type "ARRAY" :base-type :type/Array :database-position 1 :database-partitioned false :table-name tbl-nm :table-schema (get-test-data-name)}
                  {:name "primary",
                   :table-name tbl-nm
                   :table-schema (get-test-data-name)
                   :database-type "RECORD",
                   :base-type :type/Dictionary,
                   :database-partitioned false,
                   :database-position 2,
                   :nested-fields
                   #{{:name "name",
                      :table-name tbl-nm
                      :table-schema (get-test-data-name)
                      :database-type "STRING",
                      :base-type :type/Text,
                      :nfc-path ["primary"],
                      :database-position 2}}
                   :visibility-type :details-only}
                  {:name "participants",
                   :table-name tbl-nm
                   :table-schema (get-test-data-name)
                   :database-type "ARRAY",
                   :base-type :type/Array,
                   :database-partitioned false,
                   :database-position 3}]
                 (into [] (driver/describe-fields :bigquery-cloud-sdk (mt/db) {:table-names [tbl-nm] :schema-names [(get-test-data-name)]})))
              "`describe-fields` should detect the correct base-type for array type columns"))))))

(deftest sync-inactivates-old-duplicate-tables
  (testing "If on the new driver, then downgrade, then upgrade again (#21981)"
    (mt/test-driver :bigquery-cloud-sdk
      (mt/dataset avian-singles
        (try
          (let [synced-tables (t2/select :model/Table :db_id (mt/id))]
            (is (= 2 (count synced-tables)))
            (t2/insert! :model/Table (map #(dissoc % :id :entity_id :schema) synced-tables))
            (sync/sync-database! (mt/db) {:scan :schema})
            (let [synced-tables (t2/select :model/Table :db_id (mt/id))]
              (is (partial= {true [{:name "messages"} {:name "users"}]
                             false [{:name "messages"} {:name "users"}]}
                            (-> (group-by :active synced-tables)
                                (update-vals #(sort-by :name %)))))))
          (finally (t2/delete! :model/Table :db_id (mt/id) :active false)))))))

(deftest retry-certain-exceptions-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [fake-execute-called (atom false)
          orig-fn             @#'bigquery/execute-bigquery]
      (testing "Retry functionality works as expected"
        (with-redefs [bigquery/execute-bigquery (fn [& args]
                                                  (if-not @fake-execute-called
                                                    (do (reset! fake-execute-called true)
                                                        ;; simulate a transient error being thrown
                                                        (throw (ex-info "Transient error" {:retryable? true})))
                                                    (apply orig-fn args)))]
          ;; run any other test that requires a successful query execution
          (table-rows-sample-test)
          ;; make sure that the fake exception was thrown, and thus the query execution was retried
          (is (true? @fake-execute-called)))))))

(deftest not-retry-cancellation-exception-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [fake-execute-called (atom false)
          orig-fn        @#'bigquery/execute-bigquery]
      (testing "Should not retry query on cancellation"
        (with-redefs [bigquery/execute-bigquery (fn [& args]
                                                  (if (not @fake-execute-called)
                                                    (do (reset! fake-execute-called true)
                                                        ;; Simulate a cancellation happening
                                                        (throw (ex-info "Query cancelled" {::bigquery/cancelled? true})))
                                                    (apply orig-fn args)))]
          (try
            (qp/process-query {:native {:query "SELECT CURRENT_TIMESTAMP() AS notRetryCancellationExceptionTest"} :database (mt/id)
                               :type     :native})
            ;; If no exception is thrown, then the test should fail
            (is false "Query should have failed")
            (catch clojure.lang.ExceptionInfo e
              ;; Verify exception as expected
              (is (= "Query cancelled" (.getMessage e)))
              ;; make sure that the fake exception was thrown
              (is (true? @fake-execute-called)))))))))

(defn- future-thread-names []
  ;; kinda hacky but we don't control this thread pool
  (into #{} (comp (map (fn [^Thread t] (.getName t)))
                  (filter #(str/includes? % "clojure-agent-send-off-pool")))
        (.keySet (Thread/getAllStackTraces))))

(deftest query-cancel-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "BigQuery queries can be canceled successfully"
      (mt/with-open-channels [canceled-chan (a/promise-chan)]
        (binding [bigquery/*page-size*     1000 ; set a relatively small pageSize
                  bigquery/*page-callback* (fn []
                                             (log/debug "*page-callback* called, sending cancel message")
                                             (a/>!! canceled-chan ::cancel))]
          (try
            ;; there's a race. Some data might be processed, and if so we get the partial result
            (mt/dataset test-data
              (let [query     (mt/query orders)
                    rows      (mt/rows
                               (binding [qp.pipeline/*canceled-chan* canceled-chan]
                                 (mt/process-query query)))
                    row-count (count rows)]
                (log/debugf "Loaded %d rows before BigQuery query was canceled" row-count)
                (testing "Somewhere between 0 and the size of the orders table rows were loaded before cancellation"
                  (is (< 0 row-count 10000)))))
            (catch clojure.lang.ExceptionInfo e
              (is (= "Query cancelled"
                     (ex-message e))))))))
    (testing "Cancel thread does not leak"
      (mt/dataset test-data
        (let [query        (assoc-in (mt/query orders) [:query :limit] 2)
              count-before (count (future-thread-names))]
          (dotimes [_ 10]
            (mt/process-query query))
          (let [count-after (count (future-thread-names))]
            (is (< count-after (+ count-before 5))
                "unbounded thread growth!")))))))

(deftest later-page-fetch-returns-nil-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "BigQuery queries which fail on later pages are caught properly"
      (let [page-counter (atom 3)
            orig-exec    @#'bigquery/reducible-bigquery-results
            wrap-result  (fn wrap-result [^TableResult result]
                           (proxy [TableResult] []
                             (getSchema [] (.getSchema result))
                             (getValues [] (.getValues result))
                             (hasNextPage [] (.hasNextPage result))
                             (getNextPage []
                               (if (zero? @page-counter)
                                 nil
                                 (wrap-result (.getNextPage result))))))]
        (with-redefs [bigquery/reducible-bigquery-results (fn [page & args]
                                                            (apply orig-exec (wrap-result page) args))]
          (binding [bigquery/*page-size*     10 ; small pages so there are several
                    bigquery/*page-callback* (fn []
                                               (let [pages (swap! page-counter #(max (dec %) 0))]
                                                 (log/debugf "*page-callback counting down: %d to go" pages)))]
            (mt/dataset test-data
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"Cannot get next page from BigQuery"
                   (mt/process-query (mt/query orders)))))))))))

(deftest later-page-fetch-throws-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "BigQuery queries which fail on later pages are caught properly"
      (let [count-before (count (future-thread-names))
            page-counter (atom 3)
            orig-exec    @#'bigquery/reducible-bigquery-results
            wrap-result  (fn wrap-result [^TableResult result]
                           (proxy [TableResult] []
                             (getSchema [] (.getSchema result))
                             (getValues [] (.getValues result))
                             (hasNextPage [] (.hasNextPage result))
                             (getNextPage []
                               (if (zero? @page-counter)
                                 (throw (ex-info "onoes BigQuery failed to fetch a later page" {}))
                                 (wrap-result (.getNextPage result))))))]
        (with-redefs [bigquery/reducible-bigquery-results (fn [page & args]
                                                            (apply orig-exec (wrap-result page) args))]
          (dotimes [_ 10]
            (reset! page-counter 3)
            (binding [bigquery/*page-size*     100 ; small pages so there are several
                      bigquery/*page-callback* (fn []
                                                 (let [pages (swap! page-counter #(max (dec %) 0))]
                                                   (log/debugf "*page-callback counting down: %d to go" pages)))]
              (mt/dataset test-data
                (is (thrown-with-msg? Exception #"onoes BigQuery failed to fetch a later page"
                                      (mt/process-query (mt/query orders))))))))
        (testing "no thread leaks"
          (let [count-after (count (future-thread-names))]
            (is (< count-after (+ count-before 5)))))))))

(deftest cancel-page-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (let [page-size 10
          max-rows 50000]
      (testing "Cancel happens after first page"
        (mt/with-open-channels [canceled-chan (a/promise-chan)]
          (binding [qp.pipeline/*canceled-chan* canceled-chan
                    bigquery/*page-size*     page-size
                    bigquery/*page-callback* (fn [] (a/put! canceled-chan true))]
            (mt/dataset test-data
              (is (thrown-with-msg?
                   Exception
                   #"Query cancelled"
                   (-> (mt/query orders {:query {:limit max-rows}})
                       mt/process-query))))))))))

(defn- synced-tables [db-attributes]
  (mt/with-temp [:model/Database db db-attributes]
    (sync/sync-database! db {:scan :schema})
    (t2/select :model/Table :db_id (u/the-id db))))

(deftest dataset-filtering-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Filtering BigQuery connections for datasets works as expected"
      (mt/db) ;; force the creation of one test dataset
      (mt/dataset avian-singles
        (mt/db) ;; force the creation of another test dataset
        (let [;; This test is implemented in this way to avoid having to create new datasets, and to avoid
              ;; syncing most of the tables in the test DB.
              dataset-ids (#'bigquery/list-datasets (-> (mt/db)
                                                        :details
                                                        (dissoc :dataset-filters-type
                                                                :dataset-filters-patterns)))
              ;; get the first 4 characters of each dataset-id. The first 4 characters are used because the first 3 are
              ;; often used for bigquery dataset names e.g. `v4_test_data`
              prefixes (->> dataset-ids
                            (map (fn [dataset-id]
                                   (apply str (take 4 dataset-id)))))
              include-prefix (first prefixes)
              exclude-prefixes (rest prefixes)
              ;; inclusion-patterns selects the first dataset
              inclusion-patterns (str include-prefix "*")
              ;; exclusion-patterns excludes every dataset with exclude prefixes. It would exclude all other datasets
              ;; except ones that match the include-prefix, except there could be other tests creating new datasets for
              ;; the same test DB while this test is running, so we can't guarantee that the include-prefix will match all the
              ;; datasets
              exclusion-patterns (str/join "," (map #(str % "*") (set exclude-prefixes)))]
          (testing " with an inclusion filter"
            (let [tables (synced-tables {:name    "BigQuery Test DB with dataset inclusion filters"
                                         :engine  :bigquery-cloud-sdk
                                         :details (-> (mt/db)
                                                      :details
                                                      (assoc :dataset-filters-type "inclusion"
                                                             :dataset-filters-patterns inclusion-patterns))})]
              (is (seq tables))
              (doseq [{dataset-id :schema} tables]
                (is (str/starts-with? dataset-id include-prefix)))))
          (testing " with an exclusion filter"
            (let [tables (synced-tables {:name    "BigQuery Test DB with dataset inclusion filters"
                                         :engine  :bigquery-cloud-sdk
                                         :details (-> (mt/db)
                                                      :details
                                                      (assoc :dataset-filters-type "exclusion"
                                                             :dataset-filters-patterns exclusion-patterns))})]
              (testing "\ncheck that all synced tables do not start with any of the exclude prefixes"
                (doseq [{dataset-id :schema} tables]
                  (is (not (some #(str/starts-with? dataset-id %) exclude-prefixes)))))
              (testing "\ncheck that the dataset with the include prefix is not excluded"
                (is (some #(str/starts-with? (:schema %) include-prefix) tables))))))))))

(deftest normalize-away-dataset-id-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Details should be normalized coming out of the DB, to switch hardcoded dataset-id to an inclusion filter"
      ;; chicken and egg problem; we need the temp DB ID in order to create temp tables, but the creation of this
      ;; temp DB will cause driver/normalize-db-details to fire
      (mt/with-temp [:model/Database db {:name    "Legacy BigQuery DB"
                                         :engine  :bigquery-cloud-sdk,
                                         :details {:dataset-id "my-dataset"
                                                   :service-account-json "{}"}}
                     :model/Table    table1 {:name "Table 1"
                                             :db_id (u/the-id db)}
                     :model/Table    table2 {:name "Table 2"
                                             :db_id (u/the-id db)}]
        (let [db-id      (u/the-id db)
              call-count (atom 0)
              orig-fn    @#'bigquery/convert-dataset-id-to-filters!]
          (with-redefs [bigquery/convert-dataset-id-to-filters! (fn [database dataset-id]
                                                                  (swap! call-count inc)
                                                                  (orig-fn database dataset-id))]
            ;; fetch the Database from app DB a few more times to ensure the normalization changes are only called once
            (doseq [_ (range 5)]
              (is (nil? (get-in (t2/select-one :model/Database :id db-id) [:details :dataset-id]))))
            ;; the convert-dataset-id-to-filters! fn should have only been called *once* (as a result of the select
            ;; that runs at the end of creating the temp object, above ^
            ;; it should have persisted the change that removes the dataset-id to the app DB, so the next time someone
            ;; queries the domain object, they should see that as having already been done
            ;; hence, assert it was not called anymore here
            (is (= 0 @call-count) "convert-dataset-id-to-filters! should not have been called any more times"))
          ;; now, so we need to manually update the temp DB again here, to force the "old" structure
          (let [updated? (pos? (t2/update! :model/Database db-id {:details {:dataset-id "my-dataset"}}))]
            (is updated?)
            (let [updated (t2/select-one :model/Database :id db-id)]
              (is (nil? (get-in updated [:details :dataset-id])))
              ;; the hardcoded dataset-id connection property should have now been turned into an inclusion filter
              (is (= "my-dataset" (get-in updated [:details :dataset-filters-patterns])))
              (is (= "inclusion" (get-in updated [:details :dataset-filters-type])))
              ;; and the existing tables should have been updated with that schema
              (is (= ["my-dataset" "my-dataset"]
                     (t2/select-fn-vec :schema :model/Table :id [:in [(u/the-id table1) (u/the-id table2)]]))))))))))

(deftest query-drive-external-tables
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Google Sheets external tables can be queried via BigQuery (#4179)"
      ;; link to the underlying Google sheet, which everyone in the Google domain should have edit permission on
      ;; https://docs.google.com/spreadsheets/d/1ETIY759w8Xd8ZXcL-IullMxWjKdO-sKSIUOfG1KYh8U/edit?usp=sharing
      ;; the service account to which our CI credentials are associated:
      ;;   metabase-ci@metabase-bigquery-ci.iam.gserviceaccount.com
      ;; was given View permission to this sheet (via the Drive UI), and was ALSO given BigQuery Data Viewer
      ;; permission in the BigQuery UI under the project (`metabase-bigquery-ci`), dataset (`google_drive_dataset`),
      ;; and table (`metabase_ci_bigquery_sheet`)
      (is (= [[1 "foo" "bar"]
              [2 "alice" "bob"]
              [3 "x" "y"]]
             (-> {:query
                  "SELECT * FROM `metabase-bigquery-ci.google_drive_dataset.metabase_ci_bigquery_sheet` ORDER BY `id`"}
                 mt/native-query
                 qp/process-query
                 mt/rows))))))

(deftest ^:parallel datetime-truncate-field-literal-form-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Field literal forms should get datetime-truncated correctly (#20806)"
      (let [query (mt/mbql-query nil
                    {:source-query {:native (str/join
                                             \newline
                                             ["SELECT date"
                                              "FROM unnest(generate_date_array('2021-01-01', '2021-01-15')) date"])}
                     :breakout    [[:field "date" {:temporal-unit :week, :base-type :type/Date}]]
                     :aggregation [[:count]]})]
        (mt/with-native-query-testing-context query
          (is (= [["2020-12-27T00:00:00Z" 2]
                  ["2021-01-03T00:00:00Z" 7]
                  ["2021-01-10T00:00:00Z" 6]]
                 (mt/rows
                  (qp/process-query query)))))))))

(defn- pretty-sql-lines [sql]
  (str/split-lines (driver/prettify-native-form :bigquery-cloud-sdk sql)))

(deftest ^:parallel format-sql-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "native queries are compiled and formatted without whitespace errors (#30676)"
      (is (= (->> ["SELECT"
                   "  COUNT(*) AS `count`"
                   "FROM"
                   (format "  `%s.venues`" (get-test-data-name))]
                  ;; re-format the SQL in case formatting has changed once we have the correct test db name in place.
                  str/join
                  pretty-sql-lines)
             (->> (mt/mbql-query venues {:aggregation [:count]})
                  qp.compile/compile-with-inline-parameters
                  :query
                  pretty-sql-lines))))))

(deftest fingerprint-and-bin-bigdecimal-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (mt/dataset
      (mt/dataset-definition
       "bigthings"
       ["bigthings"
        [{:field-name "bd" :base-type :type/Decimal}]
        [[12345678901234567890.1234567890M]
         [22345678901234567890.1234567890M]
         [32345678901234567890.1234567890M]]])

      ;; Must sync field values
      (sync/sync-database! (mt/db))
      (is (= "BIGNUMERIC"
             (t2/select-one-fn :database_type :model/Field :id (mt/id :bigthings :bd))))
      (is (= [[12000000000000000000M 1]
              [21000000000000000000M 1]
              [30000000000000000000M 1]]
             (mt/rows
              (mt/run-mbql-query bigthings
                {:aggregation [[:count]]
                 :breakout [[:field %bigthings.bd
                             {:type :type/Decimal
                              :binning {:strategy "default"}}]]})))))))

(deftest bigquery-process-stop-test
  (mt/test-driver
    :bigquery-cloud-sdk
    (sync/sync-database! (mt/db) {:scan :schema})
    (let [before-names (future-thread-names)]
      (doseq [:let [callbacks (atom 0)]
              [stop-tag stopper] [[:exception #(throw (Exception. "My Exception"))]
                                  [:cancelled #(a/>!! qp.pipeline/*canceled-chan* true)]]
              [tag callback] [[:initial-query stopper]
                              [:during-page #(when (>= (swap! callbacks inc) 2)
                                               (stopper))]]]
        (testing (format "%s %s" tag stop-tag)
          (reset! callbacks 0)
          (binding [bigquery/*page-callback* callback
                    bigquery/*page-size* 10]
            (let [query  {:database (mt/id)
                          :type "native"
                          :native {:query (format "select * from `%s.orders` limit 100" (get-test-data-name))}}
                  result (mt/user-http-request :crowberto :post 202 "dataset" query)]
              (is (= "failed" (:status result)))
              (is (= (if (= :cancelled stop-tag) "Query cancelled" "My Exception")
                     (:error result)))))))
      (is (< (count before-names) (+ (count (future-thread-names)) 5))))))

(deftest alternate-host-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Alternate BigQuery host can be configured"
      (mt/with-temp [:model/Database {:as temp-db}
                     {:engine  :bigquery-cloud-sdk
                      :details (-> (:details (mt/db))
                                   (assoc :host "bigquery.example.com"))}]
        (let [client (#'bigquery/database-details->client (:details temp-db))]
          (is (= "bigquery.example.com"
                 (.getHost (.getOptions client)))
              "BigQuery client should be configured with alternate host"))))))

(deftest user-agent-is-set-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "User agent is set for bigquery requests"
      (let [client (#'bigquery/database-details->client (:details (mt/db)))
            mb-version (:tag config/mb-version-info)
            run-mode   (name config/run-mode)
            user-agent (format "Metabase/%s (GPN:Metabase; %s)" mb-version run-mode)]
        (is (= user-agent
               (-> client .getOptions .getUserAgent)))))))

(deftest timestamp-precision-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [sql (str "select"
                   " timestamp '2024-12-11 16:23:55.123456 UTC' col_timestamp,"
                   " datetime  '2024-12-11T16:23:55.123456' col_datetime")
          query {:database (mt/id)
                 :type :native
                 :native {:query sql}}]
      (is (=? [["2024-12-11T16:23:55.123456Z" #"2024-12-11T16:23:55.123456.*"]]
              (-> (qp/process-query query)
                  mt/rows))))))
