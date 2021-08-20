(ns metabase.driver.bigquery-cloud-sdk-test
  (:require [clojure.test :refer :all]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver :as driver]
            [metabase.driver.bigquery-cloud-sdk :as bigquery]
            [metabase.models :refer [Database Field Table]]
            [metabase.query-processor :as qp]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.test.data.bigquery-cloud-sdk :as bigquery.tx]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]))

(deftest can-connect?-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [db-details (:details (mt/db))
          fake-ds-id "definitely-not-a-real-dataset-no-way-no-how"]
      (testing "can-connect? returns true in the happy path"
        (is (true? (driver/can-connect? :bigquery-cloud-sdk db-details))))
      (testing "can-connect? returns false for bogus dataset-id"
        (is (false? (driver/can-connect? :bigquery-cloud-sdk (assoc db-details :dataset-id fake-ds-id)))))
      (testing "can-connect? returns true for a valid dataset-id even with no tables"
        (with-redefs [bigquery/list-tables (fn [& _]
                                             [])]
          (is (true? (driver/can-connect? :bigquery-cloud-sdk db-details))))))))

(deftest table-rows-sample-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "without worrying about pagination"
      (is (= [[1 "Red Medicine"]
              [2 "Stout Burgers & Beers"]
              [3 "The Apple Pan"]
              [4 "Wurstküche"]
              [5 "Brite Spot Family Restaurant"]]
             (->> (metadata-queries/table-rows-sample (Table (mt/id :venues))
                    [(Field (mt/id :venues :id))
                     (Field (mt/id :venues :name))]
                    (constantly conj))
                  (sort-by first)
                  (take 5)))))

   ;; the initial dataset isn't realized until it's used the first time. because of that,
   ;; we don't care how many pages it took to load this dataset above. it will be a large
   ;; number because we're just tracking the number of times `get-query-results` gets invoked.
   (testing "with pagination"
     (let [pages-retrieved (atom 0)
           page-callback   (fn [] (swap! pages-retrieved inc))]
       (with-bindings {#'bigquery/*max-results-per-page*  25
                       #'bigquery/*page-callback*         page-callback
                       ;; for this test, set timeout to 0 to prevent setting it
                       ;; so that the "fast" query path can be used (so that the max-results-per-page actually takes
                       ;; effect); see com.google.cloud.bigquery.QueryRequestInfo.isFastQuerySupported
                       #'bigquery/*query-timeout-seconds* 0}
         (let [actual (->> (metadata-queries/table-rows-sample (Table (mt/id :venues))
                             [(Field (mt/id :venues :id))
                              (Field (mt/id :venues :name))]
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

(deftest db-timezone-id-test
  (mt/test-driver :bigquery-cloud-sdk
    (is (= "UTC"
           (tu/db-timezone-id)))))

(defn- do-with-view [f]
  (driver/with-driver :bigquery-cloud-sdk
    (let [view-name (name (munge (gensym "view_")))]
      (mt/with-temp-copy-of-db
        (try
          (bigquery.tx/execute!
           (str "CREATE VIEW `v3_test_data.%s` "
                "AS "
                "SELECT v.id AS id, v.name AS venue_name, c.name AS category_name "
                "FROM `%s.v3_test_data.venues` v "
                "LEFT JOIN `%s.v3_test_data.categories` c "
                "ON v.category_id = c.id "
                "ORDER BY v.id ASC "
                "LIMIT 3")
           view-name
           (bigquery.tx/project-id)
           (bigquery.tx/project-id))
          (f view-name)
          (finally
            (bigquery.tx/execute! "DROP VIEW IF EXISTS `v3_test_data.%s`" view-name)))))))

(defmacro ^:private with-view [[view-name-binding] & body]
  `(do-with-view (fn [~(or view-name-binding '_)] ~@body)))

(deftest sync-views-test
  (mt/test-driver :bigquery-cloud-sdk
    (with-view [view-name]
      (is (contains? (:tables (driver/describe-database :bigquery-cloud-sdk (mt/db)))
                     {:schema nil, :name view-name})
          "`describe-database` should see the view")
      (is (= {:schema nil
              :name   view-name
              :fields #{{:name "id", :database-type "INTEGER", :base-type :type/Integer, :database-position 0}
                        {:name "venue_name", :database-type "STRING", :base-type :type/Text, :database-position 1}
                        {:name "category_name", :database-type "STRING", :base-type :type/Text, :database-position 2}}}
             (driver/describe-table :bigquery-cloud-sdk (mt/db) {:name view-name}))
          "`describe-tables` should see the fields in the view")
      (sync/sync-database! (mt/db))
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
      (let [before-ms (System/currentTimeMillis)]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Error executing query"
             (qp/process-query
              {:database (mt/id)
               :type     :native
               :native   {:query "SELECT abc FROM 123;"}})))
        (testing "Should return the error *before* the query timeout"
          (let [duration-ms (- (System/currentTimeMillis) before-ms)]
            (is (< duration-ms (u/seconds->ms @#'bigquery/*query-timeout-seconds*)))))))))

(deftest project-id-override-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Querying a different project-id works"
      (mt/with-temp Database [temp-db {:engine  :bigquery-cloud-sdk
                                       :details (-> (:details (mt/db))
                                                    (assoc :project-id "bigquery-public-data"
                                                           :dataset-id "chicago_taxi_trips"))}]
        (mt/with-db temp-db
          (testing " for sync"
            (sync/sync-database! temp-db)
            (let [[tbl & more-tbl] (db/select Table :db_id (u/the-id temp-db))]
              (is (some? tbl))
              (is (nil? more-tbl))
              (is (= "taxi_trips" (:name tbl)))
              ;; make sure all the fields for taxi_tips were synced
              (is (= 23 (db/count Field :table_id (u/the-id tbl))))))
          (testing " for querying"
            (is (= ["67794e631648a002f88d4b7f3ab0bcb6a9ed306a"
                    "1d7ade2f592e1c98f5d34e9e1ef452fae2c76a65e1002a04d1f5262bb47aeb2060332673825208955ed5e35dab5a07b7f69ec1745fe209d4b9ad60560a9e9896"
                    "2014-01-12T00:45:00Z"
                    "2014-01-12T00:45:00Z"
                    0
                    0.0
                    17031062300
                    nil
                    6
                    nil
                    0.07
                    0.0
                    0.0
                    0.0
                    0.07
                    "Cash"
                    "Top Cab Affiliation"
                    41.9416281
                    -87.661443368
                    "POINT (-87.6614433685 41.9416281)"
                    nil
                    nil
                    nil]
                   (mt/first-row
                     (mt/run-mbql-query taxi_trips
                       {:filter [:= [:field (mt/id :taxi_trips :unique_key) nil]
                                    "67794e631648a002f88d4b7f3ab0bcb6a9ed306a"]}))))))))))
