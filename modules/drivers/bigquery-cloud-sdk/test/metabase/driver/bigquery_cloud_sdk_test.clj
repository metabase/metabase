(ns metabase.driver.bigquery-cloud-sdk-test
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.models :refer [Database Field Table]]
   [metabase.query-processor :as qp]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.bigquery-cloud-sdk :as bigquery.tx]
   [metabase.test.data.interface :as tx]
   [metabase.test.util.random :as tu.random]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan.db :as db]
   [toucan2.core :as t2])
  (:import
   (com.google.cloud.bigquery BigQuery)))

(set! *warn-on-reflection* true)

(def ^:private test-db-name (bigquery.tx/normalize-name :db "test_data"))

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
        (with-redefs [bigquery/list-tables (fn [& _]
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
             (->> (metadata-queries/table-rows-sample (db/select-one Table :id (mt/id :venues))
                    [(db/select-one Field :id (mt/id :venues :id))
                     (db/select-one Field :id (mt/id :venues :name))]
                    (constantly conj))
                  (sort-by first)
                  (take 5)))))

   ;; the initial dataset isn't realized until it's used the first time. because of that,
   ;; we don't care how many pages it took to load this dataset above. it will be a large
   ;; number because we're just tracking the number of times `get-query-results` gets invoked.
   (testing "with pagination"
     (let [pages-retrieved (atom 0)
           page-callback   (fn [] (swap! pages-retrieved inc))]
       (with-bindings {#'bigquery/*page-size*             25
                       #'bigquery/*page-callback*         page-callback}
         (let [actual (->> (metadata-queries/table-rows-sample (db/select-one Table :id (mt/id :venues))
                             [(db/select-one Field :id (mt/id :venues :id))
                              (db/select-one Field :id (mt/id :venues :name))]
                             (constantly conj))
                           (sort-by first)
                           (take 5))]
           (is (= [[1 "Red Medicine"]
                   [2 "Stout Burgers & Beers"]
                   [3 "The Apple Pan"]
                   [4 "Wurstküche"]
                   [5 "Brite Spot Family Restaurant"]]
                  actual))
           ;; the `(sort-by)` above will cause the entire resultset to be realized, so
           ;; we want to make sure that it really did retrieve 25 rows per request
           ;; this only works if the timeout has been temporarily set to 0 (see above)
           (is (= 4 @pages-retrieved))))))))

;; These look like the macros from metabase.query-processor-test.expressions-test
;; but conform to bigquery naming rules
(defn- calculate-bird-scarcity* [formula filter-clause]
  (mt/formatted-rows [2.0]
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

(defn- do-with-temp-obj [name-fmt-str create-args-fn drop-args-fn f]
  (driver/with-driver :bigquery-cloud-sdk
    (let [obj-name (format name-fmt-str (tu.random/random-name))]
      (mt/with-temp-copy-of-db
        (try
          (apply bigquery.tx/execute! (create-args-fn obj-name))
          (f obj-name)
          (finally
            (apply bigquery.tx/execute! (drop-args-fn obj-name))))))))

(defmacro with-view [[view-name-binding] & body]
  `(do-with-temp-obj "view_%s"
                     (fn [view-nm#] [(str "CREATE VIEW `%s.%s` AS "
                                          "SELECT v.id AS id, v.name AS venue_name, c.name AS category_name "
                                          "FROM `%s.%s.venues` v "
                                          "LEFT JOIN `%s.%s.categories` c "
                                          "ON v.category_id = c.id "
                                          "ORDER BY v.id ASC "
                                          "LIMIT 3")
                                     ~test-db-name
                                     view-nm#
                                     (bigquery.tx/project-id)
                                     ~test-db-name
                                     (bigquery.tx/project-id)
                                     ~test-db-name])
                     (fn [view-nm#] ["DROP VIEW IF EXISTS `%s.%s`" ~test-db-name view-nm#])
                     (fn [~(or view-name-binding '_)] ~@body)))

(def ^:private numeric-val "-1.2E20")
(def ^:private decimal-val "2.3E16")
(def ^:private bignumeric-val "-7.5E30")
(def ^:private bigdecimal-val "5.2E35")

(defn- bigquery-project-id []
  (-> (tx/db-test-env-var-or-throw :bigquery-cloud-sdk :service-account-json)
      bigquery.common/service-account-json->service-account-credential
      (.getProjectId)))

(defmacro with-numeric-types-table [[table-name-binding] & body]
  `(do-with-temp-obj "table_%s"
                     (fn [tbl-nm#] [(str "CREATE TABLE `%s.%s` AS SELECT "
                                         "NUMERIC '%s' AS numeric_col, "
                                         "DECIMAL '%s' AS decimal_col, "
                                         "BIGNUMERIC '%s' AS bignumeric_col, "
                                         "BIGDECIMAL '%s' AS bigdecimal_col")
                                    ~test-db-name
                                    tbl-nm#
                                    ~numeric-val
                                    ~decimal-val
                                    ~bignumeric-val
                                    ~bigdecimal-val])
                     (fn [tbl-nm#] ["DROP TABLE IF EXISTS `%s.%s`" ~test-db-name tbl-nm#])
                     (fn [~(or table-name-binding '_)] ~@body)))

(deftest sync-views-test
  (mt/test-driver :bigquery-cloud-sdk
    (with-view [#_:clj-kondo/ignore view-name]
      (is (contains? (:tables (driver/describe-database :bigquery-cloud-sdk (mt/db)))
                     {:schema test-db-name, :name view-name})
          "`describe-database` should see the view")
      (is (= {:schema test-db-name
              :name   view-name
              :fields #{{:name "id", :database-type "INTEGER", :base-type :type/Integer, :database-position 0}
                        {:name "venue_name", :database-type "STRING", :base-type :type/Text, :database-position 1}
                        {:name "category_name", :database-type "STRING", :base-type :type/Text, :database-position 2}}}
             (driver/describe-table :bigquery-cloud-sdk (mt/db) {:name view-name, :schema test-db-name}))
          "`describe-tables` should see the fields in the view")
      (sync/sync-database! (mt/db) {:scan :schema})
      (testing "We should be able to run queries against the view (#3414)"
        (is (= [[1 "Red Medicine" "Asian"]
                [2 "Stout Burgers & Beers" "Burger"]
                [3 "The Apple Pan" "Burger"]]
               (mt/rows
                 (mt/run-mbql-query nil
                   {:source-table (mt/id view-name)
                    :order-by     [[:asc (mt/id view-name :id)]]}))))))))

(deftest query-integer-pk-or-fk-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "We should be able to query a Table that has a :type/Integer column marked as a PK or FK"
      (is (= [["1" "Plato Yeshua" "2014-04-01T08:30:00Z"]]
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
      (mt/with-temp Database [{db-id :id :as temp-db}
                              {:engine  :bigquery-cloud-sdk
                               :details (-> (:details (mt/db))
                                            (assoc :project-id "bigquery-public-data"
                                                   :dataset-filters-type "inclusion"
                                                   :dataset-filters-patterns "chicago_taxi_trips"))}]
        (mt/with-db temp-db
          (testing " for sync"
            (sync/sync-database! temp-db {:scan :schema})
            (let [[tbl & more-tbl] (db/select Table :db_id db-id)]
              (is (some? tbl))
              (is (nil? more-tbl))
              (is (= "taxi_trips" (:name tbl)))
              ;; make sure all the fields for taxi_tips were synced
              (is (= 23 (db/count Field :table_id (u/the-id tbl))))))
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
    (with-numeric-types-table [#_:clj-kondo/ignore tbl-nm]
      (is (contains? (:tables (driver/describe-database :bigquery-cloud-sdk (mt/db)))
                     {:schema test-db-name, :name tbl-nm})
          "`describe-database` should see the table")
      (is (= {:schema test-db-name
              :name   tbl-nm
              :fields #{{:name "numeric_col", :database-type "NUMERIC", :base-type :type/Decimal, :database-position 0}
                        {:name "decimal_col", :database-type "NUMERIC", :base-type :type/Decimal, :database-position 1}
                        {:name "bignumeric_col"
                         :database-type "BIGNUMERIC"
                         :base-type :type/Decimal
                         :database-position 2}
                        {:name "bigdecimal_col"
                         :database-type "BIGNUMERIC"
                         :base-type :type/Decimal
                         :database-position 3}}}
            (driver/describe-table :bigquery-cloud-sdk (mt/db) {:name tbl-nm, :schema test-db-name}))
          "`describe-table` should see the fields in the table")
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
                    first))))))))

(deftest sync-table-with-array-test
  (testing "Tables with ARRAY (REPEATED) columns can be synced successfully"
    (do-with-temp-obj "table_array_type_%s"
      (fn [tbl-nm] ["CREATE TABLE `%s.%s` AS SELECT 1 AS int_col, GENERATE_ARRAY(1,10) AS array_col"
                    test-db-name
                    tbl-nm])
      (fn [tbl-nm] ["DROP TABLE IF EXISTS `%s.%s`" test-db-name tbl-nm])
      (fn [tbl-nm]
        (is (= {:schema test-db-name
                :name   tbl-nm
                :fields #{{:name "int_col", :database-type "INTEGER", :base-type :type/Integer, :database-position 0}
                          {:name "array_col", :database-type "INTEGER", :base-type :type/Array, :database-position 1}}}
               (driver/describe-table :bigquery-cloud-sdk (mt/db) {:name tbl-nm, :schema test-db-name}))
            "`describe-table` should detect the correct base-type for array type columns")))))

(deftest sync-inactivates-old-duplicate-tables
  (testing "If on the new driver, then downgrade, then upgrade again (#21981)"
    (mt/test-driver :bigquery-cloud-sdk
      (mt/dataset avian-singles
        (try
          (let [synced-tables (db/select Table :db_id (mt/id))]
            (is (= 2 (count synced-tables)))
            (db/insert-many! Table (map #(dissoc % :id :schema) synced-tables))
            (sync/sync-database! (mt/db) {:scan :schema})
            (let [synced-tables (db/select Table :db_id (mt/id))]
              (is (partial= {true [{:name "messages"} {:name "users"}]
                             false [{:name "messages"} {:name "users"}]}
                            (-> (group-by :active synced-tables)
                                (update-vals #(sort-by :name %)))))))
          (finally (db/delete! Table :db_id (mt/id) :active false)))))))

(deftest retry-certain-exceptions-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [fake-execute-called (atom false)
          orig-fn             @#'bigquery/execute-bigquery]
      (testing "Retry functionality works as expected"
        (with-redefs [bigquery/execute-bigquery (fn [^BigQuery client ^String sql parameters _ _]
                                                  (if-not @fake-execute-called
                                                    (do (reset! fake-execute-called true)
                                                        ;; simulate a transient error being thrown
                                                        (throw (ex-info "Transient error" {:retryable? true})))
                                                    (orig-fn client sql parameters nil nil)))]
          ;; run any other test that requires a successful query execution
          (table-rows-sample-test)
          ;; make sure that the fake exception was thrown, and thus the query execution was retried
          (is (true? @fake-execute-called)))))))

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
            (mt/dataset sample-dataset
              (let [rows      (mt/rows (mt/process-query (mt/query orders) {:canceled-chan canceled-chan}))
                    row-count (count rows)]
                (log/debugf "Loaded %d rows before BigQuery query was canceled" row-count)
                (testing "Somewhere between 0 and the size of the orders table rows were loaded before cancellation"
                  (is (< 0 row-count 10000)))))
            (catch clojure.lang.ExceptionInfo e
              (is (= (ex-message e) "Query cancelled")))))))))

(deftest global-max-rows-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "The limit middleware prevents us from fetching more pages than are necessary to fulfill query max-rows"
      (let [page-size          100
            max-rows           1000
            num-page-callbacks (atom 0)]
        (binding [bigquery/*page-size*     page-size
                  bigquery/*page-callback* (fn []
                                             (swap! num-page-callbacks inc))]
          (mt/dataset sample-dataset
            (let [rows (mt/rows (mt/process-query (mt/query orders {:query {:limit max-rows}})))]
              (is (= max-rows (count rows)))
              (is (= (/ max-rows page-size) @num-page-callbacks)))))))))

(defn- sync-and-assert-filtered-tables [database assert-table-fn]
  (mt/with-temp Database [db-filtered database]
    (sync/sync-database! db-filtered {:scan :schema})
    (doseq [table (db/select-one Table :db_id (u/the-id db-filtered))]
      (assert-table-fn table))))

(deftest dataset-filtering-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Filtering BigQuery connections for datasets works as expected"
      (testing " with an inclusion filter"
        (sync-and-assert-filtered-tables {:name    "BigQuery Test DB with dataset inclusion filters"
                                          :engine  :bigquery-cloud-sdk
                                          :details (-> (mt/db)
                                                       :details
                                                       (assoc :dataset-filters-type "inclusion"
                                                              :dataset-filters-patterns "a*,t*"))}
                                         (fn [{dataset-id :schema}]
                                           (is (not (contains? #{\a \t} (first dataset-id)))))))
      (testing " with an exclusion filter"
        (sync-and-assert-filtered-tables {:name    "BigQuery Test DB with dataset exclusion filters"
                                          :engine  :bigquery-cloud-sdk
                                          :details (-> (mt/db)
                                                       :details
                                                       (assoc :dataset-filters-type "exclusion"
                                                              :dataset-filters-patterns "v*"))}
          (fn [{dataset-id :schema}]
            (is (not= \v (first dataset-id)))))))))

(deftest normalize-away-dataset-id-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Details should be normalized coming out of the DB, to switch hardcoded dataset-id to an inclusion filter"
      ;; chicken and egg problem; we need the temp DB ID in order to create temp tables, but the creation of this
      ;; temp DB will cause driver/normalize-db-details to fire
      (mt/with-temp* [Database [db {:name    "Legacy BigQuery DB"
                                    :engine  :bigquery-cloud-sdk,
                                    :details {:dataset-id "my-dataset"
                                              :service-account-json "{}"}}]
                      Table    [table1 {:name "Table 1"
                                        :db_id (u/the-id db)}]
                      Table    [table2 {:name "Table 2"
                                        :db_id (u/the-id db)}]]
        (let [db-id      (u/the-id db)
              call-count (atom 0)
              orig-fn    @#'bigquery/convert-dataset-id-to-filters!]
          (with-redefs [bigquery/convert-dataset-id-to-filters! (fn [database dataset-id]
                                                                  (swap! call-count inc)
                                                                  (orig-fn database dataset-id))]
            ;; fetch the Database from app DB a few more times to ensure the normalization changes are only called once
            (doseq [_ (range 5)]
              (is (nil? (get-in (db/select-one Database :id db-id) [:details :dataset-id]))))
            ;; the convert-dataset-id-to-filters! fn should have only been called *once* (as a result of the select
            ;; that runs at the end of creating the temp object, above ^
            ;; it should have persisted the change that removes the dataset-id to the app DB, so the next time someone
            ;; queries the domain object, they should see that as having already been done
            ;; hence, assert it was not called anymore here
            (is (= 0 @call-count) "convert-dataset-id-to-filters! should not have been called any more times"))
          ;; now, so we need to manually update the temp DB again here, to force the "old" structure
          (let [updated? (db/update! Database db-id :details {:dataset-id "my-dataset"})]
            (is updated?)
            (let [updated (db/select-one Database :id db-id)]
              (is (nil? (get-in updated [:details :dataset-id])))
              ;; the hardcoded dataset-id connection property should have now been turned into an inclusion filter
              (is (= "my-dataset" (get-in updated [:details :dataset-filters-patterns])))
              (is (= "inclusion" (get-in updated [:details :dataset-filters-type])))
              ;; and the existing tables should have been updated with that schema
              (is (= ["my-dataset" "my-dataset"]
                     (t2/select-fn-vec :schema Table :id [:in [(u/the-id table1) (u/the-id table2)]]))))))))))

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

(deftest datetime-truncate-field-literal-form-test
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
